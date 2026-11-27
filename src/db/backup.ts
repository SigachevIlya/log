import { LogDatabase } from './database';
import { BACKUP_FORMAT, BACKUP_VERSION, MAX_BACKUP_BYTES, validateBackup, type BackupData, type LogBackup } from '../domain/backup/format';
import { APP_VERSION, DATABASE_SCHEMA } from '../lib/version';
import type { RecoveryDraft, WorkoutSession } from '../domain/models';
import { createId } from '../domain/id';
import { prefillSession } from '../domain/workout';
export interface ExportedBackup { backup: LogBackup; text: string; filename: string; file: File; token: string }
const stripHints = (session: WorkoutSession): WorkoutSession => ({ ...session, exercises: session.exercises.map(({ previousSets: _hint, ...row }) => row), originalExercises: session.originalExercises.map(({ previousSets: _hint, ...row }) => row) });
const draftWithoutHints = (draft: RecoveryDraft): RecoveryDraft => draft.kind === 'history' ? { ...draft, value: { ...draft.value, baseline: stripHints(draft.value.baseline as WorkoutSession), draft: stripHints(draft.value.draft as WorkoutSession) } } : draft;
export const backupFilename = (date: Date) => `LOG-backup-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}.json`;
export const restoreToken = async (client: LogDatabase) => { const state = await client.metadata.get('state'); if (!state) throw new Error('Не удалось прочитать поколение базы.'); return `${state.epoch}:${state.changes}`; };
export async function readBackupData(client: LogDatabase): Promise<BackupData> {
  const [library, workoutTemplates, workouts, cycle, preferences, weightMeasurements, scheduleChanges, editorDrafts] = await Promise.all([client.exercises.toArray(), client.templates.toArray(), client.sessions.toArray(), client.program.get('program'), client.settings.get('user'), client.bodyWeights.toArray(), client.scheduleExceptions.toArray(), client.recoveryDrafts.toArray()]);
  if (!cycle || !preferences) throw new Error('Не удалось прочитать программу или настройки. Копия не создана.');
  return { library, workoutTemplates, workouts: workouts.map(stripHints), cycle, preferences, weightMeasurements, scheduleChanges, editorDrafts: editorDrafts.map(draftWithoutHints) };
}
export async function coherentSnapshot(client: LogDatabase) { return client.transaction('r', client.tables, () => readBackupData(client)); }
export async function createBackup(client: LogDatabase, flush: () => Promise<boolean>, collectDrafts: () => RecoveryDraft[] = () => [], now = new Date()): Promise<ExportedBackup> {
  if (!(await flush())) throw new Error('Есть несохранённые изменения тренировки. Повторите запись перед созданием копии.');
  const drafts = collectDrafts();
  return client.transaction('rw', client.tables, async () => {
    const data = await readBackupData(client);
    data.editorDrafts = [...new Map([...data.editorDrafts, ...drafts].map(draft => [draft.id, draftWithoutHints(draft)])).values()];
    data.preferences = { ...data.preferences, lastBackupAt: now.toISOString() };
    const backup: LogBackup = { format: BACKUP_FORMAT, formatVersion: BACKUP_VERSION, appVersion: APP_VERSION, schemaVersion: DATABASE_SCHEMA, createdAt: now.toISOString(), data };
    // Serialization and validation finish before the successful-export timestamp commits.
    const text = JSON.stringify(backup, null, 2); validateBackup(JSON.parse(text));
    const filename = backupFilename(now), file = new File([text], filename, { type: 'application/json' });
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Копия превышает поддерживаемые 50 МБ. Файл не сформирован для передачи; исходные данные сохранены.');
    await client.settings.put(data.preferences);
    return { backup, text, filename, file, token: await restoreToken(client) };
  });
}
export async function restoreBackup(client: LogDatabase, value: LogBackup, expectedToken: string, flush: () => Promise<boolean>) {
  const backup = validateBackup(JSON.parse(JSON.stringify(value)));
  if (!(await flush())) throw new Error('Не удалось сохранить текущую тренировку. Восстановление не начато.');
  return client.transaction('rw', client.tables, async () => {
    if (await restoreToken(client) !== expectedToken) throw new Error('Текущие данные изменились после предварительного просмотра. Выберите файл заново и проверьте сводку.');
    const data = backup.data;
    const active = data.workouts.find(row => row.status === 'active');
    if (active) {
      const preview = structuredClone(active); prefillSession(preview, data.workouts.filter(row => row.status !== 'active'));
      // Regenerate only the previous-result hint. Never replace restored user input or confirmations.
      active.exercises.forEach((row, index) => { delete row.previousSets; if (preview.exercises[index].previousSets) row.previousSets = preview.exercises[index].previousSets; });
    }
    // All clears, writes and the final generation switch share ONE transaction.
    const tables = [client.exercises, client.templates, client.sessions, client.program, client.settings, client.bodyWeights, client.scheduleExceptions, client.recoveryDrafts];
    for (const table of tables) await table.clear();
    await client.exercises.bulkPut(data.library); await client.templates.bulkPut(data.workoutTemplates); await client.sessions.bulkPut(data.workouts);
    await client.program.put(data.cycle); await client.settings.put(data.preferences); await client.bodyWeights.bulkPut(data.weightMeasurements); await client.scheduleExceptions.bulkPut(data.scheduleChanges); await client.recoveryDrafts.bulkPut(data.editorDrafts);
    const epoch = createId(); await client.metadata.put({ id: 'state', epoch, changes: 0 }); return epoch;
  });
}
