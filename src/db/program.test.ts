import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, discardDraft, finishSession, LogDatabase, saveSession, startSession } from './database';
import { archiveExercise, archiveTemplate, duplicateTemplate, saveExercise, saveTemplate, updateCycle } from './program';
import { deleteHistory } from './history';
import { withExerciseMetadata } from '../data/muscles';
import { initialExercises, initialProgram, initialSettings, initialTemplates } from '../data/seed';
import { createSession } from '../domain/session';
import { createId } from '../domain/id';
import type { WorkoutTemplate } from '../domain/models';
beforeEach(async () => { await db.open(); });
afterEach(async () => { await db.delete(); });
const rev = async () => (await db.program.get('program'))!.cycleRevision ?? 0;
async function custom(code = 'D'): Promise<WorkoutTemplate> { return saveTemplate({ id: createId(), code, name: `Тренировка ${code}`, description: 'Описание', muscleGroups: ['Пресс'], revision: 0, slots: [{ id: createId(), exerciseIds: ['pull-up'], sets: 2, reps: [5, 10], optional: false }] }, await rev()); }
async function finishA() { let session = await startSession('A'); Object.assign(session.exercises[0].sets[0], { weightKg: 5, reps: 10, status: 'completed' }); session = await saveSession(session, session.revision); return finishSession(session.id, session.revision); }
describe('program editing', () => {
  it('disabling an alternation preserves its order/next pointer and uses the explicitly chosen primary', async () => {
    let b = (await db.templates.get('B'))!; await saveTemplate(b, await rev(), { 'B-2': 'squat' });
    b = (await db.templates.get('B'))!; b.slots[1].alternating = false; b.slots[1].primaryExerciseId = 'split-squat'; await saveTemplate(b, await rev());
    let active = await startSession('B'); expect(active.exercises[1].exercise.id).toBe('split-squat'); Object.assign(active.exercises[1].sets[0], { weightKg: 12, reps: 10, status: 'completed' }); active = await saveSession(active, active.revision); await finishSession(active.id, active.revision);
    expect((await db.program.get('program'))?.alternationNext?.['B-2']).toBe('squat');
    b = (await db.templates.get('B'))!; expect(b.slots[1].exerciseIds).toEqual(['split-squat', 'squat']); b.slots[1].alternating = true; await saveTemplate(b, await rev()); expect((await startSession('B')).exercises[1].exercise.id).toBe('squat');
  });
  it('creates a stable independent ID, duplicates with fresh slot IDs and validates duplicate codes', async () => {
    const d = await custom(); expect(d.id).not.toBe('D'); expect((await db.program.get('program'))?.sequence).toEqual(['A', 'B', 'C', d.id]);
    const copy = await duplicateTemplate(d.id, await rev()); expect(copy.id).not.toBe(d.id); expect(copy.slots[0].id).not.toBe(d.slots[0].id);
    expect(copy.slots[0].exerciseIds).toEqual(d.slots[0].exerciseIds);
    await expect(custom('d')).rejects.toThrow('обозначение');
  });
  it('edits metadata/sets/reps/order and keeps active and historical snapshots unchanged', async () => {
    const history = await finishA(); const active = await startSession('B');
    const a = (await db.templates.get('A'))!; a.name = 'Новое название'; a.code = 'PULL'; a.slots.reverse(); a.slots[0].sets = 5; a.slots[0].reps = [5, 15]; a.slots[0].descriptionOverride = 'Локальная техника';
    await saveTemplate(a, await rev());
    expect(await db.sessions.get(history.id)).toEqual(history); expect(await db.sessions.get(active.id)).toEqual(active);
    expect((await db.templates.get('A'))?.slots[0].id).toBe('A-7');
  });
  it('rejects invalid set counts, ranges, missing/archived exercises and stale revisions', async () => {
    const source = (await db.templates.get('A'))!;
    for (const [sets, reps] of [[0, [8, 12]], [1.5, [8, 12]], [101, [8, 12]], [3, [12, 8]], [3, [0, 8]]] as [number, [number, number]][]) { const draft = structuredClone(source); draft.slots[0].sets = sets; draft.slots[0].reps = reps; await expect(saveTemplate(draft, await rev())).rejects.toThrow(); }
    const draft = structuredClone(source); draft.slots[0].exerciseIds = ['missing']; await expect(saveTemplate(draft, await rev())).rejects.toThrow('архивное');
    await saveTemplate(source, await rev()); await expect(saveTemplate(source, 0)).rejects.toThrow('другой вкладке');
  });
  it('supports any cycle length, explicit next selection and reordering without shifting the next ID', async () => {
    const d = await custom(); await updateCycle([d.id, 'C', 'A', 'B'], 'B', 'Моя программа', await rev());
    const b = await startSession('B'); const done = await saveSession({ ...b, exercises: b.exercises.map((row, i) => i === 0 ? { ...row, sets: row.sets.map(set => ({ ...set, weightKg: 10, reps: 10, status: 'completed' })) } : row) }, b.revision);
    await finishSession(done.id, done.revision); expect((await db.program.get('program'))?.nextTemplateId).toBe(d.id);
    await updateCycle(['A', 'B', d.id, 'C'], d.id, 'Моя программа', await rev()); expect((await db.program.get('program'))?.nextTemplateId).toBe(d.id);
  });
  it('requires a replacement for archiving the next template, restores archives and never permits an empty cycle', async () => {
    await expect(archiveTemplate('A', true, await rev())).rejects.toThrow('Выберите');
    await archiveTemplate('A', true, await rev(), 'B'); expect((await db.program.get('program'))?.nextTemplateId).toBe('B');
    await archiveTemplate('A', false, await rev()); expect((await db.program.get('program'))?.sequence).toEqual(['B', 'C', 'A']);
    await archiveTemplate('A', true, await rev()); await archiveTemplate('C', true, await rev());
    await expect(archiveTemplate('B', true, await rev())).rejects.toThrow('последнюю');
  });
  it('blocks cycle/alternation changes during active work but permits future template parameters', async () => {
    const active = await startSession('B');
    await expect(updateCycle(['C', 'B', 'A'], 'C', 'Программа', await rev())).rejects.toThrow('активную');
    await expect(custom()).rejects.toThrow('активную');
    const b = (await db.templates.get('B'))!; b.slots[0].reps = [5, 8]; await saveTemplate(b, await rev());
    expect(await db.sessions.get(active.id)).toEqual(active);
    const updated = (await db.templates.get('B'))!; updated.slots[1].exerciseIds.reverse(); await expect(saveTemplate(updated, await rev())).rejects.toThrow('активную');
  });
  it('preserves previous results after stable-slot reordering and isolates replacements', async () => {
    await finishA(); const a = (await db.templates.get('A'))!; a.slots.reverse(); await saveTemplate(a, await rev());
    const session = await startSession('A'); expect(session.exercises.find(row => row.slotId === 'A-1')?.sets[0].weightKg).toBe(5); await discardDraft(session.id);
    const replaced = (await db.templates.get('A'))!; replaced.slots.find(row => row.id === 'A-1')!.exerciseIds = ['bench-press']; await saveTemplate(replaced, await rev());
    expect((await startSession('A')).exercises.find(row => row.slotId === 'A-1')?.sets[0].weightKg).toBeNull();
  });
  it('advances arbitrary alternation positions on actual work only and supports disabling', async () => {
    const d = await custom(); d.slots[0].exerciseIds = ['pull-up', 'bench-press', 'squat']; d.slots[0].alternating = true; await saveTemplate(d, await rev(), { [d.slots[0].id]: 'bench-press' });
    let session = await startSession(d.id); expect(session.exercises[0].exercise.id).toBe('bench-press');
    await finishSession(session.id, session.revision); expect((await db.program.get('program'))?.alternationNext?.[d.slots[0].id]).toBe('bench-press');
    session = await startSession(d.id); Object.assign(session.exercises[0].sets[0], { weightKg: 20, reps: 8, status: 'completed' }); session = await saveSession(session, session.revision); await finishSession(session.id, session.revision);
    expect((await db.program.get('program'))?.alternationNext?.[d.slots[0].id]).toBe('squat');
    const disabled = (await db.templates.get(d.id))!; disabled.slots[0].alternating = false; await saveTemplate(disabled, await rev());
    session = await startSession(d.id); expect(session.exercises[0].exercise.id).toBe('pull-up');
  });
  it('invalidates historical rollback after program structure changes', async () => {
    const finished = await finishA(); await custom(); await expect(deleteHistory(finished.id, finished.revision, true)).rejects.toThrow('изменения');
  });
  it('does not restore templates with archived references and preserves muscle snapshots on library edits', async () => {
    const history = await finishA(); expect(history.exercises[0].exercise.primaryMuscle).toBe('Широчайшие');
    const exercise = (await db.exercises.get('pull-up'))!; await saveExercise({ ...exercise, primaryMuscle: 'Другое' }, exercise.revision ?? 0);
    expect((await db.sessions.get(history.id))?.exercises[0].exercise.primaryMuscle).toBe('Широчайшие');
    await archiveTemplate('A', true, await rev()); await archiveExercise('pull-up', true, (await db.exercises.get('pull-up'))!.revision!);
    await expect(archiveTemplate('A', false, await rev())).rejects.toThrow('архивные упражнения');
  });
});
describe('exercise library and migration', () => {
  it('creates/edits variants with full metadata and archives history-only exercises safely', async () => {
    const created = await saveExercise(withExerciseMetadata({ id: createId(), name: 'Тест пресса', description: 'Техника', weightMode: 'bodyweight', unilateral: false, primaryMuscle: 'Пресс' }), null);
    const edited = await saveExercise({ ...created, name: 'Пресс на полу' }, created.revision!); expect(edited.id).toBe(created.id);
    const variant = await saveExercise({ ...edited, weightMode: 'additional' }, edited.revision!, true); expect(variant.id).not.toBe(created.id);
    await expect(archiveExercise('pull-up', true, 0)).rejects.toThrow('Сначала замените');
    const old = await finishA(); const a = (await db.templates.get('A'))!; a.slots = a.slots.filter(slot => !slot.exerciseIds.includes('pull-up')); await saveTemplate(a, await rev());
    await archiveExercise('pull-up', true, 0); expect((await db.exercises.get('pull-up'))?.archived).toBe(true); expect(await db.sessions.get(old.id)).toEqual(old);
    await archiveExercise('pull-up', false, 1); expect((await db.exercises.get('pull-up'))?.archived).toBe(false);
  });
  it('does not prefill technically incompatible results even with the same exercise ID', async () => {
    await finishA(); const exercise = (await db.exercises.get('pull-up'))!;
    await saveExercise({ ...exercise, description: 'Другой технический вариант', repetitionRule: 'На каждую попытку' }, exercise.revision ?? 0);
    expect((await startSession('A')).exercises[0].previousSets).toBeUndefined();
  });
  it('migrates v3 data preserving history, active snapshot, next template, settings and actual B alternation', async () => {
    const name = 'log-v3-program-migration'; const legacy = new Dexie(name);
    legacy.version(3).stores({ exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt, endedAt', settings: 'id', program: 'id', bodyWeights: 'id, measuredAt' });
    const state = { ...initialProgram, nextTemplateId: 'C', alternationCount: 5 };
    const active = createSession(initialTemplates[1], state, initialExercises);
    await legacy.table('program').add({ ...state, activeSessionId: active.id }); await legacy.table('settings').add({ ...initialSettings, trainingDays: [1, 5] });
    const historical = { ...structuredClone(active), id: 'old-history', status: 'skipped' as const, endedAt: active.startedAt };
    await legacy.table('templates').bulkAdd(structuredClone(initialTemplates)); await legacy.table('exercises').bulkAdd([...structuredClone(initialExercises), { id: 'mine', name: 'Моё упражнение', description: 'Мой текст', weightMode: 'total', unilateral: false }]); await legacy.table('sessions').bulkAdd([active, historical]); legacy.close();
    const migrated = new LogDatabase(name);
    try { expect(await migrated.sessions.get(active.id)).toEqual(active); expect(await migrated.sessions.get(historical.id)).toEqual(historical); expect(await migrated.program.get('program')).toMatchObject({ nextTemplateId: 'C', sequence: ['A', 'B', 'C'], alternationNext: { 'B-2': 'squat' } }); expect((await migrated.exercises.get('mine'))?.description).toBe('Мой текст'); expect((await migrated.settings.get('user'))?.trainingDays).toEqual([1, 5]); expect(await migrated.scheduleExceptions.count()).toBe(0); } finally { await migrated.delete(); }
  });
});
