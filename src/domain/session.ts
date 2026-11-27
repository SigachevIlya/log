import type { Exercise, ProgramState, TemplateSlot, WorkoutSession, WorkoutTemplate } from './models';
import { createId } from './id';
export function variantIndex(slot: TemplateSlot, program: ProgramState): number {
  if (slot.alternating === false) return Math.max(0, slot.exerciseIds.indexOf(slot.primaryExerciseId ?? slot.exerciseIds[0]));
  const next = program.alternationNext?.[slot.id];
  if (next && slot.exerciseIds.includes(next)) return slot.exerciseIds.indexOf(next);
  return slot.id === 'B-2' ? program.alternationCount % slot.exerciseIds.length : 0;
}
export function resolveExercise(slot: TemplateSlot, completedCount: number, exercises: Exercise[]): Exercise {
  const id = slot.exerciseIds[completedCount % slot.exerciseIds.length];
  const exercise = exercises.find(item => item.id === id);
  if (!exercise) throw new Error(`Упражнение ${id} не найдено`);
  return exercise;
}
export function createSession(template: WorkoutTemplate, program: ProgramState, exercises: Exercise[], now = new Date()): WorkoutSession {
  const session: WorkoutSession = {
    id: createId(), templateId: template.id, templateRevision: template.revision,
    name: template.name, templateCode: template.code ?? template.id, muscleGroups: [...template.muscleGroups], status: 'active',
    startedAt: now.toISOString(), endedAt: null, notes: '', revision: 0, advanceCycle: true, originalExercises: [],
    exercises: template.slots.map(slot => ({
      slotId: slot.id, exercise: { ...structuredClone(resolveExercise(slot, variantIndex(slot, program), exercises)), ...(slot.descriptionOverride !== undefined ? { description: slot.descriptionOverride } : {}) },
      alternation: slot.exerciseIds.length > 1 && slot.alternating !== false ? { variantIds: [...slot.exerciseIds], selectedId: resolveExercise(slot, variantIndex(slot, program), exercises).id } : undefined,
      targetReps: [...slot.reps], optional: slot.optional, notes: '', plannedSets: slot.sets,
      sets: Array.from({ length: slot.sets }, () => ({ id: createId(), weightKg: null, reps: null, status: 'pending' })),
    })),
  };
  session.originalExercises = structuredClone(session.exercises);
  return session;
}
