import { describe, expect, it } from 'vitest';
import { initialExercises, initialProgram, initialTemplates } from '../data/seed';
import { nextTemplate, nextTrainingDate, weekDates } from './schedule';
import { createSession, resolveExercise } from './session';

describe('program and snapshots', () => {
  it('contains the prescribed mandatory and optional set totals', () => {
    expect(initialTemplates.map(template => template.slots.filter(slot => !slot.optional).reduce((sum, slot) => sum + slot.sets, 0))).toEqual([22, 19, 22]);
    expect(initialTemplates[1].slots.filter(slot => slot.optional).reduce((sum, slot) => sum + slot.sets, 0)).toBe(3);
    for (const template of initialTemplates) for (const slot of template.slots) for (const id of slot.exerciseIds) expect(initialExercises.some(exercise => exercise.id === id)).toBe(true);
  });
  it('alternates B from split squats based only on completed B sessions', () => {
    const slot = initialTemplates[1].slots[1];
    expect([0, 1, 2].map(count => resolveExercise(slot, count, initialExercises).id)).toEqual(['split-squat', 'squat', 'split-squat']);
  });
  it('keeps session snapshots independent from subsequent library/template edits', () => {
    const templates = structuredClone(initialTemplates);
    const exercises = structuredClone(initialExercises);
    const session = createSession(templates[0], initialProgram, exercises);
    const originalName = session.exercises[0].exercise.name;
    templates[0].slots[0].reps[0] = 99;
    exercises[0].name = 'Изменено';
    expect(session.exercises[0].exercise.name).toBe(originalName);
    expect(session.exercises[0].targetReps).toEqual([8, 12]);
    expect(session.exercises[0].sets.every(set => set.weightKg === null && set.reps === null && set.status === 'pending')).toBe(true);
    expect(new Set(session.exercises.flatMap(item => item.sets.map(set => set.id))).size).toBe(22);
  });
});
describe('schedule', () => {
  it('moves missed days forward without changing the workout sequence', () => {
    const next = nextTrainingDate(new Date(2026, 10, 27, 23), [2, 4, 0])!;
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 10, 29]);
    expect(initialProgram.nextTemplateId).toBe('A');
    expect(['A', 'B', 'C'].map(id => nextTemplate(id as 'A' | 'B' | 'C'))).toEqual(['B', 'C', 'A']);
  });
  it('includes today, supports customized days and handles no schedule', () => {
    expect(nextTrainingDate(new Date(2026, 10, 26), [2, 4, 0])?.getDate()).toBe(26);
    expect(nextTrainingDate(new Date(2026, 10, 27), [1])?.getDate()).toBe(30);
    expect(nextTrainingDate(new Date(), [])).toBeNull();
  });
  it('starts the week on Monday, including across year boundaries', () => {
    const week = weekDates(new Date(2027, 0, 1));
    expect(week[0].getDay()).toBe(1);
    expect(week[0].getFullYear()).toBe(2026);
    expect(week[6].getDay()).toBe(0);
    expect(week[6].getDate()).toBe(3);
  });
});
