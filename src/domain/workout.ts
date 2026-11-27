import type { SessionExercise, WorkingSet, WorkoutSession } from './models';
import { createId } from './id';

export function parseWeight(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export function parseReps(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
export function validSet(set: WorkingSet, separate = false): boolean {
  const valid = (weight: number | null | undefined, reps: number | null | undefined) => typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && typeof reps === 'number' && Number.isSafeInteger(reps) && reps > 0;
  return valid(set.weightKg, set.reps) && (!separate || valid(set.rightWeightKg, set.rightReps));
}
export function completedSets(exercise: SessionExercise): WorkingSet[] {
  return exercise.skipped ? [] : exercise.sets.filter(set => set.status === 'completed' && validSet(set, exercise.separateSides));
}
export function progress(session: WorkoutSession) {
  const mandatory = session.exercises.filter(exercise => !exercise.optional);
  const optional = session.exercises.filter(exercise => exercise.optional);
  const done = mandatory.reduce((sum, exercise) => sum + completedSets(exercise).length, 0);
  const goals = new Map((session.originalExercises ?? []).filter(row => !row.optional).map(row => [row.slotId, row.sets.length]));
  for (const row of mandatory) goals.set(row.slotId, Math.max(goals.get(row.slotId) ?? 0, row.sets.length));
  const total = [...goals.values()].reduce((sum, count) => sum + count, 0);
  const missing = [...goals].reduce((sum, [slot, target]) => { const row = mandatory.find(row => row.slotId === slot); return sum + Math.max(0, target - (row ? completedSets(row).length : 0)); }, 0);
  return { done, total, missing, actualTotal: mandatory.reduce((sum, row) => sum + row.sets.length, 0),
    optionalDone: optional.reduce((sum, exercise) => sum + completedSets(exercise).length, 0),
    optionalTotal: optional.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    exercisesDone: session.exercises.filter(exercise => completedSets(exercise).length > 0).length,
    confirmed: session.exercises.reduce((sum, exercise) => sum + completedSets(exercise).length, 0),
  };
}
export function classify(session: WorkoutSession): 'completed' | 'incomplete' | 'skipped' {
  const stats = progress(session);
  return stats.confirmed === 0 ? 'skipped' : stats.missing > 0 ? 'incomplete' : 'completed';
}
export function duration(startedAt: string, endedAt?: string | null, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor(((endedAt ? new Date(endedAt).getTime() : now) - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function newSet(weightKg: number | null = null): WorkingSet {
  return { id: createId(), weightKg, reps: null, status: 'pending' };
}
/** Only confirmed results with matching template slot AND exercise are reusable. */
export function prefillSession(session: WorkoutSession, history: WorkoutSession[]): void {
  for (const exercise of session.exercises) {
    const previous = history.filter(item => item.templateId === session.templateId && (item.status === 'completed' || item.status === 'incomplete'))
      .sort((a, b) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt))
      .flatMap(item => item.exercises.filter(row => row.slotId === exercise.slotId && row.exercise.id === exercise.exercise.id && compatibleLoad(row.exercise, exercise.exercise) && completedSets(row).length > 0))[0];
    if (!previous) {
      if (['additional', 'bodyweight'].includes(exercise.exercise.weightMode)) exercise.sets.forEach(set => { set.weightKg = 0; });
      continue;
    }
    const results = completedSets(previous);
    exercise.previousSets = structuredClone(results);
    exercise.separateSides = previous.separateSides;
    const last = results[results.length - 1];
    exercise.sets = exercise.sets.map((set, index) => {
      const candidate = previous.sets[index];
      const source = candidate?.status === 'completed' && validSet(candidate, previous.separateSides) ? candidate : undefined;
      const extra = index >= previous.sets.length;
      return { ...set, weightKg: source?.weightKg ?? (extra ? last.weightKg : null), reps: source?.reps ?? null,
        rightWeightKg: source?.rightWeightKg ?? (extra ? last.rightWeightKg : null), rightReps: source?.rightReps ?? null, status: 'pending' };
    });
  }
}
function compatibleLoad(a: SessionExercise['exercise'], b: SessionExercise['exercise']) {
  const rule = (exercise: typeof a) => exercise.repetitionRule ?? (exercise.unilateral ? 'Повторения на одну сторону; подход включает обе стороны' : 'Повторения за подход');
  return (a.comparisonKey ?? a.id) === (b.comparisonKey ?? b.id) && a.weightMode === b.weightMode && (a.customWeightNote ?? '') === (b.customWeightNote ?? '') && a.unilateral === b.unilateral && rule(a) === rule(b);
}
export const weightLabels = {
  total: 'Общий вес вместе с грифом', 'per-dumbbell': 'Вес одной гантели',
  machine: 'Установленный вес тренажёра, кг', additional: 'Дополнительное отягощение, кг', smith: 'Учёт веса — по пояснению к Смиту',
  plates: 'Вес установленных блинов, кг', bodyweight: 'Собственный вес без отягощения (в поле веса — 0)', custom: 'Пользовательский учёт — по пояснению',
};
