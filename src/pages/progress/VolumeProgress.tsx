import { useMemo, useState } from 'react';
import type { AppData } from '../../db/database';
import type { Analytics, ExerciseSeries } from '../../domain/analytics';
import { completedSets } from '../../domain/workout';
import { weeklyPlan } from '../../domain/analytics/planning';
import { muscleVolume, trainingStatistics, weeklyVolume, type MuscleVolume } from '../../domain/analytics/volume';
import { dayStamp, fullDate, inRange, periodRange, rangeLabel, type DateRange } from '../../domain/analytics/periods';
import { TimeChart } from '../../components/analytics/TimeChart';
import { go, objectPath } from '../../routing/router';
export function MuscleRows({ rows, indirect = false }: { rows: MuscleVolume[]; indirect?: boolean }) {
  const maximum = Math.max(1, ...rows.flatMap(row => indirect ? [row.direct, row.indirect] : [row.direct]));
  return <>{rows.map(row => <div className="muscle-row" key={row.name}><div><strong>{row.name}</strong><span>{row.direct} прямых{indirect && ' · ' + row.indirect + ' косвенных'}</span></div><span className="muscle-bar"><span style={{ width: `${row.direct / maximum * 100}%` }} /></span>{indirect && <span className="muscle-bar indirect-bar"><span style={{ width: `${row.indirect / maximum * 100}%` }} /></span>}</div>)}</>;
}
export function VolumeProgress({ data, analytics, range, now, general, onGeneralChange, onExercise }: { data: AppData; analytics: Analytics; range: DateRange; now: Date; general: boolean; onGeneralChange: (value: boolean) => void; onExercise: (series: ExerciseSeries) => void }) {
  const [indirect, setIndirect] = useState(false);
  const stats = useMemo(() => trainingStatistics(data.history, range), [data.history, range]);
  const volumes = useMemo(() => muscleVolume(stats.performed, general), [stats, general]);
  const plan = useMemo(() => weeklyPlan(now, data.history, data.templates, data.exercises, data.program, data.settings, data.exceptions, general), [data, now.getFullYear(), now.getMonth(), now.getDate(), general]);
  const weekRange = periodRange('week', now);
  const actualWeek = useMemo(() => muscleVolume(trainingStatistics(data.history, weekRange).performed, general), [data.history, weekRange.start, weekRange.end, general]);
  const weekly = useMemo(() => weeklyVolume(data.history, range), [data.history, range]);
  const exerciseVolumes = useMemo(() => analytics.series.map(series => ({ series, count: series.points.filter(point => inRange(point.timestamp, range)).reduce((sum, point) => sum + point.observations.length, 0) })).filter(row => row.count), [analytics, range]);
  const groups = [...new Set([...plan.historical, ...plan.future, ...actualWeek].map(row => row.name))];
  return <>
    <p className="analytics-big-number">{stats.performed.length ? stats.sets : '—'} <span>рабочих подходов</span></p>
    <label className="check-label"><input type="checkbox" checked={general} onChange={event => onGeneralChange(event.target.checked)} />Общие мышечные группы</label>
    <label className="check-label"><input type="checkbox" checked={indirect} onChange={event => setIndirect(event.target.checked)} />Показать косвенную нагрузку</label>
    <p className="small muted">Прямые и косвенные подходы считаются отдельно. При объединении один подход засчитывается группе один раз; основная группа имеет приоритет.</p>
    {volumes.length ? <MuscleRows rows={volumes} indirect={indirect} /> : <p className="analytics-empty">За период нет выполненных подходов.</p>}
    <TimeChart points={weekly.map(row => ({ id: row.date, timestamp: dayStamp(row.date), value: row.value, label: `Неделя с ${fullDate(dayStamp(row.date))}` }))} unit="подх." label="Недельный объём" />
    <details className="analytics-details"><summary>Текущая неделя: факт и план</summary>
      <p className="small muted">{rangeLabel(weekRange)}. Факт — сохранённые подходы; исторический план — исходные снимки записей; будущий ориентир — действующий цикл с учётом переносов и дополнительных дней.</p>
      <div className="statistics-list">{groups.map(name => <div key={name}><span>{name}</span><span>Факт {actualWeek.find(row => row.name === name)?.direct ?? 0} · план записей {plan.historical.find(row => row.name === name)?.direct ?? 0} · далее {plan.future.find(row => row.name === name)?.direct ?? 0}</span></div>)}</div>
      <p className="small muted">{plan.futureBlocked ? 'Идёт тренировка: будущий ориентир недоступен до её завершения или отмены, поскольку исход может изменить цикл и варианты.' : plan.uncertainPast ? 'Полный прошлый план недели неизвестен. Показан только достоверный план записей и отдельный ориентир текущей программы.' : 'Ориентир предполагает выполнение каждого будущего посещения с продвижением цикла.'} Это не медицинская или физиологическая норма. Необязательные подходы плана: {plan.optional}.</p>
    </details>
    <details className="analytics-details"><summary>По тренировкам · {stats.performed.length}</summary>{stats.performed.map(session => <button className="analytics-row" key={session.id} onClick={() => go(objectPath('/history', session.id))}><span>{session.name}<span className="small muted">{fullDate(session.startedAt)}</span></span><strong>{session.exercises.reduce((sum, row) => sum + completedSets(row).length, 0)} подх.</strong></button>)}</details>
    <details className="analytics-details"><summary>По упражнениям</summary><p className="small muted">Разные условия записи одного упражнения показаны отдельно; все фактические подходы включены.</p>{exerciseVolumes.map(({ series, count }) => <button className="analytics-row" key={series.key} onClick={() => onExercise(series)}><span>{series.exercise.name}<span className="small muted">Серия от {fullDate(series.points[0].timestamp)}</span></span><strong>{count} подх.</strong></button>)}</details>
  </>;
}
