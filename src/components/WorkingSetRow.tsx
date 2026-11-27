import { Check, Trash2 } from 'lucide-react';
import type { WeightMode, WorkingSet } from '../domain/models';
import type { SetField } from '../domain/editWorkout';
import { validSet } from '../domain/workout';

export function WorkingSetRow({ set, index, separate, onEdit, onToggle, onDelete, weightMode }: {
  set: WorkingSet; index: number; separate: boolean;
  onEdit: (field: SetField, text: string) => void; onToggle: () => void; onDelete: () => void;
  weightMode?: WeightMode;
}) {
  const done = set.status === 'completed';
  function field(kind: 'weight' | 'reps', right = false) {
    const key: SetField = right ? kind === 'weight' ? 'rightWeightText' : 'rightRepsText' : kind === 'weight' ? 'weightText' : 'repsText';
    const number = right ? kind === 'weight' ? set.rightWeightKg : set.rightReps : kind === 'weight' ? set.weightKg : set.reps;
    const value = kind === 'weight' && weightMode === 'bodyweight' ? '0' : set[key] ?? (number == null ? '' : String(number));
    return <input aria-label={`${kind === 'weight' ? 'Вес' : 'Повторы'} ${index + 1}${separate ? right ? ' правая' : ' левая' : ''}`} inputMode={kind === 'weight' ? 'decimal' : 'numeric'} value={value} readOnly={kind === 'weight' && weightMode === 'bodyweight'} maxLength={10} autoComplete="off" onChange={event => onEdit(key, event.target.value)} aria-invalid={value !== '' && (number == null) && !(kind === 'weight' && weightMode === 'bodyweight')} />;
  }
  return <div className={`set-entry ${done ? 'set-completed' : ''}`}>
    <div className="set-grid"><span className="set-number">{index + 1}{separate && <small>Л</small>}</span>{field('weight')}{field('reps')}
      <button className="set-confirm icon-button" aria-label={`${done ? 'Снять отметку' : 'Подтвердить подход'} ${index + 1}`} aria-pressed={done} disabled={!done && !validSet(set, separate)} onClick={onToggle}><Check size={20} /></button>
      <button className="icon-button muted" aria-label={`Удалить подход ${index + 1}`} onClick={onDelete}><Trash2 size={17} /></button>
    </div>
    {separate && <div className="set-grid right-side"><span className="set-number">П</span>{field('weight', true)}{field('reps', true)}</div>}
  </div>;
}
