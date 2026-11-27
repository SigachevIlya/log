import { ChartNoAxesCombined, Dumbbell, History, Settings2 } from 'lucide-react';
export type Section = 'workout' | 'progress' | 'history' | 'settings';
const items = [
  { id: 'workout', label: 'Тренировка', Icon: Dumbbell },
  { id: 'progress', label: 'Прогресс', Icon: ChartNoAxesCombined },
  { id: 'history', label: 'История', Icon: History },
  { id: 'settings', label: 'Настройки', Icon: Settings2 },
] as const;
export function Navigation({ section, onChange }: { section: Section; onChange: (section: Section) => void }) {
  return <nav className="bottom-nav" aria-label="Основная навигация">
    {items.map(({ id, label, Icon }) => <button key={id} className={section === id ? 'nav-item active' : 'nav-item'} onClick={() => onChange(id)} aria-current={section === id ? 'page' : undefined}>
      <Icon size={21} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span>
    </button>)}
  </nav>;
}
