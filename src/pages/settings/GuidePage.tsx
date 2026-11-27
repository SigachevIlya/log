import { useEffect } from 'react';
import { guideSections } from '../../data/guide';
import { go, objectPath, routeId, useRoute } from '../../routing/router';
import { CalendarMark, calendarLabels, type CalendarState } from '../../components/CalendarMark';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
export function GuidePage() {
  const route = useRoute(), selected = routeId(route, '/settings/guide');
  useScrollRestoration(route, true);
  useEffect(() => { if (selected && !guideSections.some(row => row.id === selected)) go('/settings/guide', { replace: true, guard: false }); else if (selected) document.getElementById(`guide-${selected}`)?.scrollIntoView({ block: 'start' }); }, [selected]);
  return <div className="guide-page"><div className="page-heading editor-heading"><button className="text-button" onClick={() => go('/settings')}>К настройкам</button><h1>Руководство.</h1></div><p className="small muted">Короткие инструкции для функций текущей версии LOG.</p>
    {guideSections.map(section => <details className="guide-section" key={section.id} id={`guide-${section.id}`} open={selected === section.id} onToggle={event => { if (event.currentTarget.open && selected !== section.id) go(objectPath('/settings/guide', section.id)); else if (!event.currentTarget.open && selected === section.id) go('/settings/guide', { replace: true }); }}><summary>{section.title}</summary><div>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}{section.id === 'calendar' && <ul className="calendar-legend">{(Object.keys(calendarLabels) as CalendarState[]).map(state => <li key={state}><CalendarMark state={state} /><span>{calendarLabels[state]}</span></li>)}</ul>}</div></details>)}
  </div>;
}
