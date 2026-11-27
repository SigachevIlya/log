import { describe, expect, it } from 'vitest';
import { initialExercises, initialProgram, initialTemplates } from '../data/seed';
import { createSession } from './session';
import { completedSets, duration, newSet, parseReps, parseWeight, prefillSession, progress, validSet } from './workout';
import { addedExercise, editSet, replaceExercise, splitSides } from './editWorkout';

describe('results and editing', () => {
  it('accepts zero and decimal comma weights, only positive whole repetitions', () => {
    expect(['0', '12,5', '12.5', ' 20 '].map(parseWeight)).toEqual([0, 12.5, 12.5, 20]);
    for (const value of ['', '-1', '1e2', 'Infinity', '2,3,4', '5kg']) expect(parseWeight(value)).toBeNull();
    for (const value of ['', '0', '-1', '1.5', '1,5', '1e2']) expect(parseReps(value)).toBeNull();
    expect(parseReps('12')).toBe(12);
  });
  it('requires reconfirmation after editing completed results and validates both sides', () => {
    const row = createSession(initialTemplates[0], initialProgram, initialExercises).exercises[1];
    const set = row.sets[0];
    editSet(set, 'weightText', '12,5'); editSet(set, 'repsText', '10');
    expect(validSet(set)).toBe(true); set.status = 'completed';
    editSet(set, 'repsText', '11'); expect(set.status).toBe('pending');
    splitSides(row, true); expect(set.rightWeightKg).toBe(12.5);
    editSet(set, 'rightRepsText', '0'); expect(validSet(set, true)).toBe(false);
    editSet(set, 'rightRepsText', '8'); set.status = 'completed';
    expect(completedSets(row)).toHaveLength(1);
    expect(set.reps).toBe(11); expect(set.rightReps).toBe(8);
  });
  it('counts optional sets independently and keeps skipped mandatory work missing', () => {
    const session = createSession(initialTemplates[1], initialProgram, initialExercises);
    session.exercises[6].sets.forEach(set => Object.assign(set, { weightKg: 10, reps: 10, status: 'completed' }));
    session.exercises[0].skipped = true;
    expect(progress(session)).toMatchObject({ done: 0, total: 19, missing: 19, optionalDone: 3, optionalTotal: 3 });
    session.exercises[0].sets = [];
    expect(progress(session)).toMatchObject({ total: 19, actualTotal: 16 });
  });
  it('changes only session instances when adding, replacing or editing exercise notes', () => {
    const session = createSession(initialTemplates[0], initialProgram, initialExercises);
    const original = structuredClone(session.originalExercises);
    const added = addedExercise(initialExercises[0]);
    session.exercises.push(added); replaceExercise(session.exercises[0], initialExercises[1]);
    session.exercises[0].notes = 'Новая заметка';
    expect(added.added).toBe(true); expect(added.slotId).toMatch(/^extra-/);
    expect(session.originalExercises).toEqual(original);
    expect(initialTemplates[0].slots).toHaveLength(7);
    expect(newSet(15)).toMatchObject({ weightKg: 15, reps: null, status: 'pending' });
  });
  it('restores elapsed time from timestamps and freezes completed duration', () => {
    expect(duration('2026-11-27T09:00:00Z', null, Date.parse('2026-11-27T10:02:03Z'))).toBe('01:02:03');
    expect(duration('2026-11-27T09:00:00Z', '2026-11-27T09:10:00Z', Date.now())).toBe('00:10:00');
  });
});
describe('previous results', () => {
  it('matches template, slot and exercise, preserves gaps and prefills only pending sets', () => {
    const old = createSession(initialTemplates[1], initialProgram, initialExercises);
    old.status = 'completed'; old.endedAt = new Date().toISOString();
    old.exercises[0].sets = [newSet(), { ...newSet(20), reps: 10, status: 'completed' }];
    const fresh = createSession(initialTemplates[1], initialProgram, initialExercises);
    prefillSession(fresh, [old]);
    expect(fresh.exercises[0].sets.map(set => [set.weightKg, set.reps, set.status])).toEqual([[null, null, 'pending'], [20, 10, 'pending'], [20, null, 'pending']]);
    const c = createSession(initialTemplates[2], initialProgram, initialExercises);
    prefillSession(c, [old]); expect(c.exercises[0].sets[0].weightKg).toBeNull();
    const wrongSlot = structuredClone(old); wrongSlot.exercises[0].slotId = 'other';
    const other = createSession(initialTemplates[1], initialProgram, initialExercises);
    prefillSession(other, [wrongSlot]); expect(other.exercises[0].previousSets).toBeUndefined();
    const wrongVariant = structuredClone(old); wrongVariant.exercises[0].exercise.id = 'row-upper';
    prefillSession(other, [wrongVariant]); expect(other.exercises[0].previousSets).toBeUndefined();
  });
});
