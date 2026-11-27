import { useEffect, useMemo } from 'react';
import type { AppData } from '../../db/database';
import type { Analytics, ExerciseSeries } from '../../domain/analytics';
import { pointValue } from '../../domain/analytics';
import { resultText } from '../../domain/format';
import { dynamics } from '../../domain/analytics/dynamics';
import { currentRecommendations } from '../../domain/analytics/recommendations';
import { periodLabels, periodRange, rangeLabel, inRange, fullDate, dayStamp, type Period, type DateRange } from '../../domain/analytics/periods';
import { trainingStatistics } from '../../domain/analytics/volume';
import { weightSummary } from '../../domain/analytics/bodyWeight';
import { go, objectPath, routeId, useRoute } from '../../routing/router';
import { useStoredState } from '../../hooks/useStoredState';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { muscles } from '../../data/muscles';
import { TimeChart, numberText } from '../../components/analytics/TimeChart';
import { RecommendationList } from './RecommendationList';
import { BodyWeightForm, BodyWeightPage } from './BodyWeightPage';
import { ExerciseProgress, RecordRow } from './ExerciseProgress';
import { VolumeProgress } from './VolumeProgress';
const minuteText = (value: number | null) => value === null ? '—' : numberText(value / 60_000, 0) + ' мин';
function exerciseLink(series: ExerciseSeries) { try { sessionStorage.setItem('log:progress:series:' + series.exercise.id, JSON.stringify(series.key)); } catch { /* Viewing remains available. */ } go(objectPath('/progress/exercise', series.exercise.id)); }
function ExerciseRow({ series, range, archived }: { series: ExerciseSeries; range: DateRange; archived: boolean }) {
  const points = series.points.filter(point => inRange(point.timestamp, range)), latest = points.at(-1), indicator = dynamics(points);
  const strength = latest && pointValue(latest, 'strength');
  const best = latest?.observations.reduce((best, row) => (strength != null ? row.metrics.mean.strength ?? -Infinity : row.metrics.mean.reps) > (strength != null ? best.metrics.mean.strength ?? -Infinity : best.metrics.mean.reps) ? row : best);
  return <button className="analytics-row exercise-progress-row" data-progress-exercise={series.exercise.id} onClick={() => exerciseLink(series)}><span><strong>{series.exercise.name}</strong><span className="small muted">{latest ? fullDate(latest.timestamp) + (best ? ' · ' + resultText(best.row.exercise, best.set, best.row.separateSides) : '') : 'Нет результатов за период'}{archived && ' · Архив'}</span><span className={'small trend-' + indicator.state}>За период: {indicator.label}{indicator.change !== undefined && ' · ' + (indicator.change > 0 ? '+' : '') + numberText(indicator.change, 1) + ' ' + indicator.unit}</span></span><span aria-hidden="true">›</span></button>;
}
export default function ProgressPage({ data, analytics, now }: { data: AppData; analytics: Analytics; now: Date }) {
  const route = useRoute(), exerciseId = routeId(route, '/progress/exercise'), bodyId = routeId(route, '/progress/body');
  const [period, setPeriod] = useStoredState<Period>('log:progress:period', 'month');
  const [search, setSearch] = useStoredState('log:progress:search', ''), [muscle, setMuscle] = useStoredState('log:progress:muscle', ''), [sort, setSort] = useStoredState('log:progress:sort', 'recent');
  const [recordExercise, setRecordExercise] = useStoredState('log:progress:record-exercise', '');
  const [general, setGeneral] = useStoredState('log:progress:general-muscles', true);
  const range = useMemo(() => periodRange(period, now, analytics.first), [period, now.getFullYear(), now.getMonth(), now.getDate(), analytics.first]);
  useScrollRestoration(route, true);
  const allSeries = useMemo(() => { const map = new Map<string, ExerciseSeries>(); for (const row of analytics.series) { const old = map.get(row.exercise.id); if (!old || old.points.at(-1)!.timestamp <= row.points.at(-1)!.timestamp) map.set(row.exercise.id, row); } return [...map.values()]; }, [analytics]);
  const filtered = useMemo(() => allSeries.filter(row => row.exercise.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')) && (!muscle || row.exercise.primaryMuscle === muscle || row.exercise.secondaryMuscles?.includes(muscle))).sort((a, b) => {
    if (sort === 'name') return a.exercise.name.localeCompare(b.exercise.name, 'ru');
    if (sort === 'dynamic') { const value = (series: ExerciseSeries) => { const result = dynamics(series.points.filter(point => inRange(point.timestamp, range))); return result.unit === '%' ? result.change ?? -Infinity : -Infinity; }; return value(b) - value(a) || a.exercise.name.localeCompare(b.exercise.name, 'ru'); }
    return b.points.at(-1)!.timestamp - a.points.at(-1)!.timestamp;
  }), [allSeries, search, muscle, sort, range]);
  const stats = useMemo(() => trainingStatistics(data.history, range), [data.history, range]);
  const records = useMemo(() => analytics.records.filter(row => inRange(row.point.timestamp, range)), [analytics, range]);
  const recordOptions = [...new Map(analytics.records.map(row => [row.observation.row.exercise.id, row.observation.row.exercise.name])).entries()];
  const selectedRecord = recordOptions.some(([id]) => id === recordExercise) ? recordExercise : '';
  const shownRecords = records.filter(row => !selectedRecord || row.observation.row.exercise.id === selectedRecord);
  const body = useMemo(() => weightSummary(data.bodyWeights, range), [data.bodyWeights, range]);
  const recommendations = useMemo(() => data.settings.recommendationsEnabled === false ? [] : currentRecommendations(analytics.series, data.templates, data.exercises, data.program, data.history), [analytics, data.templates, data.exercises, data.program, data.history, data.settings.recommendationsEnabled]);
  const measurement = data.bodyWeights.find(entry => entry.id === bodyId);
  useEffect(() => {
    if (route.startsWith('/progress/exercise/') && (!exerciseId || !analytics.series.some(row => row.exercise.id === exerciseId))) go('/progress/exercises', { replace: true, guard: false });
    else if (route.startsWith('/progress/body/') && bodyId !== 'new' && !measurement) go('/progress/body', { replace: true, guard: false });
    else if (!/^\/progress(?:\/exercises|\/exercise\/[^/]+|\/body(?:\/[^/]+)?|\/volume|\/records|\/statistics|\/recommendations)?$/.test(route)) go('/progress', { replace: true, guard: false });
  }, [route, exerciseId, bodyId, measurement, analytics]);
  const periodControl = <div className="progress-period"><div><label className="field-label" htmlFor="progress-period">Период</label><select id="progress-period" value={period} onChange={event => setPeriod(event.target.value as Period)}>{(Object.keys(periodLabels) as Period[]).map(key => <option key={key} value={key}>{periodLabels[key]}</option>)}</select></div><p className="small muted" data-period-range>{rangeLabel(range)}</p></div>;
  const heading = (title: string) => <div className="page-heading progress-heading"><button className="text-button" onClick={() => go('/progress')}>К прогрессу</button><h1>{title}</h1></div>;
  if (route.startsWith('/progress/exercise/') && exerciseId && analytics.series.some(row => row.exercise.id === exerciseId)) return <div className="progress-page"><ExerciseProgress key={exerciseId} id={exerciseId} analytics={analytics} range={range} recommendations={recommendations} periodControl={periodControl} /></div>;
  if (route.startsWith('/progress/body/') && (bodyId === 'new' || measurement)) return <BodyWeightForm key={bodyId} source={measurement} />;
  if (route === '/progress/body') return <div className="progress-page">{heading('Собственный вес')}{periodControl}<BodyWeightPage entries={data.bodyWeights} range={range} /></div>;
  if (route === '/progress/exercises') return <div className="progress-page">{heading('Упражнения')}{periodControl}<label className="field-label" htmlFor="progress-search">Поиск результатов</label><input id="progress-search" type="search" value={search} onChange={event => setSearch(event.target.value)} /><div className="progress-list-filters"><div><label className="field-label" htmlFor="progress-muscle">Мышечная группа</label><select id="progress-muscle" value={muscle} onChange={event => setMuscle(event.target.value)}><option value="">Все группы</option>{muscles.map(name => <option key={name}>{name}</option>)}</select></div><div><label className="field-label" htmlFor="progress-sort">Сортировка упражнений</label><select id="progress-sort" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Недавние</option><option value="name">По названию</option><option value="dynamic">По динамике за период</option></select></div></div>{filtered.length ? filtered.map(series => <ExerciseRow key={series.exercise.id} series={series} range={range} archived={!!data.exercises.find(row => row.id === series.exercise.id)?.archived} />) : <p className="analytics-empty">Подтверждённых результатов по этим условиям пока нет.</p>}</div>;
  if (route === '/progress/records') return <div className="progress-page">{heading('Личные рекорды')}{periodControl}<label className="field-label" htmlFor="record-exercise">Упражнение</label><select id="record-exercise" value={selectedRecord} onChange={event => setRecordExercise(event.target.value)}><option value="">Все упражнения</option>{recordOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><p className="small muted">Первый результат — исходная точка. Равные значения не создают рекорд. Общий счётчик сторон использует их среднее.</p>{shownRecords.length ? shownRecords.map((record, index) => <RecordRow key={record.point.session.id + record.key + index} record={record} exerciseName={record.observation.row.exercise.name} />) : <p className="analytics-empty">За выбранный период новых рекордов нет.</p>}</div>;
  if (route === '/progress/recommendations') return <div className="progress-page">{heading('Рекомендации')}{recommendations.length ? <RecommendationList values={recommendations} /> : <p className="analytics-empty">{data.settings.recommendationsEnabled === false ? 'Показ рекомендаций отключён в настройках.' : 'Недостаточно сопоставимых результатов текущей программы.'}</p>}</div>;
  if (route === '/progress/statistics') return <div className="progress-page">{heading('Регулярность')}{periodControl}<div className="statistics-list">{[['Завершённые тренировки', stats.completed], ['Неполные тренировки', stats.incomplete], ['Сохранённые «Пропущена»', stats.skipped], ['Тренировок с результатами', stats.performed.length], ['Дней посещения', stats.visits], ['Рабочих подходов', stats.sets], ['Общая продолжительность', minuteText(stats.duration)], ['Средняя продолжительность', minuteText(stats.average)], ['Явные пропуски дат расписания', data.exceptions.filter(row => row.kind === 'skip' && inRange(dayStamp(row.date), range)).length]].map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}</div><p className="small muted">Несколько тренировок одного дня — несколько тренировок, но один день посещения. Пропущенные сессии исключены из длительности. Календарные пропуски не создают историю; прошлый процент посещаемости без архива расписания неизвестен.</p></div>;
  if (route === '/progress/volume') return <div className="progress-page">{heading('Нагрузка')}{periodControl}<VolumeProgress data={data} analytics={analytics} range={range} now={now} general={general} onGeneralChange={setGeneral} onExercise={exerciseLink} /></div>;
  return <div className="progress-page progress-overview"><div className="page-heading progress-heading"><h1>Прогресс</h1></div>{periodControl}<div className="analytics-stats dashboard-stats">{[['Тренировки', stats.performed.length, '/progress/statistics'], ['Рабочие подходы', stats.sets, '/progress/volume'], ['Новые рекорды', records.length, '/progress/records'], ['Средняя длительность', minuteText(stats.average), '/progress/statistics']].map(([label, value, path]) => <button key={label} onClick={() => go(String(path))}><b>{value}</b><span>{label}</span></button>)}</div>
    <section className="overview-body"><div className="analytics-section-heading"><h2>Собственный вес</h2><button className="text-button" onClick={() => go('/progress/body')}>Подробнее</button></div>{body.latest ? <><div className="overview-weight"><strong>{numberText(body.latest.weightKg)} кг</strong><span className="small muted">{body.delta === null ? fullDate(body.latest.measuredAt) : 'За период ' + (body.delta > 0 ? '+' : '') + numberText(body.delta) + ' кг'}</span><button className="text-button" onClick={() => go('/progress/body/new')}>Добавить вес</button></div><TimeChart points={body.days.map(row => ({ id: row.date, timestamp: row.timestamp, value: row.value, label: fullDate(row.timestamp) }))} unit="кг" label="Измерения" compact /></> : <div className="overview-weight"><span className="small muted">Измерений пока нет</span><button className="text-button" onClick={() => go('/progress/body/new')}>Добавить вес</button></div>}</section>
    <nav className="progress-links" aria-label="Подробная аналитика">{[['Упражнения', 'Веса, повторы и силовые показатели', 'exercises'], ['Нагрузка', 'Подходы и мышечные группы', 'volume'], ['Личные рекорды', 'Лучшие результаты и исходные тренировки', 'records'], ['Рекомендации', 'Актуальные предложения по прогрессии', 'recommendations']].map(([title, label, path]) => <button className="analytics-row" key={path} onClick={() => go('/progress/' + path)}><span><strong>{title}</strong><span className="small muted">{label}</span></span><span aria-hidden="true">›</span></button>)}</nav>
    <button className="text-button" onClick={() => go('/progress/statistics')}>Регулярность и общая статистика</button>
  </div>;
}
