import Dexie, { type Table } from 'dexie';
import type { BodyWeightEntry, DatabaseState, Exercise, ProgramState, RecoveryDraft, ScheduleException, Settings, WorkoutSession, WorkoutTemplate } from '../domain/models';
import { withExerciseMetadata } from '../data/muscles';
import { initialExercises, initialProgram, initialSettings, initialTemplates } from '../data/seed';
import { createSession } from '../domain/session';
import { classify, completedSets, prefillSession, validSet } from '../domain/workout';
import { cycleSnapshot } from '../domain/cycle';
import { nextTemplate } from '../domain/schedule';
import { createId } from '../domain/id';
import { trackWrite } from '../lib/activity';
import { recoverableSessionEntries, removeRecoveredEntry, sameSessionInput } from '../lib/sessionJournal';
import { reportError } from '../lib/reportError';

export class LogDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  templates!: Table<WorkoutTemplate, string>;
  sessions!: Table<WorkoutSession, string>;
  settings!: Table<Settings, string>;
  program!: Table<ProgramState, string>;
  bodyWeights!: Table<BodyWeightEntry, string>;
  scheduleExceptions!: Table<ScheduleException, string>;
  metadata!: Table<DatabaseState, string>;
  recoveryDrafts!: Table<RecoveryDraft, string>;
  private openedEpoch?: string;
  get epoch() { return this.openedEpoch; }
  override delete(...args: Parameters<Dexie['delete']>) { return super.delete(...args).then(() => { this.openedEpoch = undefined; }); }
  constructor(name = 'log-diary') {
    super(name);
    this.version(1).stores({
      exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt',
      settings: 'id', program: 'id', bodyWeights: 'id, measuredAt',
    });
    this.version(2).stores({
      exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt, endedAt',
      settings: 'id', program: 'id', bodyWeights: 'id, measuredAt',
    }).upgrade(async tx => {
      await tx.table('sessions').toCollection().modify(session => {
        session.revision ??= 0;
        session.advanceCycle ??= true;
        session.originalExercises ??= structuredClone(session.exercises);
        for (const exercise of session.exercises) exercise.plannedSets ??= exercise.sets.length;
      });
      await tx.table('program').toCollection().modify(program => {
        // Version 1 could not finish workouts. Keep any existing counters conservatively.
        program.alternationCount ??= program.completedCounts?.B ?? 0;
      });
    });
    this.version(3).stores({
      exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt, endedAt',
      settings: 'id', program: 'id', bodyWeights: 'id, measuredAt',
    }).upgrade(async tx => {
      await tx.table('sessions').toCollection().modify(session => {
        if (session.status !== 'active') session.status = classify(session);
      });
      await tx.table('program').toCollection().modify(program => { program.cycleRevision ??= 0; });
    });
    this.version(4).stores({ exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt, endedAt', settings: 'id', program: 'id', bodyWeights: 'id, measuredAt', scheduleExceptions: 'id, date, targetDate' }).upgrade(async tx => {
      await tx.table('exercises').toCollection().modify(exercise => Object.assign(exercise, withExerciseMetadata(exercise)));
      const templates = await tx.table('templates').toArray();
      for (const template of templates) {
        template.code ??= template.id; template.description ??= ''; template.archived ??= false;
        await tx.table('templates').put(template);
      }
      await tx.table('program').toCollection().modify(program => {
        program.name ??= 'Основная программа';
        program.sequence ??= templates.filter(row => !row.archived).map(row => row.id);
        if (!program.sequence.length) throw new Error('В старой базе нет активных шаблонов. Миграция отменена без изменения данных.');
        program.alternationNext ??= {};
        for (const template of templates) for (const slot of template.slots) if (slot.exerciseIds.length > 1) program.alternationNext[slot.id] ??= slot.exerciseIds[(slot.id === 'B-2' ? program.alternationCount : 0) % slot.exerciseIds.length];
        // Legacy checkpoints cannot prove the new cycle structure; revision invalidates rollback.
        program.cycleRevision = (program.cycleRevision ?? 0) + 1;
      });
      await tx.table('settings').toCollection().modify(settings => { settings.scheduleRevision ??= 0; });
    });
    this.version(5).stores({ exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt, endedAt', settings: 'id', program: 'id', bodyWeights: 'id, measuredAt', scheduleExceptions: 'id, date, targetDate' }).upgrade(async tx => {
      // Add metadata only to live entities. Historical and active snapshots remain unchanged.
      await tx.table('exercises').toCollection().modify(exercise => {
        exercise.loadCalculation ??= !exercise.unilateral && ['total', 'machine', 'plates', 'smith'].includes(exercise.weightMode) ? 'total' : 'unknown';
        exercise.bodyWeightModel ??= 'unknown';
      });
      await tx.table('bodyWeights').toCollection().modify(entry => { entry.revision ??= 0; });
      await tx.table('settings').toCollection().modify(settings => { settings.recommendationsEnabled ??= true; });
    });
    this.version(6).stores({ exercises: 'id', templates: 'id', sessions: 'id, status, templateId, startedAt, endedAt', settings: 'id', program: 'id', bodyWeights: 'id, measuredAt', scheduleExceptions: 'id, date, targetDate', metadata: 'id', recoveryDrafts: 'id' }).upgrade(async tx => {
      await tx.table('metadata').put({ id: 'state', epoch: createId(), changes: 0 });
    });
    this.use({ stack: 'dbcore', name: 'restore-generation', level: 0, create: core => ({
      ...core,
      transaction: (stores, mode, options) => {
        const names = mode === 'readwrite' && core.schema.tables.some(table => table.name === 'metadata') ? [...new Set([...stores, 'metadata'])] : stores;
        const transaction = core.transaction(names, mode, options);
        if (mode === 'readwrite') trackWrite(transaction as Parameters<typeof trackWrite>[0]);
        return transaction;
      },
      table: name => { const table = core.table(name); return { ...table, mutate: async request => {
        if (name !== 'metadata' && this.openedEpoch !== undefined) {
          const metadata = core.table('metadata');
          const state: DatabaseState | undefined = await metadata.get({ trans: request.trans, key: 'state' });
          if (!state || state.epoch !== this.openedEpoch) throw new Error('Данные заменены восстановлением в другой вкладке. Перезагрузите LOG. перед продолжением.');
          await metadata.mutate({ type: 'put', trans: request.trans, values: [{ ...state, changes: state.changes + 1 }] });
        }
        return table.mutate(request);
      } }; },
    }) });
    this.on('ready', async () => { if (this.openedEpoch === undefined) { const state = await this.metadata.get('state'); if (!state?.epoch) throw new Error('Не удалось прочитать поколение базы. Данные не изменены; требуется проверка хранилища.'); this.openedEpoch = state.epoch; } }, true);
    this.on('blocked', () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('log:database-blocked')); });
    this.on('versionchange', () => { this.close(); if (typeof window !== 'undefined') window.dispatchEvent(new Event('log:database-versionchange')); });
    this.on('populate', tx => {
      tx.table('metadata').put({ id: 'state', epoch: createId(), changes: 0 });
      tx.table('exercises').bulkAdd(structuredClone(initialExercises.map(withExerciseMetadata)));
      tx.table('templates').bulkAdd(structuredClone(initialTemplates.map(template => ({ ...template, code: template.code ?? template.id, description: '', archived: false }))));
      tx.table('settings').add(structuredClone(initialSettings));
      tx.table('program').add({ ...structuredClone(initialProgram), name: 'Основная программа', sequence: initialTemplates.map(row => row.id), alternationNext: { 'B-2': 'split-squat' } });
    });
  }
}
export const db = new LogDatabase(import.meta.env.MODE === 'test' ? 'log-diary-test' : 'log-diary');
let recoveryError = '';
export async function recoverSessionJournal() {
  await db.open();
  recoveryError = '';
  try {
    for (const { key, raw, entry } of recoverableSessionEntries(db.epoch!)) {
      await db.transaction('rw', [db.sessions, db.program], async () => {
        const program = await db.program.get('program'), current = await db.sessions.get(entry.base.id);
        if (!current || current.status !== 'active' || program?.activeSessionId !== current.id) { removeRecoveredEntry(key, raw); return; }
        if (entry.latest.id !== current.id || entry.base.status !== 'active') throw new Error('Некорректный журнал тренировки.');
        if (sameSessionInput(current, entry.latest) && current.revision >= entry.base.revision) { removeRecoveredEntry(key, raw); return; }
        const baseMatches = current.revision === entry.base.revision && sameSessionInput(current, entry.base);
        const inflightMatches = entry.inflight && current.revision === entry.base.revision + 1 && sameSessionInput(current, entry.inflight);
        if (!baseMatches && !inflightMatches) { recoveryError = 'Несохранённый ввод из закрытой вкладки конфликтует с более новой записью. Текущие результаты сохранены; старые значения не применены.'; return; }
        await saveSession({ ...current, exercises: entry.latest.exercises, notes: entry.latest.notes }, current.revision);
      });
      // Remove only after the outer transaction committed successfully.
      if (!recoveryError) removeRecoveredEntry(key, raw);
    }
  } catch (error) { reportError('Восстановление несохранённого ввода', error); recoveryError = 'Не удалось восстановить временный ввод. Проверьте сохранённые результаты перед продолжением.'; }
}
export async function loadData() {
  return db.transaction('r', db.tables, async () => {
  const [exercises, templates, settings, program, active, history, exceptions, bodyWeights, metadata, recoveryDrafts] = await Promise.all([
    db.exercises.toArray(), db.templates.toArray(), db.settings.get('user'),
    db.program.get('program'), db.sessions.where('status').equals('active').first(),
    db.sessions.where('status').anyOf('completed', 'incomplete', 'skipped').reverse().sortBy('startedAt'),
    db.scheduleExceptions.toArray(),
    db.bodyWeights.orderBy('measuredAt').toArray(),
    db.metadata.get('state'), db.recoveryDrafts.toArray(),
  ]);
  if (!settings || !program) throw new Error('Не удалось прочитать настройки базы. Данные не были изменены.');
  templates.sort((a, b) => (program.sequence?.indexOf(a.id) ?? 0) - (program.sequence?.indexOf(b.id) ?? 0));
  return { exercises, templates, settings, program, active, history, exceptions, bodyWeights, metadata, recoveryDrafts, recoveryError };
  });
}
export type AppData = Awaited<ReturnType<typeof loadData>>;
/** Serialize across tabs and atomically store snapshot + active pointer. */
export async function startSession(templateId: string, advanceCycle?: boolean) {
  return db.transaction('rw', [db.sessions, db.program, db.templates, db.exercises], async () => {
    const existing = await db.sessions.where('status').equals('active').first();
    if (existing) return existing;
    const program = await db.program.get('program');
    const template = await db.templates.get(templateId);
    if (!program || !template || template.archived || !(program.sequence ?? ['A', 'B', 'C']).includes(template.id)) throw new Error('Активная тренировка программы не найдена');
    const session = createSession(template, program, await db.exercises.toArray());
    session.advanceCycle = template.id === program.nextTemplateId ? true : (advanceCycle ?? false);
    prefillSession(session, await db.sessions.where('status').anyOf('completed', 'incomplete').toArray());
    await db.sessions.add(session);
    await db.program.update('program', { activeSessionId: session.id });
    return session;
  });
}
export async function saveSession(session: WorkoutSession, expectedRevision: number): Promise<WorkoutSession> {
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(session.id);
    if (!current || current.status !== 'active') throw new Error('Тренировка завершена или отменена в другой вкладке.');
    if (current.revision !== expectedRevision) throw new Error('Тренировка изменена в другой вкладке. Откройте её заново перед продолжением.');
    for (const exercise of session.exercises) for (const set of exercise.sets) {
      if (set.status === 'completed' && !validSet(set, exercise.separateSides)) throw new Error('Подтверждённый подход содержит некорректные значения.');
    }
    // A local edit cannot change the original snapshot or session identity.
    const saved = { ...current, exercises: structuredClone(session.exercises), notes: session.notes, revision: current.revision + 1 };
    await db.sessions.put(saved);
    return saved;
  });
}
export async function finishSession(id: string, expectedRevision: number, now = new Date()): Promise<WorkoutSession> {
  return db.transaction('rw', [db.sessions, db.program], async () => {
    const session = await db.sessions.get(id);
    if (!session) throw new Error('Тренировка не найдена.');
    if (session.status !== 'active') return session; // idempotent across clicks/tabs
    if (session.revision !== expectedRevision) throw new Error('Тренировка изменена в другой вкладке. Проверьте результаты перед завершением.');
    const program = await db.program.get('program');
    if (!program) throw new Error('Программа не найдена.');
    for (const exercise of session.exercises) for (const set of exercise.sets) {
      if (set.status === 'completed' && !validSet(set, exercise.separateSides)) throw new Error('Есть некорректный подтверждённый подход.');
    }
    const alternationNext = { ...program.alternationNext };
    let alternateDone = false;
    for (const row of session.exercises) {
      const variants = row.alternation?.variantIds ?? (!session.templateCode && row.slotId === 'B-2' ? ['split-squat', 'squat'] : []);
      if (variants.length > 1 && variants.includes(row.exercise.id) && completedSets(row).length > 0) {
        alternationNext[row.slotId] = variants[(variants.indexOf(row.exercise.id) + 1) % variants.length];
        if (row.slotId === 'B-2') alternateDone = true;
      }
    }
    const status = classify(session);
    const before = cycleSnapshot(program);
    const after = { ...before, cycleRevision: before.cycleRevision + 1,
      nextTemplateId: status !== 'skipped' && session.advanceCycle ? nextTemplate(session.templateId, program.sequence) : program.nextTemplateId,
      completedCounts: status === 'skipped' ? before.completedCounts : { ...before.completedCounts, [session.templateId]: (before.completedCounts[session.templateId] ?? 0) + 1 },
      alternationNext: status === 'skipped' ? before.alternationNext : alternationNext,
      alternationCount: before.alternationCount + (status !== 'skipped' && alternateDone ? 1 : 0),
    };
    const finished: WorkoutSession = { ...session, status, cycleBefore: before, cycleAfter: after, endedAt: now.toISOString(), revision: session.revision + 1,
      exercises: session.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.map(set => {
        if (!exercise.skipped && set.status === 'completed') return { ...set, weightText: undefined, repsText: undefined, rightWeightText: undefined, rightRepsText: undefined };
        return { id: set.id, status: 'skipped', weightKg: null, reps: null, rightWeightKg: null, rightReps: null };
      }) })),
    };
    await db.sessions.put(finished);
    await db.program.update('program', { ...after, activeSessionId: null });
    return finished;
  });
}
export async function discardDraft(id: string) {
  await db.transaction('rw', [db.sessions, db.program], async () => {
    const session = await db.sessions.get(id);
    if (!session || session.status !== 'active') return;
    await db.sessions.delete(id);
    await db.program.update('program', { activeSessionId: null });
  });
}
