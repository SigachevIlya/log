import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { ProgramState, WorkoutSession } from '../domain/models';
import { completedSets, progress } from '../domain/workout';
import { exerciseCount, naturalDuration, plural, resultText, setCount, statusText } from '../domain/format';
import { rollbackReason } from '../domain/cycle';
import { deleteHistory } from '../db/history';
import { reportError } from '../lib/reportError';
import { EmptyPage } from './EmptyPage';
import { HistoryEditor } from './HistoryEditor';
import { Dialog } from '../components/Dialog';
import { go, objectPath, routeId, useRoute } from '../routing/router';

export function SessionResults({ session }: { session: WorkoutSession }) {
  const withResults = session.exercises.filter(row => completedSets(row).length > 0);
  const skipped = session.exercises.filter(row => completedSets(row).length === 0);
  return <div className="history-results">{withResults.map(row => {
    const results = completedSets(row), missing = Math.max(row.plannedSets ?? 0, row.sets.length) - results.length;
    return <section key={row.slotId}><h2>{row.exercise.name}</h2>
      {results.map((set, index) => <p key={set.id} className="result-set"><span>{index + 1}</span><span>{resultText(row.exercise, set, row.separateSides)}</span></p>)}
      {missing > 0 && <p className="small muted">{missing} {plural(missing, ['подход пропущен', 'подхода пропущено', 'подходов пропущено'])}</p>}
      {row.notes && <p className="result-note">{row.notes}</p>}
    </section>;
  })}{skipped.length > 0 && <details className="skipped-exercises"><summary>Пропущенные упражнения ({skipped.length})</summary>{skipped.map(row => <p key={row.slotId}>{row.exercise.name} · {setCount(Math.max(row.plannedSets ?? 0, row.sets.length))}</p>)}</details>}</div>;
}
export function SessionSummary({ session, onHome }: { session: WorkoutSession; onHome: () => void }) {
  const stats = progress(session);
  return <><div className="page-heading"><h1>Тренировка сохранена.</h1></div><section className="summary-card"><h2>{session.name}</h2><p>{statusText[session.status]} · {naturalDuration(session.startedAt, session.endedAt)}</p><p>{exerciseCount(stats.exercisesDone)} · {setCount(stats.confirmed)}</p>{stats.missing > 0 && <p className="muted">Не выполнено: {setCount(stats.missing)}</p>}</section><button className="primary-button" onClick={onHome}>На главный экран</button></>;
}
export function HistoryPage({ history, program, active, onWorkout }: { history: WorkoutSession[]; program: ProgramState; active: boolean; onWorkout: () => void }) {
  const route = useRoute(), selectedId = routeId(route, '/history'), editing = route.endsWith('/edit');
  const [removing, setRemoving] = useState<{ revision: number } | null>(null);
  const [restore, setRestore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = history.find(item => item.id === selectedId);
  useEffect(() => { if (route !== '/history' && !selected) go('/history', { replace: true, guard: false }); }, [selectedId, selected, route]);
  useEffect(() => { setRemoving(null); setError(''); }, [selectedId]);
  if (history.length === 0) return <EmptyPage kind="history" onWorkout={onWorkout} />;
  if (selected && editing) return <HistoryEditor key={selected.id} source={selected} onCancel={() => go(objectPath('/history', selected.id), { guard: false })} onSaved={() => go(objectPath('/history', selected.id), { guard: false })} />;
  if (selected) {
    const stats = progress(selected), reason = rollbackReason(selected, program, active);
    async function remove() {
      setBusy(true); setError('');
      try { await deleteHistory(selected!.id, removing!.revision, restore); setRemoving(null); go('/history', { replace: true, guard: false }); }
      catch (cause) { reportError('Удаление истории', cause); setError(cause instanceof Error ? cause.message : 'Не удалось удалить запись.'); }
      finally { setBusy(false); }
    }
    return <><div className="page-heading history-heading"><button className="text-button back-button" onClick={() => go('/history')}><ArrowLeft size={18} />К истории</button><h1>{selected.name}</h1><p className="muted">{new Date(selected.startedAt).toLocaleString('ru-RU')}</p><p>{statusText[selected.status]}{selected.status !== 'skipped' && ` · ${naturalDuration(selected.startedAt, selected.endedAt)}`}</p></div>
      {selected.status !== 'skipped' && <p className="history-overview">{stats.confirmed} / {stats.total + stats.optionalTotal} {plural(stats.total + stats.optionalTotal, ['подход', 'подхода', 'подходов'])} · {exerciseCount(stats.exercisesDone)}</p>}
      <div className="button-row"><button className="small-button outlined" onClick={() => go(`${objectPath('/history', selected.id)}/edit`)}>Редактировать тренировку</button><button className="small-button danger" onClick={() => { setRestore(false); setRemoving({ revision: selected.revision }); setError(''); }}>Удалить тренировку</button></div>
      <SessionResults session={selected} />
      {removing && <Dialog title="Удалить тренировку из истории?" error={error} onClose={() => !busy && setRemoving(null)}><p>Результаты будут удалены и больше не будут подставляться. По умолчанию текущая позиция цикла сохраняется.</p>{reason ? <p className="notice">{reason} Цикл останется прежним.</p> : <label className="check-label"><input type="checkbox" checked={restore} onChange={event => setRestore(event.target.checked)} />Восстановить цикл: следующая {selected.cycleBefore!.nextTemplateId}. Восстановить также чередование упражнений.</label>}<button className="primary-button" disabled={busy} onClick={() => void remove()}>Подтвердить удаление</button><button className="text-button" disabled={busy} onClick={() => setRemoving(null)}>Отмена</button></Dialog>}
    </>;
  }
  return <><div className="page-heading"><h1>История.</h1></div><div className="history-list">{history.map(session => {
    const stats = progress(session);
    return <button key={session.id} className="history-item" onClick={() => go(objectPath('/history', session.id))}><span><time dateTime={session.startedAt}>{new Date(session.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</time><strong>{session.name}</strong><span>{statusText[session.status]}{session.status !== 'skipped' && ` · ${naturalDuration(session.startedAt, session.endedAt)} · ${exerciseCount(stats.exercisesDone)} · ${setCount(stats.confirmed)}`}</span></span><ChevronRight size={18} /></button>;
  })}</div></>;
}
