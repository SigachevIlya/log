import type { Exercise, ProgramState, ScheduleException, Settings, WorkoutSession, WorkoutTemplate } from '../models';
import { dateKey, dayPlan } from '../calendar';
import { variantIndex } from '../session';
import { weekStart } from './periods';
import { addMuscleVolume, type MuscleVolume } from './volume';
export function weeklyPlan(now: Date, history: WorkoutSession[], templates: WorkoutTemplate[], library: Exercise[], program: ProgramState, settings: Settings, exceptions: ScheduleException[], general = true) {
  const historical = new Map<string, MuscleVolume>(), future = new Map<string, MuscleVolume>();
  const byDate = new Map<string, WorkoutSession[]>();
  for (const session of history) if (session.status !== 'active') { const key = dateKey(new Date(session.startedAt)); const rows = byDate.get(key) ?? []; rows.push(session); byDate.set(key, rows); }
  const start = weekStart(now), today = dateKey(now), sequence = program.sequence ?? [], indices = new Map(sequence.map((id, index) => [id, index])); let next = program.nextTemplateId;
  const alternationNext = { ...program.alternationNext }; let uncertainPast = false, required = 0, optional = 0;
  for (let index = 0; index < 7; index++) {
    const date = new Date(start); date.setDate(date.getDate() + index); const key = dateKey(date), records = byDate.get(key) ?? [];
    if (records.length) {
      for (const session of records) {
        if (!session.originalExercises?.length) { uncertainPast = true; continue; }
        for (const row of session.originalExercises) { if (row.optional) { optional += row.sets.length; continue; } required += row.sets.length; addMuscleVolume(historical, row.exercise, row.sets.length, general); }
      }
    } else if (key < today) uncertainPast = true;
    else if (!program.activeSessionId && dayPlan(date, settings.trainingDays, exceptions).planned) {
      const template = templates.find(row => row.id === next && !row.archived); if (!template) continue;
      for (const slot of template.slots) {
        if (slot.optional) { optional += slot.sets; continue; }
        required += slot.sets;
        const id = slot.exerciseIds[variantIndex(slot, { ...program, alternationNext })], exercise = library.find(row => row.id === id);
        if (exercise) addMuscleVolume(future, exercise, slot.sets, general);
        if (slot.alternating !== false && slot.exerciseIds.length > 1) alternationNext[slot.id] = slot.exerciseIds[(slot.exerciseIds.indexOf(id) + 1) % slot.exerciseIds.length];
      }
      next = sequence[((indices.get(next) ?? 0) + 1) % sequence.length] ?? next;
    }
  }
  return { historical: [...historical.values()], future: [...future.values()], uncertainPast, required, optional, futureBlocked: !!program.activeSessionId };
}
