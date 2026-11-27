import { useSyncExternalStore } from 'react';
import { reportError } from '../lib/reportError';
declare const __LOG_BUILD_ID__: string;
export const BUILD_ID = typeof __LOG_BUILD_ID__ === 'string' ? __LOG_BUILD_ID__ : 'development';
interface PwaState { phase: 'preparing' | 'ready' | 'unavailable' | 'error'; message: string; update: boolean; dismissed: boolean; locked: boolean; reloadRequired: boolean }
let state: PwaState = { phase: 'preparing', message: 'Подготавливаем автономный режим…', update: false, dismissed: false, locked: false, reloadRequired: false };
const listeners = new Set<() => void>();
function set(patch: Partial<PwaState>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); }
export const usePwa = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
let registration: ServiceWorkerRegistration | undefined, started = false, applying = false, repairing = false;
let safety: () => Promise<{ safe: boolean; reason?: string }> = async () => ({ safe: false, reason: 'Дождитесь загрузки данных.' });
export function setUpdateSafety(check: typeof safety) { safety = check; }
function send(worker: ServiceWorker, message: object, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => { const channel = new MessageChannel(); const timer = window.setTimeout(() => { channel.port1.close(); reject(new Error('Service Worker не ответил. Повторите загрузку при доступной сети.')); }, timeout); channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); }; worker.postMessage(message, [channel.port2]); });
}
async function status() {
  if (repairing || state.reloadRequired) return false;
  if (registration?.waiting) set({ update: true });
  const worker = navigator.serviceWorker.controller;
  if (!worker) return false;
  try { const value = await send(worker, { type: 'LOG_STATUS' }), ready = value.ready && value.buildId === BUILD_ID; set(ready ? { phase: 'ready', message: 'Готово к автономной работе' } : { phase: 'error', message: 'Автономный кэш неполон или повреждён. Подключитесь к сети и восстановите автономный режим. Если уже опубликована другая сборка, потребуется обновление LOG.' }); worker.postMessage({ type: 'LOG_CLEANUP' }); return !!ready; }
  catch (cause) { reportError('Проверка автономной готовности', cause); set({ phase: 'error', message: 'Не удалось проверить автономный режим. Подключитесь к сети и повторите загрузку.' }); }
}
export async function startPwa() {
  if (started) return; started = true;
  if (!import.meta.env.PROD) { set({ phase: 'unavailable', message: 'Автономный режим проверяется в production-сборке.' }); return; }
  let available = false; try { available = !!navigator.serviceWorker; } catch { /* Some browser policies deny access to the container. */ }
  if (!window.isSecureContext || !available) { set({ phase: 'unavailable', message: 'Автономный режим недоступен в этом контексте. Для установки используйте HTTPS; дневник и локальное сохранение продолжают работать.' }); return; }
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'LOG_BUILD') event.ports[0]?.postMessage({ buildId: BUILD_ID });
    if (event.data?.type === 'LOG_PREPARE_UPDATE') { set({ locked: true }); void safety().then(value => event.ports[0]?.postMessage(value)).catch(() => event.ports[0]?.postMessage({ safe: false, reason: 'Не удалось подтвердить сохранность данных.' })); }
    if (event.data?.type === 'LOG_RELEASE_UPDATE') set({ locked: false });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) { location.reload(); return; }
    if (state.locked) { set({ reloadRequired: true, message: 'Обновление готово. Перезагрузите эту вкладку для продолжения.' }); return; }
    void status();
  });
  try {
    const scope = new URL(import.meta.env.BASE_URL, document.baseURI);
    const existing = await navigator.serviceWorker.getRegistration(scope.href);
    registration = existing?.scope === scope.href ? existing : await navigator.serviceWorker.register(new URL('sw.js', scope), { scope: scope.pathname, updateViaCache: 'none' });
    const watch = () => { const worker = registration?.installing; if (!worker) return; worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) set({ update: true, dismissed: false }); if (worker.state === 'activated') void status(); if (worker.state === 'redundant' && !navigator.serviceWorker.controller) set({ phase: 'error', message: 'Не удалось подготовить автономный кэш. Потребуется сеть и повторная загрузка.' }); }); };
    registration.addEventListener('updatefound', watch); watch(); await status();
    if (existing && navigator.onLine) void registration.update().catch(cause => reportError('Проверка обновления LOG.', cause));
    const refresh = () => { if (!document.hidden) { void registration?.update().catch(cause => reportError('Проверка обновления LOG.', cause)); void status(); } };
    document.addEventListener('visibilitychange', refresh); window.addEventListener('online', () => { refresh(); void repairPwa(); });
  } catch (cause) { reportError('Подготовка автономного режима', cause); set({ phase: 'error', message: 'Не удалось подготовить автономный режим. Подключитесь к сети и повторите загрузку; обычный дневник остаётся доступен.' }); }
}
export function dismissUpdate() { set({ dismissed: true }); }
export async function applyUpdate() {
  if (!registration?.waiting) { await retryPwa(); return; }
  const local = await safety(); if (!local.safe) { set({ message: local.reason ?? 'Сначала сохраните изменения.' }); return; }
  try { applying = true; const result = await send(registration.waiting, { type: 'LOG_APPLY_UPDATE' }); if (!result.ok) { applying = false; set({ locked: false, message: result.reason }); } }
  catch (cause) { applying = false; set({ locked: false, message: 'Обновление не применено. Закройте занятые вкладки и повторите попытку.' }); reportError('Применение обновления', cause); }
}
export async function repairPwa() {
  if (repairing || state.reloadRequired) return;
  const worker = navigator.serviceWorker?.controller;
  if (!worker) { registration = undefined; started = false; await startPwa(); return; }
  repairing = true; set({ phase: 'preparing', message: 'Восстанавливаем автономный режим. Запись тренировок продолжается…' });
  try { const value = await send(worker, { type: 'LOG_REPAIR' }, 30_000); if (!value.ok) throw new Error(value.reason ?? 'Не удалось восстановить ресурсы.'); }
  catch (cause) { reportError('Восстановление автономного режима', cause); set({ phase: 'error', message: 'Восстановление не завершено. Нужна сеть и доступная сборка этой версии; проверьте обновления и повторите попытку. Дневник и данные сохранены.' }); repairing = false; return; }
  repairing = false; await status();
}
export async function retryPwa() { if (registration) { try { await registration.update(); if (!(await status())) await repairPwa(); } catch (cause) { reportError('Повторная подготовка PWA', cause); set({ phase: 'error', message: 'Подготовка не завершена. Проверьте сеть и восстановите автономный режим.' }); } } else { started = false; await startPwa(); } }
