import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSession } from '../models';
import { createSession } from '../session';
import { initialProgram } from '../../data/seed';
import { buildAnalytics, pointValue } from './index';
import { dynamics, repetitionLoads, repsAtLoad } from './dynamics';
import { recommendationForActive } from './recommendations';
import { weeklyPlan } from './planning';
const exercise: Exercise = { id: 'audit', name: 'Жим', description: '', weightMode: 'total', unilateral: false, loadCalculation: 'total', primaryMuscle: 'Грудь' };
function recorded(day: number, weight: number, reps = 12): WorkoutSession {
  const session = createSession({ id: 'A', name: 'A', revision: 0, muscleGroups: [], slots: [{ id: 'slot', exerciseIds: [exercise.id], sets: 3, reps: [8, 12], optional: false }] }, initialProgram, [exercise], new Date(2026, 10, day));
  session.status = 'completed'; session.endedAt = new Date(2026, 10, day, 1).toISOString();
  session.exercises[0].sets.forEach(set => Object.assign(set, { weightKg: weight, reps, status: 'completed' })); return session;
}
describe('pre-release audit regressions', () => {
  it('reports overall period growth despite a decrease at the last execution', () => {
    const points = buildAnalytics([30, 32, 34, 36, 35].map((weight, index) => recorded(index + 1, weight))).series[0].points;
    expect(dynamics(points).state).toBe('up'); expect(dynamics(points).change).toBeCloseTo(16.6667, 3);
    expect(dynamics(points, 'mean', 'previous').state).toBe('down'); expect(dynamics(points, 'mean', 'previous').change).toBeCloseTo(-2.7778, 3);
  });
  it('does not revive an older increase recommendation when the latest execution has a different target', () => {
    const a = recorded(1, 30), b = recorded(2, 30); b.originalExercises[0].targetReps = [10, 15]; b.exercises[0].targetReps = [10, 15];
    const active = structuredClone(a.exercises[0]); expect(recommendationForActive(buildAnalytics([a, b]).series, active, 'A')).toBeNull();
  });
  it('does not interpret fewer repetitions with a heavier weight as strength loss', () => {
    const points = buildAnalytics([recorded(1, 28, 12), recorded(2, 32, 10)]).series[0].points;
    expect(dynamics(points).state).toBe('up'); expect(pointValue(points[0], 'totalReps')).toBe(36); expect(pointValue(points[1], 'totalReps')).toBe(30);
    const loads = repetitionLoads(points); expect(loads).toHaveLength(2); expect(repsAtLoad(points[0], loads[0].key)).toBe(12); expect(repsAtLoad(points[1], loads[0].key)).toBeNull();
  });
  it('compares repetitions only at the same pair of side loads, not the same mean', () => {
    const a = recorded(1, 20, 15), b = recorded(2, 25, 16);
    for (const session of [a, b]) { for (const rows of [session.originalExercises, session.exercises]) rows[0].exercise.unilateral = true; session.exercises[0].separateSides = true; session.exercises[0].sets.forEach(set => Object.assign(set, { rightWeightKg: session === a ? 30 : 25, rightReps: 15 })); }
    const points = buildAnalytics([a, b]).series[0].points; expect(dynamics(points).state).toBe('insufficient'); expect(repetitionLoads(points)).toHaveLength(2);
  });
  it('does not draw a trend from one point or from incompatible equipment', () => {
    const a = recorded(1, 20), b = recorded(2, 30); for (const rows of [b.exercises, b.originalExercises]) rows[0].exercise.weightMode = 'machine';
    const points = buildAnalytics([a, b]).series.flatMap(row => row.points); expect(dynamics(points).state).toBe('insufficient'); expect(dynamics(points.slice(0, 1)).state).toBe('insufficient');
  });
  it.each(['sets', 'weight-mode', 'replacement', 'skipped'] as const)('rejects a stale recommendation after %s changed', kind => {
    const a = recorded(1, 30), b = recorded(2, 30), current = structuredClone(a.exercises[0]);
    if (kind === 'sets') for (const rows of [b.exercises, b.originalExercises]) { rows[0].sets.pop(); rows[0].plannedSets = 2; }
    if (kind === 'weight-mode') for (const rows of [b.exercises, b.originalExercises]) rows[0].exercise.weightMode = 'machine';
    if (kind === 'replacement') b.exercises[0].exercise.id = 'other';
    if (kind === 'skipped') b.status = 'skipped';
    expect(recommendationForActive(buildAnalytics([a, b]).series, current, 'A', [a, b])).toBeNull();
  });
  it('uses results of the requested template and allows a valid exercise in an incomplete session', () => {
    const a = recorded(1, 30), b = recorded(2, 40, 9); a.status = 'incomplete'; b.templateId = 'B'; const analytics = buildAnalytics([a, b]);
    expect(recommendationForActive(analytics.series, a.exercises[0], 'A', [a, b])?.kind).toBe('increase');
    expect(recommendationForActive(analytics.series, b.exercises[0], 'B', [a, b])?.kind).toBe('keep');
  });
  it('keeps advice for a comparable variant across a legitimate alternation', () => {
    const a = recorded(1, 30), b = recorded(2, 30);
    for (const rows of [a.exercises, a.originalExercises]) rows[0].alternation = { variantIds: ['audit', 'other'], selectedId: 'audit' };
    for (const rows of [b.exercises, b.originalExercises]) { rows[0].exercise.id = 'other'; rows[0].alternation = { variantIds: ['audit', 'other'], selectedId: 'other' }; }
    expect(recommendationForActive(buildAnalytics([a, b]).series, a.exercises[0], 'A', [a, b])?.kind).toBe('increase');
  });
  it('requires four consecutive comparable goals for a neutral slowing hint', () => {
    const sessions = [1, 2, 3, 4].map(day => recorded(day, 30, 10)), current = structuredClone(sessions[3].exercises[0]);
    const rec = recommendationForActive(buildAnalytics(sessions).series, current, 'A'); expect(rec?.kind).toBe('slowed'); expect(rec?.reason).toContain('не доказательство');
    sessions[1].originalExercises[0].targetReps = [10, 15]; sessions[1].exercises[0].targetReps = [10, 15];
    expect(recommendationForActive(buildAnalytics(sessions).series, current, 'A')?.kind).toBe('keep');
  });
  it('keeps the recorded plan independent of current edits and does not replay historical cycle advances', () => {
    const a = recorded(23, 30), b = recorded(23, 30); b.advanceCycle = false;
    const template = { id: 'A', name: 'A', revision: 2, muscleGroups: [], slots: [{ id: 'slot', exerciseIds: [exercise.id], sets: 9, reps: [10, 15] as [number, number], optional: false }] };
    const result = weeklyPlan(new Date(2026, 10, 24), [a, b], [template], [exercise], { ...initialProgram, sequence: ['A'], nextTemplateId: 'A' }, { id: 'user', theme: 'dark', trainingDays: [1, 3] }, []);
    expect(result.historical[0].direct).toBe(6); expect(result.future[0].direct).toBe(9); expect(result.uncertainPast).toBe(false);
  });
  it('does not project a future cycle from an unfinished session whose outcome is unknown', () => {
    const session = recorded(25, 30); session.status = 'active'; session.endedAt = null;
    const template = { id: 'A', name: 'A', revision: 2, muscleGroups: [], slots: [{ id: 'slot', exerciseIds: [exercise.id], sets: 9, reps: [8, 12] as [number, number], optional: false }] };
    const result = weeklyPlan(new Date(2026, 10, 25), [session], [template], [exercise], { ...initialProgram, sequence: ['A'], nextTemplateId: 'A', activeSessionId: session.id }, { id: 'user', theme: 'dark', trainingDays: [3, 5] }, []);
    expect(result.future).toEqual([]);
  });
});
