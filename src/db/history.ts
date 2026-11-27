import { db } from './database';
import type { WorkoutSession } from '../domain/models';
import { classify, validSet } from '../domain/workout';
import { rollbackReason } from '../domain/cycle';

export async function saveHistory(edited: WorkoutSession, expectedRevision: number): Promise<WorkoutSession> {
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(edited.id);
    if (!current || current.status === 'active') throw new Error('Историческая запись не найдена.');
    if (current.revision !== expectedRevision) throw new Error('Запись изменена в другой вкладке. Откройте её заново.');
    const start = Date.parse(edited.startedAt), end = Date.parse(edited.endedAt ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Проверьте дату и время начала/окончания.');
    for (const row of edited.exercises) for (const set of row.sets) {
      if ((set.status === 'completed' || (set.status === 'pending' && (set.weightKg != null || set.reps != null || set.weightText || set.repsText || set.rightWeightText || set.rightRepsText))) && !validSet(set, row.separateSides)) throw new Error('Исправьте некорректные результаты подходов.');
    }
    const saved = { ...current, exercises: structuredClone(edited.exercises), startedAt: edited.startedAt, endedAt: edited.endedAt, notes: edited.notes, revision: current.revision + 1 };
    saved.status = classify(saved);
    saved.exercises = saved.exercises.map(row => ({ ...row, sets: row.sets.map(set => !row.skipped && set.status === 'completed' ? set : { id: set.id, status: 'skipped', weightKg: null, reps: null, rightWeightKg: null, rightReps: null }) }));
    await db.sessions.put(saved); return saved;
  });
}
export async function deleteHistory(id: string, revision: number, restore = false) {
  return db.transaction('rw', [db.sessions, db.program], async () => {
    const session = await db.sessions.get(id), program = await db.program.get('program');
    if (!session || session.status === 'active' || !program) throw new Error('Историческая запись не найдена.');
    if (session.revision !== revision) throw new Error('Запись изменилась. Откройте её заново.');
    if (restore) {
      const reason = rollbackReason(session, program, await db.sessions.where('status').equals('active').count() > 0);
      if (reason) throw new Error(reason);
      await db.program.update('program', { ...session.cycleBefore!, cycleRevision: (program.cycleRevision ?? 0) + 1 });
    } else {
      await db.program.update('program', { cycleRevision: (program.cycleRevision ?? 0) + 1 });
    }
    await db.sessions.delete(id);
  });
}
