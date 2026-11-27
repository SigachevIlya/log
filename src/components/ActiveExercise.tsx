import { useState } from 'react';
import { ChevronDown, MoreHorizontal, Plus } from 'lucide-react';
import type { SessionExercise, WorkingSet } from '../domain/models';
import { completedSets, weightLabels } from '../domain/workout';
import type { SetField } from '../domain/editWorkout';
import { WorkingSetRow } from './WorkingSetRow';
import { resultText } from '../domain/format';
import type { Recommendation } from '../domain/analytics/recommendations';
import { RecommendationCard } from './analytics/RecommendationCard';

export function ActiveExercise({ exercise, open, onOpen, onEdit, onSetToggle, onDeleteSet, onAddSet, onNote, onSplit, onAction, first, last, onNext, nextLabel, recommendation }: {
  exercise: SessionExercise; open: boolean; onOpen: () => void;
  onEdit: (id: string, field: SetField, value: string) => void;
  onSetToggle: (id: string) => void; onDeleteSet: (set: WorkingSet, index: number) => void;
  onAddSet: () => void; onNote: (text: string) => void; onSplit: (value: boolean) => void;
  onAction: (action: 'skip' | 'replace' | 'up' | 'down' | 'remove') => void; first: boolean; last: boolean;
  onNext?: () => void; nextLabel?: string;
  recommendation?: Recommendation | null;
}) {
  const [menu, setMenu] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const done = completedSets(exercise).length;
  const full = exercise.sets.length > 0 && done === exercise.sets.length;
  const previous = exercise.previousSets ?? [];
  return <section id={`active-${exercise.slotId}`} className={`active-exercise ${full ? 'exercise-completed' : ''} ${exercise.skipped ? 'exercise-skipped' : ''}`} aria-label={exercise.exercise.name}>
    <button className="active-exercise-toggle" aria-expanded={open} onClick={onOpen}>
      <span><strong>{exercise.exercise.name}</strong><span className="active-exercise-meta">{exercise.plannedSets ?? exercise.sets.length} × {exercise.targetReps.join('–')} · {done}/{exercise.sets.length} выполнено{exercise.optional && ' · По желанию'}{exercise.added && ' · Вне программы'}</span>{exercise.skipped && <span className="exercise-status">Пропущено</span>}</span><ChevronDown size={18} className={open ? 'rotated' : ''} />
    </button>
    {open && <div className="active-exercise-body">
      <div className="exercise-tools"><details><summary>Пояснение</summary><p>{exercise.exercise.description || 'Пояснение пока не добавлено.'}</p></details><button className="icon-button" aria-label="Действия с упражнением" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={21} /></button></div>
      <p className="load-hint">{weightLabels[exercise.exercise.weightMode]}. {exercise.exercise.customWeightNote} {exercise.exercise.repetitionRule ?? (exercise.exercise.unilateral ? 'Повторы на одну сторону. Один подход включает обе стороны.' : '')}</p>
      {recommendation && !exercise.skipped && <RecommendationCard value={recommendation} />}
      {menu && <div className="exercise-actions">
        <button onClick={() => { onAction('skip'); setMenu(false); }}>{exercise.skipped ? 'Восстановить упражнение' : 'Пропустить упражнение'}</button>
        <button onClick={() => { onAction('replace'); setMenu(false); }}>Заменить упражнение</button>
        <button disabled={first} onClick={() => onAction('up')}>Поднять выше</button><button disabled={last} onClick={() => onAction('down')}>Опустить ниже</button>
        {exercise.added && <button className="danger" onClick={() => onAction('remove')}>Удалить упражнение</button>}
      </div>}
      {previous.length > 0 && <p className="previous-results">В прошлый раз: {previous.map(set => resultText(exercise.exercise, set, exercise.separateSides)).join(' · ')}</p>}
      {!exercise.skipped && <>
        {exercise.exercise.unilateral && <label className="check-label side-toggle"><input type="checkbox" checked={!!exercise.separateSides} onChange={event => onSplit(event.target.checked)} />Разные результаты слева и справа</label>}
        <div className="set-grid set-head" aria-hidden="true"><span>№</span><span>Вес, кг</span><span>Повторы</span><span>Готово</span><span /></div>
        {exercise.sets.map((set, index) => <WorkingSetRow weightMode={exercise.exercise.weightMode} key={set.id} set={set} index={index} separate={!!exercise.separateSides} onEdit={(field, value) => onEdit(set.id, field, value)} onToggle={() => onSetToggle(set.id)} onDelete={() => onDeleteSet(set, index)} />)}
        <div className="exercise-footer"><button className="text-button" disabled={exercise.sets.length >= 100} onClick={onAddSet}><Plus size={16} />Добавить подход</button><button className="text-button" aria-expanded={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>Заметка{exercise.notes && ' •'}</button></div>
      </>}
      {exercise.skipped && <button className="text-button" aria-expanded={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>Заметка{exercise.notes && ' •'}</button>}
      {noteOpen && <><label className="field-label note-label" htmlFor={`note-${exercise.slotId}`}>Заметка</label><textarea id={`note-${exercise.slotId}`} rows={2} maxLength={4000} value={exercise.notes} onChange={event => onNote(event.target.value)} placeholder="Необязательно" /></>}
      {full && onNext && <button className="small-button outlined" onClick={onNext}>{nextLabel ?? 'Следующее упражнение'}</button>}
    </div>}
  </section>;
}
