import type { DraftKind, RecoveryDraft } from '../domain/models';
import { createId } from '../domain/id';
let epoch = 'unopened';
const failed = new Set<string>();
const kinds = new Set<DraftKind>(['template', 'exercise', 'cycle', 'schedule', 'history', 'description', 'body-weight']);
export function configureDraftEpoch(value: string) {
  if (epoch === value) return; epoch = value;
  // Adopt pre-0.5 drafts once. Import generations never adopt stale legacy drafts again.
  try {
    if (localStorage.getItem('log:legacy-drafts-adopted')) return;
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!).filter(key => key?.startsWith('log:draft:v1:'));
    for (const key of keys) { const replacement = key.replace('log:draft:v1:', `log:draft:v2:${epoch}:`); localStorage.setItem(replacement, localStorage.getItem(key)!); localStorage.removeItem(key); }
    localStorage.setItem('log:legacy-drafts-adopted', 'true');
  } catch { /* The form reports failures when attempting to save its draft. */ }
}
export const draftEpoch = () => epoch;
export const draftStorageFailed = () => failed.size > 0;
export function markDraftStorage(key: string, ok: boolean) { if (key.startsWith('log:draft:')) { if (ok) failed.delete(key); else failed.add(key); } }
export function tabId() { try { let id = sessionStorage.getItem('log:tab'); if (!id) { id = createId(); sessionStorage.setItem('log:tab', id); } return id; } catch { return 'storage-unavailable'; } }
export function draftStorageKey(kind: string, id: string) { return `log:draft:v2:${epoch}:${tabId()}:${kind}:${id}`; }
export function meaningfulDraft(kind: DraftKind, value: Record<string, unknown>) {
  if (kind === 'description') return value.text !== value.baseline;
  if (kind === 'schedule') return JSON.stringify(value.days) !== JSON.stringify(value.baseline);
  const baseline = value.baseline as Record<string, unknown> | undefined;
  const seconds = (value: unknown) => Math.floor(Date.parse(String(value)) / 1000);
  return JSON.stringify(value.draft) !== JSON.stringify(value.baseline) || (kind === 'template' && JSON.stringify(value.variants) !== JSON.stringify(value.initialVariants)) || (kind === 'history' && (seconds(value.start) !== seconds(baseline?.startedAt) || seconds(value.end) !== seconds(baseline?.endedAt ?? baseline?.startedAt)));
}
export function collectEditorDrafts(): RecoveryDraft[] {
  if (draftStorageFailed()) throw new Error('Черновик не записан в локальное хранилище. Сохраните или отмените изменения перед созданием копии.');
  const result: RecoveryDraft[] = [], prefix = `log:draft:v2:${epoch}:`;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)!; if (!key.startsWith(prefix)) continue;
    const [, kind, ...id] = key.slice(prefix.length).split(':');
    if (!kinds.has(kind as DraftKind)) continue;
    const value = JSON.parse(localStorage.getItem(key)!);
    if (value && typeof value === 'object' && meaningfulDraft(kind as DraftKind, value)) result.push({ id: key.slice(prefix.length), kind: kind as DraftKind, objectId: id.join(':'), value, savedAt: new Date().toISOString() });
  }
  return result;
}
export function clearTemporaryState(oldEpoch = epoch) {
  for (const storage of [localStorage, sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)!).filter(key => storage === sessionStorage ? key?.startsWith('log:') : key?.startsWith(`log:draft:v2:${oldEpoch}:`) || key?.startsWith('log:draft:v1:'));
    keys.forEach(key => storage.removeItem(key));
  }
}
