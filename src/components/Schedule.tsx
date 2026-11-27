import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { sameDay, weekDates } from '../domain/schedule';
import { dateKey, dayNames, dayPlan, localDate } from '../domain/calendar';
import type { ScheduleException, Settings, WorkoutSession } from '../domain/models';
import { statusText } from '../domain/format';
import { addException, removeException } from '../db/calendar';
import { reportError } from '../lib/reportError';
import { Dialog } from './Dialog';
import { CalendarMark, calendarLabels, type CalendarState } from './CalendarMark';
import { useStoredState } from '../hooks/useStoredState';
import { go, objectPath } from '../routing/router';
export function Schedule({ now, settings, exceptions, history }: { now: Date; settings: Settings; exceptions: ScheduleException[]; history: WorkoutSession[] }) {
  const [week, setWeek] = useStoredState('log:calendar-week', 0);
  const [selected, setSelected] = useState<{ date: string; revision: number } | null>(null), [legend, setLegend] = useState(false);
  const [target, setTarget] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const anchor = new Date(now); anchor.setDate(anchor.getDate() + week * 7); const dates = weekDates(anchor);
  const plan = selected ? dayPlan(localDate(selected.date), settings.trainingDays, exceptions) : null;
  const change = plan?.source ?? plan?.extra ?? plan?.moved;
  const recordsFor = (key: string) => history.filter(row => dateKey(new Date(row.startedAt)) === key);
  function stateFor(date: Date): CalendarState {
    const key = dateKey(date), state = dayPlan(date, settings.trainingDays, exceptions), records = recordsFor(key);
    if (records.length > 1) return 'multiple';
    if (records.length === 1 && records[0].status !== 'active') return records[0].status;
    if (state.kind === 'moved' || state.kind === 'move') return 'moved';
    if (state.kind === 'extra') return 'extra';
    if (state.kind === 'skip' || (state.planned && key < dateKey(now))) return 'calendar-skip';
    return state.planned ? 'planned' : 'ordinary';
  }
  async function act(operation: () => Promise<unknown>) { setBusy(true); setError(''); try { await operation(); setSelected(null); } catch (cause) { reportError('Изменение календаря', cause); setError(cause instanceof Error ? cause.message : 'Ошибка сохранения'); } finally { setBusy(false); } }
  const shortDate = (date: Date) => `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
  return <section className="schedule" aria-label="Расписание на текущую неделю">
    <div className="section-heading"><span className="eyebrow">Расписание</span><span className="small muted">{[1, 2, 3, 4, 5, 6, 0].filter(day => settings.trainingDays.includes(day)).map(day => dayNames[day]).join(' · ')}</span></div>
    <div className="week-controls"><button className="icon-button" aria-label="Предыдущая неделя" onClick={() => setWeek(week - 1)}><ChevronLeft size={18} /></button><button className="text-button week-range" onClick={() => setWeek(0)} aria-label="Текущая неделя">{shortDate(dates[0])} — {shortDate(dates[6])} · {dates[6].getFullYear()}</button><button className="icon-button" aria-label="Следующая неделя" onClick={() => setWeek(week + 1)}><ChevronRight size={18} /></button><button className="text-button legend-button" onClick={() => setLegend(true)}>Обозначения</button></div>
    <div className="week-grid">{dates.map(date => {
      const key = dateKey(date), state = dayPlan(date, settings.trainingDays, exceptions), records = recordsFor(key), presentation = stateFor(date);
      return <button key={key} className={`week-day ${state.planned ? 'training-day' : ''} ${sameDay(date, now) ? 'today' : ''} ${records.length ? 'recorded-day' : ''}`} aria-label={`${key}${sameDay(date, now) ? ', сегодня' : ''}, ${calendarLabels[presentation]}${records.length > 1 ? `, записей: ${records.length}` : ''}`} onClick={() => { setSelected({ date: key, revision: settings.scheduleRevision ?? 0 }); setTarget(''); setError(''); }}><span className="weekday">{dayNames[date.getDay()].toUpperCase()}</span><span className="day-number">{date.getDate()}</span><span className="day-mark"><CalendarMark state={presentation} /></span>{records.length > 1 && <span className="day-record-count" aria-hidden="true">{records.length}</span>}</button>;
    })}</div>
    {legend && <Dialog title="Обозначения календаря" onClose={() => setLegend(false)}><ul className="calendar-legend">{(Object.keys(calendarLabels) as CalendarState[]).map(state => <li key={state}><CalendarMark state={state} /><span>{calendarLabels[state]}{state === 'incomplete' && ' — есть результаты, но не выполнена обязательная цель'}{state === 'multiple' && ' — количество показано отдельно; статусы доступны по нажатию даты'}</span></li>)}</ul><p className="small muted">Контур даты — сегодня. Пропуск расписания не создаёт историю.</p></Dialog>}
    {selected && plan && <Dialog title={localDate(selected.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} error={error} onClose={() => !busy && setSelected(null)}>
      <section className="calendar-dialog-section"><h3>Состояние даты</h3><p>{calendarLabels[stateFor(localDate(selected.date))]}</p>{change?.kind === 'move' && <p className="small muted">Перенос: {change.date} → {change.targetDate}</p>}</section>
      <section className="calendar-dialog-section"><h3>Записанные тренировки</h3>{recordsFor(selected.date).length ? recordsFor(selected.date).map(row => <button className="calendar-record-link" key={row.id} onClick={() => { setSelected(null); go(objectPath('/history', row.id)); }}><strong>{row.name}</strong><span>{statusText[row.status]}</span></button>) : <p className="small muted">Записей нет</p>}</section>
      <section className="calendar-dialog-section"><h3>Действия с расписанием</h3><p className="small muted">Меняется только дата, цикл остаётся прежним.</p>
      {change ? <button className="primary-button" disabled={busy} onClick={() => void act(() => removeException(change.id, selected.revision))}>Отменить изменение даты</button> : plan.planned ? <>
        <button className="small-button outlined" disabled={busy} onClick={() => void act(() => addException('skip', selected.date, undefined, selected.revision))}>Пропустить дату расписания</button>
        <label className="field-label" htmlFor="move-target">Перенести на дату</label><input id="move-target" type="date" value={target} onChange={event => setTarget(event.target.value)} />
        <button className="primary-button" disabled={busy || !target} onClick={() => void act(() => addException('move', selected.date, target, selected.revision))}>Перенести тренировочный день</button>
      </> : <button className="primary-button" disabled={busy} onClick={() => void act(() => addException('extra', selected.date, undefined, selected.revision))}>Добавить тренировочный день</button>}
      </section>
    </Dialog>}
  </section>;
}
