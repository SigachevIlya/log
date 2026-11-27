import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, LogDatabase, startSession, saveSession, finishSession } from './database';
import { createBackup, restoreBackup, restoreToken, coherentSnapshot } from './backup';
import { MAX_BACKUP_BYTES, parseBackup, validateBackup, type LogBackup } from '../domain/backup/format';
import { SessionWriter } from '../lib/SessionWriter';
import { historyCSV, weightCSV, csvCell } from '../domain/backup/csv';
import { createId } from '../domain/id';
import { periodRange } from '../domain/analytics/periods';
const flush = async () => true;
beforeEach(async () => { await db.open(); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await db.delete(); });
async function full() {
  let active = await startSession('B'); const row = active.exercises[0]; row.notes = 'Заметка; «русская»\nсо строкой'; Object.assign(row.sets[0], { weightKg: 28.5, reps: 12, status: 'completed' }); active = await saveSession(active, active.revision); await finishSession(active.id, active.revision);
  await db.bodyWeights.add({ id: 'weight', measuredAt: '2026-01-01T08:30:00Z', weightKg: 72.35, revision: 0 });
  await db.exercises.add({ id: 'mine', name: 'Моё упражнение', description: 'Мои данные', weightMode: 'total', unilateral: false, archived: true, revision: 2 });
  await db.templates.add({ id: 'old', name: 'Архив', code: 'OLD', muscleGroups: [], revision: 3, archived: true, slots: [{ id: 'old-slot', exerciseIds: ['mine'], sets: 3, reps: [8, 12], optional: true }] });
  await db.scheduleExceptions.add({ id: 'exception', kind: 'move', date: '2026-12-01', targetDate: '2026-12-02', revision: 0 });
  await db.settings.update('user', { theme: 'light', trainingDays: [1, 5], recommendationsEnabled: false });
}
describe('consistent backups and atomic replacement', () => {
  it('exports a new diary without fabricated sessions or measurements', async () => { const value = await createBackup(db, flush); expect(value.backup.data.workouts).toEqual([]); expect(value.backup.data.weightMeasurements).toEqual([]); expect(value.backup.data.workoutTemplates).toHaveLength(3); expect(value.filename).toMatch(/^LOG-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/); expect(parseBackup(value.text).format).toBe('LOG.backup'); expect(value.backup.data).not.toHaveProperty('metadata'); });
  it('round-trips full history, archives, cycle, alternation, weights, settings and links', async () => {
    await full(); const exported = await createBackup(db, flush); const target = new LogDatabase('log-backup-target');
    try { await target.open(); await restoreBackup(target, parseBackup(exported.text), await restoreToken(target), flush); target.close(); const reopened = new LogDatabase(target.name); try { await reopened.open(); expect(await coherentSnapshot(reopened)).toEqual(exported.backup.data); expect((await reopened.program.get('program'))?.alternationNext).toEqual(exported.backup.data.cycle.alternationNext); } finally { reopened.close(); } } finally { await target.delete(); }
  });
  it('includes active pending input, original IDs and an explicit unapplied editor draft', async () => {
    let active = await startSession('A'); Object.assign(active.exercises[0].sets[0], { weightText: '12,', weightKg: 12, reps: null }); active = await saveSession(active, active.revision);
    const template = (await db.templates.get('A'))!, program = (await db.program.get('program'))!;
    const value = await createBackup(db, flush, () => [{ id: 'draft', kind: 'template', objectId: 'A', savedAt: new Date().toISOString(), value: { baseline: template, draft: { ...template, name: 'Ещё не применено' }, expected: program.cycleRevision ?? 0, initialVariants: program.alternationNext, variants: program.alternationNext } }]);
    expect(value.backup.data.workouts[0]).toEqual(JSON.parse(JSON.stringify(active))); expect(value.backup.data.editorDrafts).toHaveLength(1); expect(value.backup.data.workoutTemplates.find(row => row.id === 'A')?.name).toBe(template.name);
    const target = new LogDatabase('log-active-backup'); try { await target.open(); await restoreBackup(target, value.backup, await restoreToken(target), flush); expect((await target.sessions.get(active.id))?.exercises[0].sets[0].weightText).toBe('12,'); expect(await target.recoveryDrafts.count()).toBe(1); expect((await target.templates.get('A'))?.name).toBe(template.name); } finally { await target.delete(); }
  });
  it('waits for an in-flight SessionWriter and includes its final generation', async () => {
    const active = await startSession('A'); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const writer = new SessionWriter(active, async (value, expected) => { await gate; return saveSession(value, expected); }); writer.change(value => { Object.assign(value.exercises[0].sets[0], { weightKg: 5, reps: 10, status: 'completed' }); });
    let done = false; const pending = createBackup(db, () => writer.flush()).then(value => { done = true; return value; }); await Promise.resolve(); expect(done).toBe(false); release(); const value = await pending; expect(value.backup.data.workouts[0].exercises[0].sets[0].weightKg).toBe(5);
  });
  it('does not export or update the timestamp if autosave fails', async () => { await expect(createBackup(db, async () => false)).rejects.toThrow('несохранённые'); expect((await db.settings.get('user'))?.lastBackupAt).toBeUndefined(); });
  it('omits previous-result UI hints and regenerates them without changing restored input', async () => {
    let first = await startSession('A'); Object.assign(first.exercises[0].sets[0], { weightKg: 5, reps: 10, status: 'completed' }); first = await saveSession(first, first.revision); await finishSession(first.id, first.revision); let active = await startSession('A', false); active.exercises[0].sets[0].repsText = '11'; active.exercises[0].sets[0].reps = 11; active = await saveSession(active, active.revision);
    const result = await createBackup(db, flush); expect(result.backup.data.workouts.find(row => row.id === active.id)!.exercises[0].previousSets).toBeUndefined();
    const target = new LogDatabase('log-backup-hints'); try { await target.open(); await restoreBackup(target, result.backup, await restoreToken(target), flush); const restored = (await target.sessions.get(active.id))!; expect(restored.exercises[0].sets).toEqual(active.exercises[0].sets); expect(restored.exercises[0].previousSets?.[0].reps).toBe(10); } finally { await target.delete(); }
  });
  it('does not claim successful formation when the browser cannot construct the file', async () => { vi.stubGlobal('File', class { constructor() { throw new Error('File allocation failed'); } }); await expect(createBackup(db, flush)).rejects.toThrow('allocation'); expect((await db.settings.get('user'))?.lastBackupAt).toBeUndefined(); });
  it('rolls back every clear/write when restoration fails halfway', async () => { await full(); const value = await createBackup(db, flush), before = await coherentSnapshot(db), state = await restoreToken(db); vi.spyOn(db.sessions, 'bulkPut').mockRejectedValueOnce(new Error('Injected import failure')); await expect(restoreBackup(db, value.backup, state, flush)).rejects.toThrow('Injected'); expect(await coherentSnapshot(db)).toEqual(before); expect(await restoreToken(db)).toBe(state); });
  it('refuses a preview after another write without changing the current diary', async () => { const value = await createBackup(db, flush), token = await restoreToken(db); await db.settings.update('user', { theme: 'light' }); await expect(restoreBackup(db, value.backup, token, flush)).rejects.toThrow('предварительного'); expect((await db.settings.get('user'))?.theme).toBe('light'); });
  it('fences stale sessions, editors and direct settings writes across independent connections', async () => {
    const old = new LogDatabase(db.name); await old.open(); const active = await startSession('A'), snapshot = await createBackup(db, flush); const oldEpoch = old.epoch;
    await restoreBackup(db, snapshot.backup, await restoreToken(db), flush); expect((await db.metadata.get('state'))?.epoch).not.toBe(oldEpoch);
    await expect(old.settings.update('user', { theme: 'light' })).rejects.toThrow('Перезагрузите'); await expect(old.sessions.put({ ...active, notes: 'stale overwrite' })).rejects.toThrow('Перезагрузите'); await expect(old.templates.update('A', { name: 'stale' })).rejects.toThrow('Перезагрузите'); old.close(); expect((await db.sessions.get(active.id))?.notes).toBe('');
  });
});
describe('validation before touching the database', () => {
  it.each(['{bad', 'not json', '\uFEFF[1,2]'])('rejects damaged or foreign JSON: %s', value => { expect(() => parseBackup(value)).toThrow(); });
  it('rejects foreign format and prototype-polluting input', () => { expect(() => parseBackup('{"format":"other"}')).toThrow('не резервная'); expect(() => parseBackup('{"__proto__":{"polluted":true}}')).toThrow('повреждён'); expect(({} as any).polluted).toBeUndefined(); });
  it('rejects oversized input before parsing or modifying records', () => { expect(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow('50 МБ'); });
  it('explains malformed null records instead of exposing a JavaScript property error', async () => { const { backup } = await createBackup(db, flush); const value = JSON.parse(JSON.stringify(backup)); value.data.weightMeasurements = [null]; expect(() => parseBackup(JSON.stringify(value))).toThrow('Неверная структура'); });
  it('rejects an object in a displayable program name before it can break the interface', async () => { const { backup } = await createBackup(db, flush); (backup.data.cycle as any).name = { text: 'invalid' }; expect(() => validateBackup(backup)).toThrow('строка'); });
  it('preserves incomplete editor input without applying normal business validation to its values', async () => {
    const template = (await db.templates.get('A'))!, draft = structuredClone(template); draft.name = ''; draft.slots[0].sets = 101; draft.slots[0].reps = [0, 0];
    const value = await createBackup(db, flush, () => [{ id: 'unfinished', kind: 'template', objectId: 'A', savedAt: new Date().toISOString(), value: { baseline: template, draft, expected: 0, variants: {}, initialVariants: {} } }]);
    expect(parseBackup(value.text).data.editorDrafts[0].value.draft).toEqual(draft); expect((await db.templates.get('A'))?.name).toBe(template.name);
  });
  it('explains incompatible future format/schema but accepts unknown optional metadata', async () => { const { backup } = await createBackup(db, flush); expect(() => validateBackup({ ...backup, formatVersion: 2 })).toThrow('Обновите'); expect(() => validateBackup({ ...backup, schemaVersion: 99 })).toThrow('обновите'); expect(validateBackup({ ...backup, futureOptional: 'allowed' })).toHaveProperty('futureOptional'); });
  it.each([1, 2, 3, 4, 5])('migrates schema %s without inventing historical metadata or losing results', async schema => {
    await full(); const { backup } = await createBackup(db, flush); const legacy: any = structuredClone(backup); legacy.schemaVersion = schema; delete legacy.data.editorDrafts;
    if (schema < 4) { delete legacy.data.scheduleChanges; delete legacy.data.cycle.sequence; delete legacy.data.cycle.alternationNext; for (const template of legacy.data.workoutTemplates) { delete template.code; delete template.description; delete template.archived; } }
    // The old archived fixture was not an active template in its original cycle.
    if (schema < 4) legacy.data.workoutTemplates = legacy.data.workoutTemplates.filter((row: any) => row.id !== 'old');
    const session = legacy.data.workouts[0]; for (const row of [...session.exercises, ...session.originalExercises]) { delete row.exercise.primaryMuscle; delete row.exercise.loadCalculation; }
    if (schema < 2) { delete session.originalExercises; delete session.revision; delete session.advanceCycle; }
    const parsed = validateBackup(legacy); expect(parsed.data.editorDrafts).toEqual([]); expect(parsed.data.workouts[0].exercises[0].sets[0].reps).toBe(12); expect(parsed.data.workouts[0].exercises[0].exercise.primaryMuscle).toBeUndefined(); expect(parsed.data.workouts[0].exercises[0].exercise.loadCalculation).toBeUndefined(); expect(parsed.data.cycle.nextTemplateId).toBe(backup.data.cycle.nextTemplateId);
  });
  it.each(['duplicate', 'reference', 'history-reference', 'cycle', 'variant', 'active', 'result', 'date', 'status'] as const)('rejects invalid %s without modifying the current data', async kind => {
    await full(); await startSession('A'); const { backup } = await createBackup(db, flush), before = await coherentSnapshot(db); const value: LogBackup = structuredClone(backup);
    if (kind === 'duplicate') value.data.library.push(value.data.library[0]);
    if (kind === 'reference') value.data.workoutTemplates[0].slots[0].exerciseIds = ['missing'];
    if (kind === 'history-reference') value.data.workouts.find(row => row.status !== 'active')!.templateId = 'missing';
    if (kind === 'cycle') value.data.cycle.nextTemplateId = 'missing';
    if (kind === 'variant') value.data.cycle.alternationNext!['B-2'] = 'missing';
    if (kind === 'active') value.data.workouts.push({ ...value.data.workouts.find(row => row.status === 'active')!, id: createId() });
    if (kind === 'result') value.data.workouts.find(row => row.status !== 'active')!.exercises[0].sets[0].weightKg = -1;
    if (kind === 'date') value.data.weightMeasurements[0].measuredAt = '2026-02-30T00:00:00Z';
    if (kind === 'status') value.data.workouts.find(row => row.status === 'incomplete')!.status = 'completed';
    await expect(restoreBackup(db, value, await restoreToken(db), flush)).rejects.toThrow(); expect(await coherentSnapshot(db)).toEqual(before);
  });
});
describe('Excel CSV', () => {
  it('uses UTF-8 BOM, semicolons, escaped quotes/newlines and Russian decimals', async () => { await full(); const history = await db.sessions.toArray(); history[0].exercises[0].notes = 'Кавычки "и"; перенос\nновая строка'; const text = historyCSV(history); expect(text.startsWith('\uFEFF')).toBe(true); expect(text).toContain('"28,5"'); expect(text).toContain('Кавычки ""и""; перенос\nновая строка'); expect(text.split('\r\n')[0]).toContain('"ID тренировки";'); });
  it.each(['=SUM(A1:A2)', '+cmd', '-cmd', '@SUM(A1)', ' \t=1+1', '\n=1', '\u0000=1', '＝1+1'])('defangs text formulas: %s', value => { expect(csvCell(value).startsWith('"\'')).toBe(true); });
  it('keeps numeric values numeric while excluding pending/active/skipped results', async () => { await full(); const active = await startSession('A'); const data = await db.sessions.toArray(); const csv = historyCSV([...data, { ...active, status: 'skipped' }]); expect(csv).not.toContain(active.id); expect(csv.match(/"28,5"/g)).toHaveLength(1); expect(csvCell(28.5)).toBe('"28,5"'); });
  it('exports one row for a bilateral approach with explicit left/right columns', async () => { await full(); const value = (await db.sessions.toArray())[0]; const row = value.exercises[0]; row.separateSides = true; Object.assign(row.sets[0], { rightWeightKg: 29, rightReps: 11 }); const csv = historyCSV([value]); expect(csv).toContain(';"";"";"Вес одной гантели";"28,5";"12";"29";"11";'); });
  it('filters history and weight exports by actual dates without changing source values', async () => { await full(); const data = await db.sessions.toArray(), before = structuredClone(data); expect(historyCSV(data, periodRange('week', new Date(2000, 0, 1)))).not.toContain(data[0].id); expect(data).toEqual(before); expect(weightCSV(await db.bodyWeights.toArray())).toContain('72,35'); });
});
