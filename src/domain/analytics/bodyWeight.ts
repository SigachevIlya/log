import type { BodyWeightEntry } from '../models';
import { dateKey } from '../calendar';
import { calendarDay, dayStamp, inRange, type DateRange } from './periods';
export function weightOnDate(sorted: BodyWeightEntry[], date: number): BodyWeightEntry | undefined {
  let low = 0, high = sorted.length;
  while (low < high) { const middle = (low + high) >>> 1; if (Date.parse(sorted[middle].measuredAt) <= date) low = middle + 1; else high = middle; }
  const entry = sorted[low - 1];
  return entry && calendarDay(date) - calendarDay(entry.measuredAt) <= 7 ? entry : undefined;
}
export function weightDays(entries: BodyWeightEntry[]) {
  const days = new Map<string, number[]>();
  for (const entry of entries) { const key = dateKey(new Date(entry.measuredAt)); const values = days.get(key) ?? []; values.push(entry.weightKg); days.set(key, values); }
  const rows = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, timestamp: dayStamp(date), value: values.reduce((sum, value) => sum + value, 0) / values.length }));
  let left = 0, sum = 0;
  return rows.map((row, index) => { sum += row.value; while (calendarDay(row.timestamp) - calendarDay(rows[left].timestamp) > 6) { sum -= rows[left++].value; } return { ...row, average: sum / (index - left + 1) }; });
}
export function weightSummary(entries: BodyWeightEntry[], range: DateRange) {
  const sorted = [...entries].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)), selected = sorted.filter(entry => inRange(entry.measuredAt, range));
  const first = selected[0], last = selected.at(-1), delta = first && last && first.id !== last.id ? last.weightKg - first.weightKg : null;
  const days = first && last ? (Date.parse(last.measuredAt) - Date.parse(first.measuredAt)) / 86_400_000 : 0;
  return { latest: sorted.at(-1), selected, delta, weeklyRate: delta !== null && days >= 7 ? delta * 7 / days : null, days: weightDays(sorted).filter(row => inRange(row.timestamp, range)) };
}
