import type { CurrentRecommendation } from '../../domain/analytics/recommendations';
import { fullDate } from '../../domain/analytics/periods';
import { resultText } from '../../domain/format';
import { go, objectPath } from '../../routing/router';
const groups = [
  { kind: 'increase', title: 'Можно попробовать увеличить вес', reason: 'Верхняя граница достигнута во всех исходных обязательных подходах с одинаковой нагрузкой. Шаг увеличения выбираете вы.' },
  { kind: 'keep', title: 'Продолжить с текущим весом', reason: 'Исходные обязательные подходы подтверждены, верхняя граница ещё не достигнута. Продолжайте работу в целевом диапазоне.' },
  { kind: 'slowed', title: 'Заметное улучшение пока не зафиксировано', reason: 'За последние четыре сопоставимые тренировки заметного улучшения не зафиксировано. Это не доказательство физиологического застоя; оцените технику, самочувствие и восстановление.' },
] as const;
export function RecommendationList({ values }: { values: CurrentRecommendation[] }) {
  return <>{groups.map(group => { const rows = values.filter(row => row.value.kind === group.kind); return rows.length ? <section className="analytics-section recommendation-group" key={group.kind}><h2>{group.title}</h2><p className="small muted">{group.reason}</p>{rows.map(({ exercise, template, slotId, value }) => {
    const source = value.point.session.originalExercises.find(row => row.slotId === slotId)!, ids = new Set(source.sets.map(row => row.id));
    const results = value.point.observations.filter(row => row.row.slotId === slotId && ids.has(row.set.id));
    return <div className="recommendation-entry" data-recommendation={value.kind} key={slotId}><h3>{exercise.name} · {template.code ?? template.name}</h3><p className="small muted">Цель {source.sets.length} × {source.targetReps.join('–')} · {fullDate(value.point.timestamp)}</p><p className="small">{results.slice(0, 6).map(row => resultText(row.row.exercise, row.set, row.row.separateSides)).join(' · ')}{results.length > 6 && ' · ещё ' + (results.length - 6) + ' подх.'}</p><button className="text-button" onClick={() => go(objectPath('/progress/exercise', exercise.id))}>К результатам упражнения</button></div>;
  })}</section> : null; })}</>;
}
