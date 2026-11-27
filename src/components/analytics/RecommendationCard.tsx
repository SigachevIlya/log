import type { Recommendation } from '../../domain/analytics/recommendations';
import { fullDate } from '../../domain/analytics/periods';
export function RecommendationCard({ value }: { value: Recommendation }) {
  return <aside className="recommendation-card" data-recommendation={value.kind}><strong>{value.title}</strong><p>{value.reason}</p><p className="small muted">По записи {fullDate(value.point.timestamp)} · {value.point.session.name}</p></aside>;
}
