import type { BodyWeightEntry, Exercise, SessionExercise, WorkingSet, WorkoutSession } from '../models';
import { completedSets } from '../workout';
import { comparisonKey, repetitionLoadKey, setMetrics, type Side, type Metric } from './metrics';

export interface Observation { row: SessionExercise; set: WorkingSet; metrics: ReturnType<typeof setMetrics> }
export interface ExercisePoint { session: WorkoutSession; timestamp: number; rows: SessionExercise[]; observations: Observation[] }
export interface PersonalRecord { kind: 'weight' | 'additional' | 'reps' | 'strength'; value: number; weight?: number; side: Side; point: ExercisePoint; observation: Observation; key: string; baseline: boolean }
export interface ExerciseSeries { key: string; exercise: Exercise; points: ExercisePoint[]; records: PersonalRecord[]; bests: PersonalRecord[] }
export interface Analytics { series: ExerciseSeries[]; performed: WorkoutSession[]; skipped: WorkoutSession[]; records: PersonalRecord[]; first?: number }
export function pointValue(point: ExercisePoint, metric: Metric, side: Side = 'mean'): number | null {
  if (metric === 'sets') return point.observations.length;
  if (metric === 'totalReps') return point.observations.reduce((sum, row) => sum + row.metrics[side].reps, 0);
  if (metric === 'tonnage') return point.observations.every(row => row.metrics.tonnage !== null) ? point.observations.reduce((sum, row) => sum + row.metrics.tonnage!, 0) : null;
  const values = point.observations.map(row => row.metrics[side][metric]).filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}
export function recordSequence(points: ExercisePoint[], unilateral: boolean) {
  const bests = new Map<string, PersonalRecord>(), records: PersonalRecord[] = [];
  for (const point of points) {
    const candidates = new Map<string, PersonalRecord>();
    for (const observation of point.observations) for (const side of (unilateral ? ['mean', 'left', 'right'] : ['mean']) as Side[]) {
      const value = observation.metrics[side], body = observation.row.exercise.bodyWeight || ['additional', 'bodyweight'].includes(observation.row.exercise.weightMode);
      const entries: Array<{ kind: PersonalRecord['kind']; value: number | null; weight?: number }> = [
        { kind: body ? 'additional' : 'weight', value: observation.row.exercise.weightMode === 'bodyweight' ? null : value.weight },
        { kind: 'reps', value: value.reps, weight: value.weight }, { kind: 'strength', value: value.strength },
      ];
      for (const entry of entries) {
        if (entry.value === null) continue;
        const key = JSON.stringify([entry.kind, entry.kind === 'reps' ? repetitionLoadKey(observation.metrics, side) : null, side]);
        if (!candidates.has(key) || candidates.get(key)!.value < entry.value) candidates.set(key, { ...entry, value: entry.value, key, side, point, observation, baseline: false });
      }
    }
    for (const [key, candidate] of candidates) {
      const old = bests.get(key);
      if (!old || candidate.value > old.value + 1e-8) {
        const record = { ...candidate, baseline: !old }; bests.set(key, record);
        // Overall counts use the common indicator, avoiding three awards for the same set.
        if (old && candidate.side === 'mean') records.push(record);
      }
    }
  }
  return { records, bests: [...bests.values()] };
}
/** One chronological pass; no independent derived tables or changes to the source records. */
export function buildAnalytics(history: WorkoutSession[], measurements: BodyWeightEntry[] = []): Analytics {
  const weights = [...measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const sessions = [...history].filter(row => row.status !== 'active').sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
  const grouped = new Map<string, ExerciseSeries>(), performed: WorkoutSession[] = [], skipped: WorkoutSession[] = [];
  for (const session of sessions) {
    if (session.status === 'skipped') { skipped.push(session); continue; }
    let hasResults = false;
    const points = new Map<string, ExercisePoint>();
    for (const row of session.exercises) {
      const sets = completedSets(row); if (!sets.length) continue;
      hasResults = true; const key = comparisonKey(row.exercise);
      if (!grouped.has(key)) grouped.set(key, { key, exercise: row.exercise, points: [], records: [], bests: [] });
      const series = grouped.get(key)!; series.exercise = row.exercise;
      if (!points.has(key)) { const point = { session, timestamp: Date.parse(session.startedAt), rows: [], observations: [] }; points.set(key, point); series.points.push(point); }
      const point = points.get(key)!; point.rows.push(row);
      for (const set of sets) point.observations.push({ row, set, metrics: setMetrics(row, set, point.timestamp, weights) });
    }
    if (hasResults) performed.push(session);
  }
  const series = [...grouped.values()];
  for (const row of series) Object.assign(row, recordSequence(row.points, row.exercise.unilateral));
  return { series, performed, skipped, records: series.flatMap(row => row.records).sort((a, b) => b.point.timestamp - a.point.timestamp), first: sessions.length || weights.length ? Math.min(...[sessions[0]?.startedAt, weights[0]?.measuredAt].filter((row): row is string => !!row).map(Date.parse)) : undefined };
}
