import { ChartNoAxesCombined, History } from 'lucide-react';
export function EmptyPage({ kind, onWorkout }: { kind: 'progress' | 'history'; onWorkout: () => void }) {
  const progress = kind === 'progress';
  const Icon = progress ? ChartNoAxesCombined : History;
  return <><div className="page-heading"><span className="eyebrow">Ваш дневник</span><h1>{progress ? 'Прогресс' : 'История'}.</h1></div><section className="empty-state"><div className="empty-icon"><Icon size={38} strokeWidth={1} /></div><span className="eyebrow">Всё начинается с первого подхода</span><h2>{progress ? 'Здесь будет ваш рост' : 'Ваша история впереди'}</h2><p>{progress ? 'Графики и личные рекорды появятся на следующих этапах. Результаты тренировок уже сохраняются в истории.' : 'Здесь появятся ваши завершённые тренировки. Начните тренировку и сохраните результаты.'}</p><button className="small-button outlined" onClick={onWorkout}>К тренировке</button></section><p className="empty-footer">Только ваши тренировки. Только ваши результаты.</p></>;
}
