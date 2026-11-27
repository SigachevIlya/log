import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { db, discardDraft, finishSession, loadData, recoverSessionJournal, startSession, type AppData } from './db/database';
import type { TemplateId, Theme, WorkoutSession } from './domain/models';
import { nextTemplate } from './domain/schedule';
import { Navigation, type Section } from './components/Navigation';
import { WorkoutPage } from './pages/WorkoutPage';
import { SettingsPage } from './pages/SettingsPage';
import { buildAnalytics } from './domain/analytics';
const ProgressPage = lazy(() => import('./pages/progress/ProgressPage'));
import { ActiveWorkoutPage } from './pages/ActiveWorkoutPage';
import { HistoryPage, SessionSummary } from './pages/HistoryPage';
import { Dialog } from './components/Dialog';
import { useSessionEditor } from './hooks/useSessionEditor';
import { reportError } from './lib/reportError';
import { ProgramPage } from './pages/ProgramPage';
import { mayLeave } from './hooks/useDirtyGuard';
import { createId } from './domain/id';
import { configureDraftEpoch, draftStorageFailed } from './lib/draftStorage';
import { dirtyEditors, pendingWrites } from './lib/activity';
import { startPwa, setUpdateSafety, usePwa } from './pwa/client';
const DataPage = lazy(() => import('./pages/settings/DataPage').then(module => ({ default: module.DataPage })));
const GuidePage = lazy(() => import('./pages/settings/GuidePage').then(module => ({ default: module.GuidePage })));
import { ApplicationPage, UpdateBanner } from './pages/settings/ApplicationPage';
import { BackupReminder } from './components/BackupReminder';
import { go, objectPath, routeId, useRoute } from './routing/router';
import { readStored, useStoredState } from './hooks/useStoredState';
import { useScrollRestoration } from './hooks/useScrollRestoration';

export function App() {
  const [data, setData] = useState<AppData>();
  const [error, setError] = useState('');
  const [databaseNotice, setDatabaseNotice] = useState('');
  const pwa = usePwa();
  const route = useRoute();
  const section: Section = route.startsWith('/history') ? 'history' : route.startsWith('/settings') ? 'settings' : route.startsWith('/progress') ? 'progress' : 'workout';
  const view = route.startsWith('/program') ? 'program' : route === '/workout/active' ? 'active' : route.startsWith('/workout/summary/') ? 'summary' : 'home';
  const [selected, setSelected] = useStoredState<TemplateId>('log:selected', 'A');
  const [startChoice, setStartChoice] = useState(false);
  const [advanceChoice, setAdvanceChoice] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const initialized = useRef(false);
  const heading = useRef<HTMLElement>(null);
  const [now, setNow] = useState(() => new Date());
  const editor = useSessionEditor(data?.active);
  const stale = !!databaseNotice || (!!data?.metadata && !!db.epoch && data.metadata.epoch !== db.epoch);
  const previousNext = useRef<string | null>(null);
  const analytics = useMemo(() => buildAnalytics(data?.history ?? [], data?.bodyWeights ?? []), [data?.history, data?.bodyWeights]);
  useScrollRestoration(route, section !== 'progress' && route !== '/settings/data' && !route.startsWith('/settings/guide') && !!data && (route !== '/workout/active' || !!editor.session && !!editor.writer));
  useEffect(() => {
    if (data) { if (previousNext.current !== null && previousNext.current !== data.program.nextTemplateId) setSelected(data.active?.templateId ?? data.program.nextTemplateId); previousNext.current = data.program.nextTemplateId; }
  }, [data?.program.nextTemplateId]);
  useEffect(() => { if (data && !data.templates.some(row => row.id === selected && !row.archived)) setSelected(data.program.nextTemplateId); }, [data?.templates, selected]);
  useEffect(() => {
    let disposed = false;
    let subscription: { unsubscribe(): void } | undefined;
    const start = async () => { await recoverSessionJournal(); if (disposed) return; subscription = liveQuery(loadData).subscribe({
      next(value) { if (value.metadata?.epoch === db.epoch) configureDraftEpoch(value.metadata!.epoch); setData(previous => previous && previous.metadata?.epoch === value.metadata?.epoch && (previous.metadata?.changes ?? 0) > (value.metadata?.changes ?? 0) ? previous : previous && previous.metadata?.epoch === value.metadata?.epoch ? { ...value, history: JSON.stringify(previous.history.map(row => [row.id, row.revision])) === JSON.stringify(value.history.map(row => [row.id, row.revision])) ? previous.history : value.history, bodyWeights: JSON.stringify(previous.bodyWeights) === JSON.stringify(value.bodyWeights) ? previous.bodyWeights : value.bodyWeights } : value); if (!initialized.current) { if (!readStored<string | null>(sessionStorage, 'log:selected', null)) setSelected(value.active?.templateId ?? value.program.nextTemplateId); initialized.current = true; } },
      error(cause) { reportError('Чтение локальной базы', cause); setError('Не удалось открыть локальное хранилище. Проверьте, разрешено ли сохранение данных в браузере, и перезагрузите страницу.'); },
    });
    };
    void start().catch(cause => { reportError('Открытие дневника', cause); setError('Не удалось открыть локальное хранилище. Перезагрузите страницу.'); });
    const storage = (event: StorageEvent) => { if (event.key?.startsWith('log:session-journal:')) void recoverSessionJournal().catch(cause => reportError('Восстановление ввода другой вкладки', cause)); };
    window.addEventListener('storage', storage);
    return () => { disposed = true; subscription?.unsubscribe(); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    const viewport = window.visualViewport;
    const resize = () => setKeyboard(!!viewport && viewport.height < window.innerHeight - 120);
    viewport?.addEventListener('resize', resize);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); viewport?.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    const theme = data?.settings.theme ?? 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111111' : '#f6f6f4');
  }, [data?.settings.theme]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [route]);
  useEffect(() => { document.documentElement.style.setProperty('--fixed-bottom-space', route.startsWith('/program/template/') ? '150px' : '74px'); }, [route]);
  useEffect(() => {
    if (!data) return;
    if (locked.current) return;
    if (route === '/workout/active' && !data.active) go('/workout', { replace: true, guard: false, from: route });
    else if (view === 'summary' && !data.history.some(row => row.id === routeId(route, '/workout/summary'))) go('/workout', { replace: true, guard: false, from: route });
    else if (!/^\/(workout(?:\/active|\/summary\/[^/]+)?|history(?:\/[^/]+(?:\/edit)?)?|program(?:\/cycle|\/template\/[^/]+|\/library(?:\/[^/]+)?)?|settings(?:\/data|\/application|\/guide(?:\/[^/]+)?)?|progress(?:\/.*)?)$/.test(route)) go(route.startsWith('/program') ? '/program' : route.startsWith('/history') ? '/history' : route.startsWith('/progress') ? '/progress' : route.startsWith('/settings') ? '/settings' : '/workout', { replace: true, guard: false });
  }, [route, data, view, busy]);
  async function flushForFiles() {
    if (stale || draftStorageFailed()) return false;
    return !editor.writer || await editor.writer.flush();
  }
  useEffect(() => { void startPwa(); const blocked = () => setDatabaseNotice('Обновление хранилища заблокировано другой вкладкой. Закройте её и повторите загрузку.'); const changed = () => setDatabaseNotice('Схема хранилища обновлена в другой вкладке. Перезагрузите LOG. перед продолжением.'); window.addEventListener('log:database-blocked', blocked); window.addEventListener('log:database-versionchange', changed); return () => { window.removeEventListener('log:database-blocked', blocked); window.removeEventListener('log:database-versionchange', changed); }; }, []);
  useEffect(() => { setUpdateSafety(async () => {
    if (!data || stale) return { safe: false, reason: 'Дождитесь загрузки данных или перезагрузите устаревшую вкладку.' };
    if (data.active) return { safe: false, reason: 'Завершите или отмените активную тренировку перед обновлением.' };
    if (dirtyEditors() || draftStorageFailed()) return { safe: false, reason: 'Сохраните или отмените изменения открытого редактора перед обновлением.' };
    if (!(await flushForFiles()) || pendingWrites()) return { safe: false, reason: 'Дождитесь завершения записи данных и повторите обновление.' };
    return { safe: true };
  }); }, [data, stale, editor.writer]);
  async function perform(operation: string, action: () => Promise<unknown>): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError('');
    try { await action(); return true; }
    catch (cause) { reportError(operation, cause); setError(`Не удалось выполнить действие: ${cause instanceof Error ? cause.message : 'ошибка записи'}. Повторите попытку.`); return false; }
    finally { locked.current = false; setBusy(false); }
  }
  async function navigate(next: Section) {
    if (stale || pwa.locked || locked.current || !mayLeave()) return;
    if (editor.writer && !(await editor.writer.flush())) { setError('Сначала сохраните изменения: нажмите «Повторить запись» в тренировке.'); return; }
    go(`/${next}`, { guard: false }); setError('');
  }
  async function showProgram() {
    if (!mayLeave() || (editor.writer && !(await editor.writer.flush()))) return;
    go('/program', { guard: false });
  }
  const templateCode = (id: string) => data?.templates.find(row => row.id === id)?.code ?? id;
  function changeTheme(theme: Theme) { void perform('Сохранение темы', async () => { await db.settings.update('user', { theme }); }); }
  async function begin(advance?: boolean) {
    if (!data?.active && selected !== data?.program.nextTemplateId && advance === undefined) { setAdvanceChoice(false); setStartChoice(true); return; }
    await perform('Начало или восстановление тренировки', async () => {
      const session = await startSession(selected, advance); const refreshed = await loadData(); flushSync(() => setData(refreshed)); setSelected(session.templateId); go('/workout/active', { guard: false }); setStartChoice(false);
    });
  }
  async function finish(): Promise<boolean> {
    if (!editor.writer || !(await editor.writer.flush())) return false;
    return perform('Завершение тренировки', async () => {
      const current = editor.writer!.getSnapshot().session;
      const result = await finishSession(current.id, current.revision);
      const refreshed = await loadData(); flushSync(() => setData(refreshed)); setSelected(refreshed.program.nextTemplateId); go(result.status === 'skipped' ? '/workout' : objectPath('/workout/summary', result.id), { guard: false });
    });
  }
  async function cancel(): Promise<boolean> {
    if (!editor.writer || !(await editor.writer.flush())) return false;
    return perform('Отмена тренировки', async () => {
      await discardDraft(editor.writer!.getSnapshot().session.id); const refreshed = await loadData(); flushSync(() => setData(refreshed)); setSelected(refreshed.program.nextTemplateId); go('/workout', { guard: false });
    });
  }
  return <div className={`app-shell ${keyboard ? 'keyboard-open' : ''}`}>
    <header className="app-header"><a href="#" className="brand" aria-label="LOG. На главную" onClick={event => { event.preventDefault(); navigate('workout'); }}>LOG.</a><div className="header-right"><time dateTime={now.toLocaleDateString('en-CA')}>{now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '')}</time><button className="icon-button" disabled={!data || busy || stale || pwa.locked} aria-label={data?.settings.theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'} onClick={() => changeTheme(data?.settings.theme === 'dark' ? 'light' : 'dark')}>{data?.settings.theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button></div></header>
    <main ref={heading} tabIndex={-1}><UpdateBanner />{stale && <div className="error-banner" role="alert">{databaseNotice || 'Данные заменены восстановлением в другой вкладке. Перезагрузите LOG. перед продолжением.'}<button className="small-button outlined" onClick={() => location.reload()}>Перезагрузить LOG.</button></div>}<fieldset className="locked-content" disabled={stale || pwa.locked}>
      {data?.recoveryError && <p role="alert" className="error-banner">{data.recoveryError}</p>}
      {error && <div className="error-banner" role="alert">{error}{!data && <button className="small-button" onClick={() => window.location.reload()}>Перезагрузить</button>}</div>}
      {!data ? !error && <p className="loading" role="status">Открываем дневник…</p> : <>
        {section === 'workout' && (view === 'program' ? <ProgramPage data={data} onBack={() => go('/workout')} onPreview={id => { setSelected(id); go('/workout'); }} /> : view === 'summary' && data.history.find(row => row.id === routeId(route, '/workout/summary')) ? <SessionSummary session={data.history.find(row => row.id === routeId(route, '/workout/summary'))!} onHome={() => void navigate('workout')} /> : view === 'active' && data.active && editor.session && editor.writer ? <ActiveWorkoutPage key={editor.session.id} session={editor.session} writer={editor.writer} saving={editor.saving} dirty={editor.dirty} error={editor.error} actionError={error} library={data.exercises} history={data.history} busy={busy} analytics={analytics} recommendationsEnabled={data.settings.recommendationsEnabled !== false} onBack={() => void navigate('workout')} onFinish={finish} onCancel={cancel} /> : <WorkoutPage data={data} now={now} selected={selected} programView={false} busy={busy} onSelect={id => { if (mayLeave()) setSelected(id); }} onProgram={() => void showProgram()} onStart={() => { if (mayLeave()) void begin(); }} onSaveDescription={async (id, description, expected) => { await db.transaction('rw', db.exercises, async () => { const exercise = await db.exercises.get(id); if (!exercise || (exercise.revision ?? 0) !== expected) throw new Error('Упражнение изменено в другой вкладке. Откройте пояснение заново.'); await db.exercises.update(id, { description, revision: (exercise.revision ?? 0) + 1, comparisonKey: createId() }); }); }} />)}
        {section === 'workout' && view === 'home' && <BackupReminder data={data} now={now} />}
        {section === 'progress' && <Suspense fallback={<p className="loading" role="status">Открываем прогресс…</p>}><ProgressPage data={data} analytics={analytics} now={now} /></Suspense>}
        {section === 'history' && <HistoryPage history={data.history} program={data.program} active={!!data.active} onWorkout={() => void navigate('workout')} />}
        {section === 'settings' && <Suspense fallback={<p className="loading" role="status">Открываем раздел…</p>}>{(route === '/settings/data' ? <DataPage data={data} flush={flushForFiles} /> : route.startsWith('/settings/guide') ? <GuidePage /> : route === '/settings/application' ? <ApplicationPage /> : <SettingsPage data={data} onProgram={() => void showProgram()} theme={data.settings.theme} onTheme={changeTheme} busy={busy} />)}</Suspense>}
      </>}
    </fieldset></main><Navigation section={section} onChange={navigate} />
    {startChoice && <Dialog title={`Тренировка ${templateCode(selected)} вне очереди`} onClose={() => !busy && setStartChoice(false)}><p>Сейчас по программе — тренировка {data && templateCode(data.program.nextTemplateId)}. По умолчанию внеплановая тренировка не сдвигает цикл.</p><label className="check-label"><input type="checkbox" checked={advanceChoice} onChange={event => setAdvanceChoice(event.target.checked)} />После завершения продолжить цикл с {templateCode(nextTemplate(selected, data?.program.sequence))}</label>{error && <p className="error-text" role="alert">{error}</p>}<button className="primary-button" disabled={busy} onClick={() => void begin(advanceChoice)}>Начать вне очереди</button></Dialog>}
  </div>;
}
