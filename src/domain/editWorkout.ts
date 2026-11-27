import type { Exercise, SessionExercise, WorkingSet } from './models';
import { createId } from './id';
import { newSet, parseReps, parseWeight } from './workout';
export type SetField = 'weightText' | 'repsText' | 'rightWeightText' | 'rightRepsText';
export function editSet(set: WorkingSet, field: SetField, value: string) {
  set[field] = value;
  const property = { weightText: 'weightKg', repsText: 'reps', rightWeightText: 'rightWeightKg', rightRepsText: 'rightReps' } as const;
  set[property[field]] = field === 'weightText' || field === 'rightWeightText' ? parseWeight(value) : parseReps(value);
  set.status = 'pending';
}
export function splitSides(exercise: SessionExercise, separate: boolean) {
  exercise.separateSides = separate;
  for (const set of exercise.sets) {
    if (separate) { set.rightWeightKg = set.weightKg; set.rightReps = set.reps; set.rightWeightText = set.weightText; set.rightRepsText = set.repsText; }
    set.status = 'pending';
  }
}
export function addedExercise(exercise: Exercise): SessionExercise {
  return { slotId: `extra-${createId()}`, exercise: structuredClone(exercise), targetReps: [8, 12], plannedSets: 3, optional: false, added: true, notes: '', sets: Array.from({ length: 3 }, () => newSet()) };
}
export function replaceExercise(target: SessionExercise, exercise: Exercise) {
  target.exercise = structuredClone(exercise); target.skipped = false; target.separateSides = false; target.previousSets = [];
  target.sets = Array.from({ length: target.sets.length || target.plannedSets || 3 }, () => newSet());
}
