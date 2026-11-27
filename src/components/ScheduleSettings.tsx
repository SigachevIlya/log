import { useState } from 'react';
import type { Settings } from '../domain/models';
import { saveDays } from '../db/calendar';
import { mayLeave, useDirtyGuard } from '../hooks/useDirtyGuard';
import { reportError } from '../lib/reportError';
import { draftKey, useStoredState } from '../hooks/useStoredState';
const names = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
function DaysEditor({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const [form, setForm, cache] = useStoredState(draftKey('schedule', 'days'), () => ({ baseline: [...settings.trainingDays], days: [...settings.trainingDays], expected: settings.scheduleRevision ?? 0 }), 'local');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false); const dirty = JSON.stringify(form.days) !== JSON.stringify(form.baseline); useDirtyGuard(dirty);
  return <>{cache.restored && dirty && <p className="small muted">Восстановлен черновик дней. Изменения ещё не применены.</p>}<div className="weekday-options">{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day} className="check-label"><input type="checkbox" checked={form.days.includes(day)} onChange={event => setForm(current => ({ ...current, days: event.target.checked ? [...current.days, day] : current.days.filter(value => value !== day) }))} />{names[day]}</label>)}</div>
    {(error || cache.error) && <p className="error-banner" role="alert">{error || cache.error}</p>}
    <button className="small-button filled" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await saveDays(form.days, form.expected); cache.clear(); onClose(); } catch (cause) { reportError('Сохранение дней', cause); setError(cause instanceof Error ? cause.message : 'Ошибка записи'); } finally { setBusy(false); } }}>Сохранить дни</button><button className="small-button" disabled={busy} onClick={() => { if (mayLeave()) { cache.clear(); onClose(); } }}>Отмена</button>
  </>;
}
export function ScheduleSettings({ settings }: { settings: Settings }) {
  const [editing, setEditing] = useStoredState('log:schedule-editing', false);
  return <section className="settings-section"><h2 className="eyebrow">Расписание</h2><p className="small muted">Дни определяют даты посещений; шаблоны следуют независимым циклом.</p>{editing ? <DaysEditor settings={settings} onClose={() => setEditing(false)} /> : <><p className="settings-row">{[1, 2, 3, 4, 5, 6, 0].filter(day => settings.trainingDays.includes(day)).map(day => names[day]).join(' · ')}</p><button className="text-button" onClick={() => setEditing(true)}>Изменить тренировочные дни</button></>}</section>;
}
