import type { Exercise, ProgramState, SessionExercise, WorkoutSession, WorkoutTemplate } from '../models';
import { variantIndex } from '../session';
import { completedSets, validSet } from '../workout';
import type { ExercisePoint, ExerciseSeries } from './index';
import { comparisonKey } from './metrics';
import { dynamics } from './dynamics';
export interface Recommendation { kind: 'increase' | 'keep' | 'slowed'; title: string; reason: string; point: ExercisePoint }
export interface CurrentRecommendation { exercise: Exercise; template: WorkoutTemplate; slotId: string; value: Recommendation }
export function currentRecommendations(series: ExerciseSeries[], templates: WorkoutTemplate[], library: Exercise[], program: ProgramState, history: WorkoutSession[]): CurrentRecommendation[] {
  return templates.filter(template => !template.archived).flatMap(template => template.slots.filter(slot => !slot.optional).flatMap(slot => {
    const exercise = library.find(row => row.id === slot.exerciseIds[variantIndex(slot, program)]); if (!exercise || exercise.archived) return [];
    const row: SessionExercise = { slotId: slot.id, exercise, targetReps: slot.reps, plannedSets: slot.sets, optional: slot.optional, sets: [], notes: '' };
    const value = recommendationForActive(series, row, template.id, history); return value ? [{ exercise, template, slotId: slot.id, value }] : [];
  }));
}
export function recommendation(points: ExercisePoint[]): Recommendation | null {
  const point = points.at(-1); if (!point) return null;
  const targets: Array<{ row: SessionExercise; source: SessionExercise }> = [];
  const key = comparisonKey(point.rows[0].exercise);
  for (const source of point.session.originalExercises ?? []) {
    if (source.optional || source.added || comparisonKey(source.exercise) !== key) continue;
    const row = point.rows.find(row => row.slotId === source.slotId);
    if (!row || !source.sets.length || (source.plannedSets ?? source.sets.length) > source.sets.length) return null;
    targets.push({ row, source });
  }
  if (!targets.length) return null;
  const originals = targets.flatMap(({ row, source }) => source.sets.map(original => ({ set: row.sets.find(set => set.id === original.id), row, source })));
  // New extra IDs cannot stand in for a deleted mandatory set.
  if (originals.some(({ set, row }) => !set || row.skipped || set.status !== 'completed' || !validSet(set, row.separateSides))) return null;
  const weights = originals.flatMap(({ set, row }) => row.separateSides ? [set!.weightKg!, set!.rightWeightKg!] : [set!.weightKg!]);
  const sameWeight = weights.every(weight => weight === weights[0]);
  if (!sameWeight) return null;
  const reached = originals.every(({ set, row, source }) => set!.reps! >= source.targetReps[1] && (!row.separateSides || set!.rightReps! >= source.targetReps[1]));
  if (reached && point.rows[0].exercise.weightMode !== 'bodyweight') return { kind: 'increase', title: 'Можно попробовать увеличить вес', reason: `${weights[0]} кг × ${originals.map(({ set, row }) => row.separateSides ? `${set!.reps}/${set!.rightReps}` : set!.reps).join(' / ')}. Верхняя граница повторений достигнута во всех ${originals.length} обязательных подходах. Следующий вес выбирайте по доступному шагу нагрузки.`, point };
  const signature = (point: ExercisePoint) => JSON.stringify([point.session.templateId, point.session.originalExercises.filter(row => comparisonKey(row.exercise) === key).map(row => [row.slotId, row.targetReps, row.sets.length, row.plannedSets, row.optional])]);
  const templatePoints: ExercisePoint[] = []; for (const old of [...points].reverse()) { if (signature(old) !== signature(point)) break; templatePoints.unshift(old); }
  if (dynamics(templatePoints).slowed) return { kind: 'slowed', title: 'Заметное улучшение пока не зафиксировано', reason: 'За последние четыре сопоставимые тренировки заметного улучшения не зафиксировано. Это не доказательство физиологического застоя. Проверьте технику, восстановление и соответствие нагрузки целевому диапазону.', point };
  return { kind: 'keep', title: 'Сохранить текущий вес', reason: 'Верхняя граница диапазона ещё не достигнута во всех обязательных подходах. Продолжайте постепенно увеличивать повторы в целевом диапазоне.', point };
}
export function recommendationForActive(series: ExerciseSeries[], row: SessionExercise, templateId: string, history?: WorkoutSession[]): Recommendation | null {
  if (row.optional || row.added) return null;
  const found = series.find(item => item.key === comparisonKey(row.exercise));
  if (!found) return null;
  const candidates = found.points.filter(point => point.session.templateId === templateId).map(point => ({ ...point, session: { ...point.session, originalExercises: point.session.originalExercises.filter(source => source.slotId === row.slotId) }, rows: point.rows.filter(old => old.slotId === row.slotId), observations: point.observations.filter(old => old.row.slotId === row.slotId) })).filter(point => point.rows.length > 0);
  const latest = candidates.at(-1); if (!latest) return null;
  const lastSession = history?.filter(session => {
    if (session.status === 'active' || session.templateId !== templateId) return false;
    const source = session.originalExercises.find(source => source.slotId === row.slotId);
    // Another explicitly recorded alternating variant is not an attempt at this exercise.
    // Replacement/skipping of THIS variant still blocks reviving its older advice.
    return !(source && source.exercise.id !== row.exercise.id && source.alternation?.variantIds.includes(row.exercise.id));
  }).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id)).at(-1);
  if (lastSession && lastSession.id !== latest.session.id) return null;
  const matches = (point: ExercisePoint) => { const source = point.session.originalExercises[0], old = point.rows[0]; return source && !source.optional && !source.added && comparisonKey(source.exercise) === comparisonKey(row.exercise) && source.sets.length === row.plannedSets && (source.plannedSets ?? source.sets.length) === row.plannedSets && JSON.stringify(source.targetReps) === JSON.stringify(row.targetReps) && JSON.stringify(old.targetReps) === JSON.stringify(row.targetReps); };
  const points: ExercisePoint[] = []; for (const point of [...candidates].reverse()) { if (!matches(point)) break; points.unshift(point); }
  return points.length ? recommendation(points) : null;
}
