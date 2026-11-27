import { useState } from 'react';
import type { WorkoutSession } from '../domain/models';
import { newSet, validSet, classify } from '../domain/workout';
import { editSet } from '../domain/editWorkout';
import { splitSides } from '../domain/editWorkout';
import { WorkingSetRow } from '../components/WorkingSetRow';
import { Dialog } from '../components/Dialog';
import { saveHistory } from '../db/history';
import { reportError } from '../lib/reportError';
import { draftKey, useStoredState } from '../hooks/useStoredState';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
const localTime = (iso: string) => { const date = new Date(iso); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`; };

export function HistoryEditor({ source, onCancel, onSaved }: { source: WorkoutSession; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm, cache] = useStoredState(draftKey('history', source.id), () => ({ draft: structuredClone(source), baseline: structuredClone(source), start: localTime(source.startedAt), end: localTime(source.endedAt ?? source.startedAt) }), 'local');
  const { draft, baseline, start, end } = form;
  const [opened, setOpened] = useStoredState<Record<string, boolean>>(`log:history-open:${source.id}`, {});
  useDirtyGuard(JSON.stringify(draft) !== JSON.stringify(baseline) || start !== localTime(baseline.startedAt) || end !== localTime(baseline.endedAt ?? baseline.startedAt));
  const setStart = (start: string) => setForm(current => ({ ...current, start }));
  const setEnd = (end: string) => setForm(current => ({ ...current, end }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  function change(edit: (value: WorkoutSession) => void) { setForm(current => { const next = structuredClone(current); edit(next.draft); return next; }); }
  async function save(confirmed = false) {
    const startDate = new Date(start), endDate = new Date(end);
    if (!start || !end || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) { setError('Проверьте время начала и окончания.'); return; }
    if (classify(draft) === 'skipped' && baseline.status !== 'skipped' && !confirmed) { setConfirmEmpty(true); return; }
    setBusy(true); setError('');
    try { await saveHistory({ ...draft, startedAt: startDate.toISOString(), endedAt: endDate.toISOString() }, baseline.revision); cache.clear(); onSaved(); }
    catch (cause) { reportError('Редактирование истории', cause); setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.'); }
    finally { setBusy(false); }
  }
  return <div className="history-editor"><div className="page-heading"><h1>Изменить тренировку</h1></div>
    {cache.restored && <p className="small muted">Восстановлен черновик. Изменения ещё не применены.</p>}
    {cache.error && <p className="error-banner" role="alert">{cache.error}</p>}
    <p className="notice">Изменения истории не перестраивают текущий цикл и чередование упражнений.</p>
    <label className="field-label" htmlFor="history-start">Начало тренировки</label><input id="history-start" type="datetime-local" step="1" value={start} onChange={event => setStart(event.target.value)} />
    <label className="field-label" htmlFor="history-end">Окончание тренировки</label><input id="history-end" type="datetime-local" step="1" value={end} onChange={event => setEnd(event.target.value)} />
    <label className="field-label" htmlFor="history-duration">Продолжительность, сек.</label><input id="history-duration" type="number" min="0" step="1" value={Number.isFinite(Date.parse(end) - Date.parse(start)) ? Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000)) : ''} onChange={event => { const seconds = Number(event.target.value); if (Number.isInteger(seconds) && seconds >= 0 && Number.isFinite(Date.parse(start))) setEnd(localTime(new Date(Date.parse(start) + seconds * 1000).toISOString())); }} />
    {draft.exercises.map((row, rowIndex) => <details className="history-edit-exercise" key={row.slotId} open={!!opened[row.slotId]} onToggle={event => { if (event.currentTarget.open !== !!opened[row.slotId]) setOpened(current => ({ ...current, [row.slotId]: event.currentTarget.open })); }}><summary>{row.exercise.name}</summary>
      {row.exercise.unilateral && <label className="check-label"><input type="checkbox" checked={!!row.separateSides} onChange={event => change(value => { const target = value.exercises[rowIndex]; splitSides(target, event.target.checked); target.sets.forEach(set => { if (validSet(set, target.separateSides)) set.status = 'completed'; }); })} />Разные результаты слева и справа</label>}
      <div className="set-grid set-head" aria-hidden="true"><span>№</span><span>Вес, кг</span><span>Повторы</span><span>Готово</span><span /></div>
      {row.sets.map((set, index) => <WorkingSetRow weightMode={row.exercise.weightMode} key={set.id} set={set} index={index} separate={!!row.separateSides} onEdit={(field, text) => change(value => { const exercise = value.exercises[rowIndex]; const target = exercise.sets[index]; editSet(target, field, text); if (exercise.exercise.weightMode === 'bodyweight') { target.weightKg = 0; target.rightWeightKg = 0; } target.status = validSet(target, exercise.separateSides) ? 'completed' : 'pending'; exercise.skipped = false; })} onToggle={() => change(value => { const target = value.exercises[rowIndex].sets[index]; target.status = target.status === 'completed' ? 'skipped' : 'completed'; value.exercises[rowIndex].skipped = false; })} onDelete={() => change(value => { value.exercises[rowIndex].sets.splice(index, 1); })} />)}
      <button className="text-button" disabled={row.sets.length >= 100} onClick={() => change(value => { value.exercises[rowIndex].sets.push(newSet(row.exercise.weightMode === 'bodyweight' ? 0 : null)); })}>Добавить подход</button>
      <label className="field-label" htmlFor={`history-note-${row.slotId}`}>Заметка</label><textarea id={`history-note-${row.slotId}`} rows={2} value={row.notes} maxLength={4000} onChange={event => change(value => { value.exercises[rowIndex].notes = event.target.value; })} />
    </details>)}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <button className="primary-button" disabled={busy} onClick={() => void save()}>Сохранить изменения</button><button className="text-button" disabled={busy} onClick={() => { cache.clear(); onCancel(); }}>Отмена</button>
    {confirmEmpty && <Dialog title="Перевести в пропущенную?" error={error} onClose={() => !busy && setConfirmEmpty(false)}><p>Удалён последний подтверждённый подход. Запись станет пропущенной. Текущая последовательность тренировок останется прежней.</p><button className="primary-button" disabled={busy} onClick={() => void save(true)}>Сохранить как пропущенную</button><button className="text-button" onClick={() => setConfirmEmpty(false)}>Вернуться к редактированию</button></Dialog>}
  </div>;
}
