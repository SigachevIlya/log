import { useState } from 'react';
import type { Exercise } from '../domain/models';
import { Dialog } from './Dialog';
import { ExerciseForm } from './ExerciseForm';
export function ExercisePicker({ library, onPick, onClose }: { library: Exercise[]; onPick: (exercise: Exercise) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''), [creating, setCreating] = useState(false);
  return <Dialog title={creating ? 'Новое упражнение' : 'Выбрать упражнение'} onClose={onClose}>
    {creating ? <ExerciseForm initialName={query} onSaved={onPick} onCancel={() => setCreating(false)} /> : <>
      <label className="field-label" htmlFor="exercise-search">Поиск в библиотеке</label><input id="exercise-search" value={query} onChange={event => setQuery(event.target.value)} autoFocus />
      <div className="picker-list">{library.filter(row => !row.archived && row.name.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU'))).map(row => <button key={row.id} className="picker-item" onClick={() => onPick(row)}>{row.name}</button>)}</div>
      <button className="small-button outlined" onClick={() => setCreating(true)}>Создать своё упражнение</button>
    </>}
  </Dialog>;
}
