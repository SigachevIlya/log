import { useMemo, useState, type ReactNode } from 'react';
import type { Analytics, ExercisePoint, PersonalRecord } from '../../domain/analytics';
import { pointValue, recordSequence } from '../../domain/analytics';
import { dynamics, repetitionLoads, repsAtLoad } from '../../domain/analytics/dynamics';
import { comparisonKey, e1rmHint, metricLabels, metricUnits, type Metric, type Side } from '../../domain/analytics/metrics';
import { fullDate, inRange, type DateRange } from '../../domain/analytics/periods';
import type { CurrentRecommendation } from '../../domain/analytics/recommendations';
import { useStoredState } from '../../hooks/useStoredState';
import { go, objectPath } from '../../routing/router';
import { weightLabels } from '../../domain/workout';
import { resultText } from '../../domain/format';
import { TimeChart, numberText } from '../../components/analytics/TimeChart';
import { RecommendationCard } from '../../components/analytics/RecommendationCard';
export const recordLabels = { weight: 'Рабочий вес', additional: 'Дополнительное отягощение', reps: 'Повторения при весе', strength: 'Расчётный максимум' };
export function RecordRow({ record, exerciseName }: { record: PersonalRecord; exerciseName?: string }) {
  return <button className="analytics-row record-row" onClick={() => go(objectPath('/history', record.point.session.id))}><span><strong>{exerciseName ?? recordLabels[record.kind]}</strong><span className="small muted">{exerciseName && recordLabels[record.kind] + ' · '}{fullDate(record.point.timestamp)}{record.weight !== undefined && ' · ' + record.weight + ' кг'}{record.side !== 'mean' && ' · ' + (record.side === 'left' ? 'левая' : 'правая') + ' сторона'}{record.baseline && ' · исходный результат'}</span><span className="small">Исходный подход: {resultText(record.observation.row.exercise, record.observation.set, record.observation.row.separateSides)}</span></span><b>{numberText(record.value)} {record.kind === 'reps' ? 'повт.' : 'кг'}</b></button>;
}
export function SourceResults({ point }: { point: ExercisePoint }) { return <div className="point-source"><strong>{fullDate(point.timestamp)} · {point.session.name}</strong>{point.observations.map(row => <p key={row.set.id}>{resultText(row.row.exercise, row.set, row.row.separateSides)}</p>)}<button className="text-button" onClick={() => go(objectPath('/history', point.session.id))}>Открыть тренировку в истории</button></div>; }
type DisplayMetric = Metric | 'sameWeightReps';
export function ExerciseProgress({ id, analytics, range, recommendations, periodControl }: { id: string; analytics: Analytics; range: DateRange; recommendations: CurrentRecommendation[]; periodControl: ReactNode }) {
  const series = analytics.series.filter(row => row.exercise.id === id).sort((a, b) => a.points.at(-1)!.timestamp - b.points.at(-1)!.timestamp);
  const [selected, setSelected] = useStoredState('log:progress:series:' + id, series.at(-1)?.key ?? '');
  const [template, setTemplate] = useStoredState('log:progress:template:' + id, '');
  const [metric, setMetric] = useStoredState<DisplayMetric>('log:progress:metric:' + id, 'strength');
  const [side, setSide] = useStoredState<Side>('log:progress:side:' + id, 'mean');
  const [load, setLoad] = useStoredState('log:progress:load:' + id, '');
  const [pointId, setPointId] = useState(''), [historyCount, setHistoryCount] = useState(20);
  const current = series.find(row => row.key === selected) ?? series.at(-1)!;
  const templates = [...new Map(current.points.map(point => [point.session.templateId, point.session.name])).entries()];
  const filteredTemplate = templates.some(([id]) => id === template) ? template : '';
  const historicalPoints = useMemo(() => current.points.filter(point => !filteredTemplate || point.session.templateId === filteredTemplate), [current, filteredTemplate]);
  const points = useMemo(() => historicalPoints.filter(point => inRange(point.timestamp, range)), [historicalPoints, range.start, range.end]);
  const latest = points.at(-1), indicator = dynamics(points, side);
  const previous = dynamics(latest ? historicalPoints.slice(0, historicalPoints.indexOf(latest) + 1) : [], side, 'previous');
  const recs = recommendations.filter(row => row.exercise.id === id && comparisonKey(row.exercise) === current.key && (!filteredTemplate || row.template.id === filteredTemplate));
  const loads = useMemo(() => repetitionLoads(points, side), [points, side]), selectedLoad = loads.some(row => row.key === load) ? load : loads.at(-1)?.key ?? '';
  const body = current.exercise.bodyWeight || ['additional', 'bodyweight'].includes(current.exercise.weightMode);
  const unit = metric === 'sameWeightReps' ? 'повт.' : metricUnits[metric], label = metric === 'sameWeightReps' ? 'Повторения при одинаковом весе' : metric === 'weight' && body ? 'Дополнительное отягощение' : metricLabels[metric];
  const chart = points.map(point => ({ id: point.session.id, timestamp: point.timestamp, value: metric === 'sameWeightReps' ? repsAtLoad(point, selectedLoad, side) : pointValue(point, metric, side), label: fullDate(point.timestamp) + ' · ' + point.session.name }));
  const selectedPoint = points.find(point => point.session.id === pointId);
  const trend = (value: typeof indicator) => value.label + (value.change === undefined ? '' : ' · ' + (value.change > 0 ? '+' : '') + numberText(value.change, 1) + ' ' + value.unit);
  return <>
    <div className="page-heading progress-heading"><button className="text-button" onClick={() => go('/progress/exercises')}>К упражнениям</button><h1>{current.exercise.name}</h1><p className="small muted">{current.exercise.primaryMuscle ?? 'Мышечная группа неизвестна'} · {weightLabels[current.exercise.weightMode]}</p></div>
    {periodControl}
    {series.length > 1 && <><label className="field-label" htmlFor="comparison-series">Условия записи</label><select id="comparison-series" value={current.key} onChange={event => setSelected(event.target.value)}>{series.map((row, index) => <option key={row.key} value={row.key}>Серия {index + 1} · {fullDate(row.points[0].timestamp)} · {weightLabels[row.exercise.weightMode]}</option>)}</select><p className="small muted">Несовместимые варианты техники и нагрузки разделены.</p></>}
    <label className="field-label" htmlFor="progress-template">Шаблон тренировки</label><select id="progress-template" value={filteredTemplate} onChange={event => setTemplate(event.target.value)}><option value="">Все шаблоны</option>{templates.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
    <label className="field-label" htmlFor="exercise-metric">Показатель графика</label><select id="exercise-metric" value={metric} onChange={event => setMetric(event.target.value as DisplayMetric)}>{(Object.keys(metricLabels) as Metric[]).map(key => <option key={key} value={key}>{key === 'weight' && body ? 'Дополнительное отягощение' : metricLabels[key]}</option>)}<option value="sameWeightReps">Повторения при одинаковом весе</option></select>
    {current.exercise.unilateral && <><label className="field-label" htmlFor="exercise-side">Сторона</label><select id="exercise-side" value={side} onChange={event => setSide(event.target.value as Side)}><option value="mean">Среднее обеих сторон</option><option value="left">Левая</option><option value="right">Правая</option></select></>}
    {metric === 'sameWeightReps' && <><label className="field-label" htmlFor="repetition-load">Рабочий вес для сравнения</label><select id="repetition-load" value={selectedLoad} onChange={event => setLoad(event.target.value)}>{loads.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select><p className="small muted">Лучший подход при выбранной нагрузке; для общего показателя раздельных сторон должна совпадать пара весов.</p></>}
    <TimeChart key={current.key + filteredTemplate + metric + side + selectedLoad} points={chart} unit={unit} label={label} onSelect={setPointId} />
    {selectedPoint && <SourceResults point={selectedPoint} />}
    {metric === 'strength' && <p className="small muted">{e1rmHint}. Только 1–12 повторений.{current.exercise.weightMode === 'per-dumbbell' && ' Для одной гантели.'}{['machine', 'smith', 'plates'].includes(current.exercise.weightMode) && ' Условная нагрузка того же оборудования.'}</p>}
    {(metric === 'reps' || metric === 'totalReps') && <p className="small muted">Количество повторений само по себе не показывает изменение силы: рабочий вес и число подходов могли измениться. Для сравнения выберите одинаковый вес либо расчётный максимум. Общая сумма раздельных сторон использует среднее повторов сторон каждого подхода.</p>}
    {metric === 'tonnage' && <p className="small muted">Без известных снарядов и эффективной нагрузки тоннаж недоступен. Сравнивайте одинаковые правила записи одного упражнения.</p>}
    <section className="analytics-section dynamics-summary"><h2>Динамика</h2><div className="analytics-stats"><div><b>{points.length || '—'}</b><span>тренировок за период</span></div><div><b>{latest ? fullDate(latest.timestamp) : '—'}</b><span>последнее выполнение</span></div></div><p className={'trend trend-' + indicator.state}><strong>За выбранный период:</strong> {trend(indicator)}</p><p className={'trend trend-' + previous.state}><strong>К предыдущему выполнению:</strong> {trend(previous)}</p><p className="small muted">Первая и последняя сопоставимые точки периода; отдельно — последнее выполнение против предыдущего, в том числе до начала периода. e1RM сравнивается с порогом 2%; без него — повторы при одинаковой нагрузке. {indicator.unit === 'повт.' && 'Изменение относится к повторам при том же весе, а не к доказанному изменению силы.'}</p></section>
    {latest ? <section className="analytics-section"><h2>Последний результат</h2><SourceResults point={latest} /></section> : <p className="analytics-empty">За выбранный период результатов нет.</p>}
    {!!recs.length && <section className="analytics-section"><h2>Рекомендации текущей программы</h2>{recs.map(row => <div key={row.slotId}><p className="small muted">{row.template.name}</p><RecommendationCard value={row.value} /></div>)}</section>}
    {body && <details className="analytics-details"><summary>Собственный вес и отягощение</summary><p className="small muted">Общая нагрузка доступна только для явно отмеченных подтягиваний с измерением до тренировки не старше семи календарных дней. Текущая масса не переносится в прошлое.</p></details>}
    <details className="analytics-details"><summary>Личные рекорды</summary><p className="small muted">Лучшие значения за всю историю выбранной серии и шаблона. Исходная точка не является новым рекордом.</p><ExerciseRecords points={historicalPoints} side={side} /></details>
    <details className="analytics-details"><summary>История выполнения · {points.length}</summary>{[...points].reverse().slice(0, historyCount).map(point => <details className="analytics-details" key={point.session.id}><summary>{fullDate(point.timestamp)} · {point.session.name} · {point.observations.length} подх.</summary><SourceResults point={point} /></details>)}{historyCount < points.length && <button className="text-button" onClick={() => setHistoryCount(value => value + 20)}>Показать ещё 20 выполнений</button>}</details>
  </>;
}
function ExerciseRecords({ points, side }: { points: ExercisePoint[]; side: Side }) {
  const current = useMemo(() => recordSequence(points, side !== 'mean').bests.filter(row => row.side === side), [points, side]);
  return current.length ? <div>{current.map(row => <RecordRow key={row.key} record={row} />)}</div> : <p className="analytics-empty">Результатов пока нет.</p>;
}
