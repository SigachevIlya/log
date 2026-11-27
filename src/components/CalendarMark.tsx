export type CalendarState = 'ordinary' | 'planned' | 'completed' | 'incomplete' | 'skipped' | 'calendar-skip' | 'moved' | 'extra' | 'multiple';
export const calendarLabels: Record<CalendarState, string> = { ordinary: 'Обычный день', planned: 'Тренировочный день', completed: 'Завершена', incomplete: 'Неполная', skipped: 'Пропущена', 'calendar-skip': 'Пропуск даты расписания без записи тренировки', moved: 'Перенесённый день', extra: 'Дополнительный день', multiple: 'Несколько записей тренировок' };
export function CalendarMark({ state }: { state: CalendarState }) {
  return <svg data-calendar-state={state} viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {state === 'ordinary' && <circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none" />}
    {state === 'planned' && <path d="M4 10h12" />}
    {state === 'completed' && <path d="m4 10 4 4 8-9" />}
    {state === 'incomplete' && <><circle cx="10" cy="10" r="6" /><path d="M10 4a6 6 0 0 0 0 12Z" fill="currentColor" stroke="none" /></>}
    {state === 'skipped' && <path d="m5 5 10 10M15 5 5 15" />}
    {state === 'calendar-skip' && <><circle cx="10" cy="10" r="6" strokeDasharray="2 2" /><path d="m6 14 8-8" /></>}
    {state === 'moved' && <path d="M4 15 15 4M6 4h9v9" />}
    {state === 'extra' && <path d="M4 10h12M10 4v12" />}
    {state === 'multiple' && <><circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" /></>}
  </svg>;
}
