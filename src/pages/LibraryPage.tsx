import { useEffect, useState } from 'react';
import type { Exercise } from '../domain/models';
import { muscles } from '../data/muscles';
import { archiveExercise } from '../db/program';
import { reportError } from '../lib/reportError';
import { ExerciseForm } from '../components/ExerciseForm';
import { Dialog } from '../components/Dialog';
import { RowMenu } from '../components/RowMenu';
import { go, objectPath, routeId, useRoute } from '../routing/router';
import { useStoredState } from '../hooks/useStoredState';
export function LibraryPage({ exercises, onBack }: { exercises: Exercise[]; onBack: () => void }) {
  const route = useRoute(), id = routeId(route, '/program/library'), source = exercises.find(row => row.id === id);
  const [search, setSearch] = useStoredState('log:library-search', ''), [muscle, setMuscle] = useStoredState('log:library-muscle', '');
  const [archivesOpen, setArchivesOpen] = useStoredState('log:library-archives', false);
  const [archive, setArchive] = useState<Exercise | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (route !== '/program/library' && (!id || (id !== 'new' && !source))) go('/program/library', { replace: true, guard: false }); }, [id, source, route]);
  if (id && (id === 'new' || source)) return <><div className="page-heading editor-heading"><h1>{id === 'new' ? 'Новое упражнение' : 'Изменить упражнение'}</h1></div><ExerciseForm key={id} source={source} onSaved={() => go('/program/library', { guard: false })} onCancel={() => go('/program/library', { guard: false })} /></>;
  const filtered = exercises.filter(row => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (!muscle || row.primaryMuscle === muscle || row.secondaryMuscles?.includes(muscle)));
  const card = (row: Exercise) => <section key={row.id} className="program-card compact-card" data-exercise-id={row.id}><button className="compact-card-main" aria-label="Изменить" onClick={() => go(objectPath('/program/library', row.id))}><span className="compact-card-text"><strong>{row.name}</strong><span className="small muted">{row.primaryMuscle ?? 'Другое'}</span></span></button><RowMenu label={`Действия с упражнением ${row.name}`}><button onClick={() => go(objectPath('/program/library', row.id))}>Редактировать</button><button onClick={() => { setArchive(row); setError(''); }}>{row.archived ? 'Восстановить' : 'Архивировать'}</button></RowMenu></section>;
  return <><div className="page-heading editor-heading"><button className="text-button" onClick={onBack}>К программе</button><h1>Библиотека.</h1></div>
    <label className="field-label" htmlFor="library-search">Поиск упражнений</label><input id="library-search" type="search" autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} />
    <label className="field-label" htmlFor="library-muscle">Мышечная группа</label><select id="library-muscle" value={muscle} onChange={event => setMuscle(event.target.value)}><option value="">Все группы</option>{muscles.map(name => <option key={name}>{name}</option>)}</select>
    <button className="text-button" onClick={() => go('/program/library/new')}>Создать упражнение</button>
    <div className="program-list">{filtered.filter(row => !row.archived).map(card)}</div>
    {filtered.some(row => row.archived) && <details className="archive-list" open={archivesOpen} onToggle={event => { if (event.currentTarget.open !== archivesOpen) setArchivesOpen(event.currentTarget.open); }}><summary>Архивные упражнения ({filtered.filter(row => row.archived).length})</summary>{filtered.filter(row => row.archived).map(card)}</details>}
    {archive && <Dialog title={archive.archived ? 'Восстановить упражнение?' : 'Архивировать упражнение?'} error={error} onClose={() => !busy && setArchive(null)}><p>История и снимки сохранятся. Если упражнение входит в активные шаблоны, сначала замените его или удалите из них в редакторе программы.</p><button className="primary-button" disabled={busy} onClick={async () => { setBusy(true); try { await archiveExercise(archive.id, !archive.archived, archive.revision ?? 0); setArchive(null); } catch (cause) { reportError('Архивирование упражнения', cause); setError(cause instanceof Error ? cause.message : 'Ошибка записи'); } finally { setBusy(false); } }}>Подтвердить</button></Dialog>}
  </>;
}
