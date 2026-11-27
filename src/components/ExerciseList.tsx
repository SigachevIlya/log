import { useState } from 'react';
import { Check, ChevronDown, Pencil } from 'lucide-react';
import type { Exercise, TemplateSlot } from '../domain/models';
import { reportError } from '../lib/reportError';
import { draftKey, useStoredState } from '../hooks/useStoredState';
import { useDirtyGuard } from '../hooks/useDirtyGuard';

export interface ExerciseRow { slot: TemplateSlot; exercise: Exercise; alternateName?: string }
function ExerciseItem({ row, index, onSave }: { row: ExerciseRow; index: number; onSave: (id: string, description: string, expected: number) => Promise<void> }) {
  const key = `${row.slot.id}:${row.exercise.id}`;
  const [open, setOpen] = useStoredState(`log:exercise-open:${key}`, false);
  const [editing, setEditing] = useStoredState(`log:description-edit:${key}`, false);
  const [form, setForm, cache] = useStoredState(draftKey('description', key), () => ({ text: row.exercise.description, baseline: row.exercise.description, revision: row.exercise.revision ?? 0 }), 'local');
  const text = form.text;
  useDirtyGuard(editing && text !== form.baseline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { exercise, slot, alternateName } = row;
  async function save() {
    setSaving(true); setError('');
    try { await onSave(exercise.id, text.trim(), form.revision); cache.clear(); setEditing(false); }
    catch (cause) { reportError('Сохранение пояснения', cause); setError(cause instanceof Error ? cause.message : 'Не удалось сохранить пояснение. Попробуйте ещё раз.'); }
    finally { setSaving(false); }
  }
  return <li className={`exercise-item ${open ? 'is-open' : ''}`}>
    <button className="exercise-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`description-${slot.id}`}>
      <span className="exercise-number">{String(index + 1).padStart(2, '0')}</span>
      <span className="exercise-info"><span className="exercise-name">{exercise.name}</span>
        <span className="exercise-meta">{slot.sets} × {slot.reps.join('–')}<span className="reps-label"> повторений</span>{slot.optional && <span className="optional-label">По желанию</span>}</span>
      </span><ChevronDown className="exercise-chevron" size={17} aria-hidden="true" />
    </button>
    {open && <div className="exercise-description" id={`description-${slot.id}`}>
      {alternateName && <p className="alternation">Чередуется с упражнением «{alternateName}». Варианты меняются после фактического выполнения упражнения, а не по календарным неделям.</p>}
      {editing ? <div className="description-editor">
        <label htmlFor={`edit-${slot.id}`}>Пояснение к упражнению</label>
        <textarea id={`edit-${slot.id}`} rows={5} value={text} onChange={event => setForm(current => ({ ...current, text: event.target.value }))} autoFocus={!cache.restored} maxLength={4000} />
        {cache.restored && text !== form.baseline && <p className="small muted">Восстановлен черновик. Изменения ещё не применены.</p>}
        <p className="small muted">Изменится во всех шаблонах с этим упражнением.</p>
        <div className="button-row"><button className="small-button filled" disabled={saving} onClick={save}><Check size={16} />{saving ? 'Сохранение…' : 'Сохранить'}</button><button className="small-button" disabled={saving} onClick={() => { cache.clear(); setEditing(false); setError(''); }}>Отмена</button></div>
        {(error || cache.error) && <p className="error-text" role="alert">{error || cache.error}</p>}
      </div> : <><p>{exercise.description || 'Пояснение пока не добавлено.'}</p><button className="text-button" onClick={() => { setForm({ text: exercise.description, baseline: exercise.description, revision: exercise.revision ?? 0 }); setEditing(true); }}><Pencil size={14} />Изменить пояснение</button></>}
    </div>}
  </li>;
}
export function ExerciseList({ rows, onSave }: { rows: ExerciseRow[]; onSave: (id: string, description: string, expected: number) => Promise<void> }) {
  return <ol className="exercise-list">{rows.map((row, index) => <ExerciseItem key={`${row.slot.id}-${row.exercise.id}`} row={row} index={index} onSave={onSave} />)}</ol>;
}
