import type { BodyWeightEntry, WorkoutSession } from '../models';
import { completedSets, weightLabels } from '../workout';
import { dateKey } from '../calendar';
import { statusText } from '../format';
import { inRange, type DateRange } from '../analytics/periods';
export function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? '' : typeof value === 'number' ? String(value).replace('.', ',') : value;
  if (typeof value === 'string' && (/^[\s\u0000-\u001f\uFEFF]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export const csvDocument = (rows: Array<Array<string | number | null | undefined>>) => '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
const time = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
export function historyCSV(history: WorkoutSession[], range?: DateRange) {
  const rows: Array<Array<string | number | null | undefined>> = [['ID тренировки', 'Дата тренировки', 'Время начала', 'Название тренировки', 'Статус тренировки', 'Продолжительность, мин', 'ID упражнения', 'Название упражнения', 'Основная мышечная группа', 'Номер подхода', 'Вес, кг', 'Повторения', 'Способ учёта веса', 'Вес левой стороны, кг', 'Повторения слева', 'Вес правой стороны, кг', 'Повторения справа', 'Необязательное упражнение', 'Внеплановый подход', 'Заметка']];
  for (const session of [...history].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (!['completed', 'incomplete'].includes(session.status) || (range && !inRange(session.startedAt, range))) continue;
    const date = new Date(session.startedAt), duration = session.endedAt ? Math.round(Math.max(0, Date.parse(session.endedAt) - date.getTime()) / 600) / 100 : null;
    for (const row of session.exercises) for (const set of completedSets(row)) {
      const source = session.originalExercises?.find(original => original.slotId === row.slotId && original.exercise.id === row.exercise.id);
      const extra = row.added ? 'да' : source ? source.sets.some(original => original.id === set.id) ? 'нет' : 'да' : '';
      rows.push([session.id, dateKey(date), time(date), session.name, statusText[session.status], duration, row.exercise.id, row.exercise.name, row.exercise.primaryMuscle ?? '', row.sets.indexOf(set) + 1, row.separateSides ? null : set.weightKg, row.separateSides ? null : set.reps, weightLabels[row.exercise.weightMode], row.separateSides ? set.weightKg : null, row.separateSides ? set.reps : null, row.separateSides ? set.rightWeightKg : null, row.separateSides ? set.rightReps : null, row.optional ? 'да' : 'нет', extra, [session.notes, row.notes].filter(Boolean).join('\n')]);
    }
  }
  return csvDocument(rows);
}
export function weightCSV(entries: BodyWeightEntry[], range?: DateRange) {
  return csvDocument([['ID измерения', 'Дата', 'Время', 'Вес, кг'], ...[...entries].filter(row => !range || inRange(row.measuredAt, range)).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).map(row => { const date = new Date(row.measuredAt); return [row.id, dateKey(date), time(date), row.weightKg]; })]);
}
