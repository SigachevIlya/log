import { useEffect, useState } from 'react';
import { db, type AppData } from '../../db/database';
import { coherentSnapshot, createBackup, restoreBackup, restoreToken } from '../../db/backup';
import { MAX_BACKUP_BYTES, parseBackup, type LogBackup } from '../../domain/backup/format';
import { historyCSV, weightCSV } from '../../domain/backup/csv';
import type { RecoveryDraft } from '../../domain/models';
import { fullDate, periodLabels, periodRange, rangeLabel, type Period } from '../../domain/analytics/periods';
import { collectEditorDrafts, clearTemporaryState, draftStorageKey } from '../../lib/draftStorage';
import { canShareFile, downloadFile, shareFile } from '../../lib/files';
import { APP_VERSION } from '../../lib/version';
import { reportError } from '../../lib/reportError';
import { Dialog } from '../../components/Dialog';
import { go, objectPath } from '../../routing/router';
import { useStoredState } from '../../hooks/useStoredState';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { registerDirtyEditor } from '../../lib/activity';
import { variantIndex } from '../../domain/session';
export function DataPage({ data, flush }: { data: AppData; flush: () => Promise<boolean> }) {
  useScrollRestoration('/settings/data', true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ backup: LogBackup; token: string; name: string } | null>(null);
  useEffect(() => { if (preview || busy) return registerDirtyEditor(); }, [!!preview, busy]);
  const [period, setPeriod] = useStoredState<Period>('log:csv-period', 'all');
  const [reminders, setReminders] = useState(data.settings.backupRemindersEnabled !== false);
  useEffect(() => { setReminders(data.settings.backupRemindersEnabled !== false); }, [data.settings.backupRemindersEnabled]);
  const first = [...data.history.map(row => Date.parse(row.startedAt)), ...data.bodyWeights.map(row => Date.parse(row.measuredAt))];
  const range = periodRange(period, new Date(), first.length ? Math.min(...first) : undefined);
  async function perform(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (cause) { reportError('Данные и резервные копии', cause); setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие. Повторите попытку.'); } finally { setBusy(false); } }
  async function backup() {
    const result = await createBackup(db, flush, collectEditorDrafts); setFile(result.file);
    setPreview(current => current ? { ...current, token: result.token } : null);
  }
  let draftWarning = ''; try { if (collectEditorDrafts().length) draftWarning = 'Есть редакторские черновики. При замене данных старые черновики не будут применены к новой базе.'; } catch { draftWarning = 'Не удалось проверить локальные черновики. Сохраните важный ввод перед заменой данных.'; }
  const preparedFile = file && <section className="prepared-file" role="status"><strong>Файл сформирован</strong><p className="filename">{file.name}</p><p className="small muted">Скачайте или передайте файл. LOG. не может подтвердить его физическое сохранение.</p><div className="button-row"><button className="small-button filled" onClick={() => downloadFile(file)}>Скачать файл</button>{canShareFile(file) && <button className="small-button outlined" onClick={() => { void shareFile(file).catch(cause => { if (cause?.name !== 'AbortError') { reportError('Передача файла', cause); setError('Не удалось передать файл. Используйте скачивание.'); } }); }}>Поделиться файлом</button>}</div></section>;
  return <div className="data-page"><div className="page-heading editor-heading"><button className="text-button" onClick={() => go('/settings')}>К настройкам</button><h1>Данные и резервные копии</h1></div>
    <p className="small muted">Данные LOG. хранятся на этом устройстве. Удаление данных сайта или потеря устройства могут привести к потере истории. Регулярно сохраняйте резервные копии.</p>
    <div className="statistics-list">{[['Сохранённых тренировок', data.history.length], ['Измерений собственного веса', data.bodyWeights.length], ['Шаблонов, включая архив', data.templates.length], ['Активная тренировка', data.active ? 'Есть' : 'Нет'], ['Последняя сформированная копия', data.settings.lastBackupAt ? new Date(data.settings.lastBackupAt).toLocaleString('ru-RU') : 'Ещё не создавалась'], ['Версия приложения', APP_VERSION]].map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>
    {error && <p className="error-banner" role="alert">{error}</p>}{busy && <p className="small muted" role="status">Подготавливаем данные…</p>}
    <section className="settings-section"><h2>Резервная копия JSON</h2><p className="small muted">Полный перенос программы, истории, настроек, активной тренировки и отдельных неприменённых черновиков.</p><button className="primary-button" disabled={busy} onClick={() => void perform(backup)}>Создать резервную копию</button>
      <label className="field-label" htmlFor="backup-file">Восстановить из резервной копии</label><input id="backup-file" type="file" accept=".json,application/json" disabled={busy} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; if (!selected) return; void perform(async () => { if (selected.size > MAX_BACKUP_BYTES) throw new Error('Файл слишком большой. Максимальный размер — 50 МБ.'); if (!(await flush())) throw new Error('Сначала сохраните текущую тренировку.'); const backup = parseBackup(await selected.text()); setPreview({ backup, token: await restoreToken(db), name: selected.name }); }); }} />
    </section>
    {!preview && preparedFile}
    <section className="settings-section"><h2>Экспорт для анализа</h2><p className="small muted">CSV не подходит для восстановления LOG. Каждая строка истории — один подтверждённый подход; тренировки различайте по ID.</p><label className="field-label" htmlFor="csv-period">Период CSV</label><select id="csv-period" value={period} onChange={event => setPeriod(event.target.value as Period)}>{(Object.keys(periodLabels) as Period[]).map(value => <option key={value} value={value}>{periodLabels[value]}</option>)}</select><p className="small muted">{rangeLabel(range)}</p>
      <button className="text-button" disabled={busy} onClick={() => void perform(async () => { if (!(await flush())) throw new Error('Сначала сохраните изменения тренировки.'); const snapshot = await coherentSnapshot(db); setFile(new File([historyCSV(snapshot.workouts, range)], `LOG-history-${new Date().toLocaleDateString('en-CA')}.csv`, { type: 'text/csv;charset=utf-8' })); })}>Экспортировать историю в CSV</button>
      <button className="text-button" disabled={busy} onClick={() => void perform(async () => { if (!(await flush())) throw new Error('Сначала сохраните изменения.'); const snapshot = await coherentSnapshot(db); setFile(new File([weightCSV(snapshot.weightMeasurements, range)], `LOG-body-weight-${new Date().toLocaleDateString('en-CA')}.csv`, { type: 'text/csv;charset=utf-8' })); })}>Экспортировать собственный вес в CSV</button>
    </section>
    <section className="settings-section"><h2>Напоминания</h2><label className="check-label"><input type="checkbox" checked={reminders} disabled={busy} onChange={event => { const enabled = event.target.checked; setReminders(enabled); void perform(async () => { try { await db.settings.update('user', { backupRemindersEnabled: enabled }); } catch (cause) { setReminders(data.settings.backupRemindersEnabled !== false); throw cause; } }); }} />Напоминать о резервной копии</label><p className="small muted">Если появилась история без копии или прошло более 30 дней. Во время активной тренировки напоминание скрыто.</p></section>
    {!!data.recoveryDrafts.length && <section className="settings-section"><h2>Черновики из резервной копии</h2><p className="small muted">Они ещё не применены. Откройте нужный редактор и проверьте изменения перед явным сохранением. Исходные ревизии сохранены.</p>{data.recoveryDrafts.map(draft => <div className="recovery-draft" key={draft.id}><p>{draftLabels[draft.kind]} · {draft.objectId}</p><button className="text-button" disabled={busy || !draftRoute(draft, data)} onClick={() => void perform(async () => { const route = draftRoute(draft, data); if (!route) throw new Error('Источник черновика больше не существует. Его содержимое сохранено в JSON-копии.'); localStorage.setItem(draftStorageKey(draft.kind, draft.objectId), JSON.stringify(draft.value)); if (draft.kind === 'schedule') sessionStorage.setItem('log:schedule-editing', 'true'); if (draft.kind === 'description') { sessionStorage.setItem(`log:description-edit:${draft.objectId}`, 'true'); sessionStorage.setItem(`log:exercise-open:${draft.objectId}`, 'true'); const template = descriptionTemplate(draft.objectId, data); if (template) sessionStorage.setItem('log:selected', JSON.stringify(template.id)); } await db.recoveryDrafts.delete(draft.id); go(route); if (draft.kind === 'description') location.reload(); })}>Открыть черновик в редакторе</button>{!draftRoute(draft, data) && <p className="small muted">Объект сейчас недоступен для редактирования: он отсутствует, архивирован или выбран другой вариант упражнения. Черновик сохранён отдельно и входит в JSON-копию.</p>}</div>)}</section>}
    <button className="text-button" onClick={() => go('/settings/guide/backup')}>Как сохранять и переносить данные</button>
    {preview && <Dialog title="Восстановить резервную копию?" error={error} onClose={() => !busy && setPreview(null)}><p className="filename">{preview.name}</p><p className="small muted">Создана {new Date(preview.backup.createdAt).toLocaleString('ru-RU')} · LOG. {preview.backup.appVersion}</p><div className="statistics-list">{[['Тренировок в истории', preview.backup.data.workouts.filter(row => row.status !== 'active').length], ['Упражнений', preview.backup.data.library.length], ['Шаблонов', preview.backup.data.workoutTemplates.length], ['Измерений веса', preview.backup.data.weightMeasurements.length], ['Черновиков', preview.backup.data.editorDrafts.length], ['Незавершённая тренировка', preview.backup.data.workouts.some(row => row.status === 'active') ? 'Есть' : 'Нет']].map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}</div><p className="notice">Восстановление заменит текущие пользовательские данные содержимым выбранной копии. Объединение не выполняется.</p>{data.active && <p className="small muted">Сейчас есть активная тренировка. Она также будет заменена данными копии.</p>}{draftWarning && <p className="small muted">{draftWarning}</p>}
      <button className="text-button" disabled={busy} onClick={() => void perform(backup)}>Создать копию текущих данных</button>{preparedFile}
      <button className="primary-button danger-action" disabled={busy} onClick={() => void perform(async () => { await restoreBackup(db, preview.backup, preview.token, flush); try { clearTemporaryState(data.metadata?.epoch); } catch (cause) { reportError('Очистка временного состояния после восстановления', cause); } const active = preview.backup.data.workouts.some(row => row.status === 'active'); location.replace(`${location.pathname}${location.search}#${active ? '/workout/active' : '/settings/data'}`); location.reload(); })}>Восстановить выбранную копию</button><button className="text-button" disabled={busy} onClick={() => setPreview(null)}>Отмена</button>
    </Dialog>}
  </div>;
}
const draftLabels: Record<RecoveryDraft['kind'], string> = { template: 'Тренировка', exercise: 'Упражнение', cycle: 'Цикл', schedule: 'Дни недели', history: 'История', description: 'Пояснение', 'body-weight': 'Измерение веса' };
function draftRoute(draft: RecoveryDraft, data: AppData): string | undefined {
  const id = draft.objectId;
  if (draft.kind === 'template') return id === 'new' || data.templates.some(row => row.id === id) ? objectPath('/program/template', id) : undefined;
  if (draft.kind === 'exercise') return id === 'new' || data.exercises.some(row => row.id === id) ? objectPath('/program/library', id) : undefined;
  if (draft.kind === 'cycle') return '/program/cycle'; if (draft.kind === 'schedule') return '/settings';
  if (draft.kind === 'history') return data.history.some(row => row.id === id) ? `${objectPath('/history', id)}/edit` : undefined;
  if (draft.kind === 'body-weight') return id === 'new' || data.bodyWeights.some(row => row.id === id) ? objectPath('/progress/body', id) : undefined;
  if (draft.kind === 'description') return descriptionTemplate(id, data) ? '/workout' : undefined;
}
function descriptionTemplate(id: string, data: AppData) { return data.templates.find(row => !row.archived && row.slots.some(slot => `${slot.id}:${slot.exerciseIds[variantIndex(slot, data.program)]}` === id)); }
