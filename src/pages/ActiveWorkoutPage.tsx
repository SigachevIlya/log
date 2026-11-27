import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import type { Exercise, SessionExercise, WorkingSet, WorkoutSession } from '../domain/models';
import { completedSets, duration, newSet, prefillSession, progress, validSet } from '../domain/workout';
import { addedExercise, editSet, replaceExercise, splitSides } from '../domain/editWorkout';
import type { SessionWriter } from '../lib/SessionWriter';
import { ActiveExercise } from '../components/ActiveExercise';
import { ExercisePicker } from '../components/ExercisePicker';
import { Dialog } from '../components/Dialog';
import { naturalDuration, plural } from '../domain/format';
import { useStoredState } from '../hooks/useStoredState';
import type { Analytics } from '../domain/analytics';
import { recommendationForActive } from '../domain/analytics/recommendations';

export function ActiveWorkoutPage({ session, writer, saving, dirty, error, actionError, library, history, busy, onBack, onFinish, onCancel, analytics, recommendationsEnabled }: {
  session: WorkoutSession; writer: SessionWriter; saving: boolean; dirty: boolean; error: string; actionError: string;
  library: Exercise[]; history: WorkoutSession[]; busy: boolean;
  onBack: () => void; onFinish: () => Promise<boolean>; onCancel: () => Promise<boolean>;
  analytics: Analytics; recommendationsEnabled: boolean;
}) {
  const [open, setOpen] = useStoredState<string | null>(`log:active-open:${session.id}`, () => session.exercises.find(row => !row.skipped && (row.sets.length === 0 || completedSets(row).length < row.sets.length))?.slotId ?? null);
  const [now, setNow] = useState(Date.now());
  const [picker, setPicker] = useState<string | 'add' | null>(null);
  const [finish, setFinish] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [warning, setWarning] = useState<{ title: string; action: () => void } | null>(null);
  const [undo, setUndo] = useState<{ slotId: string; exerciseId: string; set: WorkingSet; index: number; until: number } | null>(null);
  const stats = progress(session);
  const recommendationKey = JSON.stringify(session.exercises.map(row => [row.slotId, row.exercise, row.targetReps, row.plannedSets, row.optional]));
  const recommendations = useMemo(() => new Map(session.exercises.map(row => [row.slotId, recommendationsEnabled ? recommendationForActive(analytics.series, row, session.templateId, history) : null])), [analytics, recommendationsEnabled, recommendationKey, session.templateId]);
  function nextExercise(slotId: string) {
    const index = session.exercises.findIndex(row => row.slotId === slotId);
    const next = [...session.exercises.slice(index + 1), ...session.exercises.slice(0, index)].find(row => !row.skipped && completedSets(row).length < row.sets.length);
    if (!next || stats.missing === 0) { setFinish(true); return; }
    setOpen(next.slotId);
    requestAnimationFrame(() => document.getElementById(`active-${next.slotId}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
  }
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 1000); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);
  function editExercise(id: string, edit: (exercise: SessionExercise) => void) {
    writer.change(current => { const row = current.exercises.find(item => item.slotId === id); if (row) edit(row); });
  }
  function action(row: SessionExercise, kind: 'skip' | 'replace' | 'up' | 'down' | 'remove') {
    const run = () => {
      if (kind === 'replace') { setPicker(row.slotId); return; }
      writer.change(current => {
        const index = current.exercises.findIndex(item => item.slotId === row.slotId);
        if (index < 0) return;
        if (kind === 'skip') current.exercises[index].skipped = !current.exercises[index].skipped;
        if (kind === 'remove' && row.added) current.exercises.splice(index, 1);
        const other = kind === 'up' ? index - 1 : kind === 'down' ? index + 1 : -1;
        if (other >= 0 && other < current.exercises.length) [current.exercises[index], current.exercises[other]] = [current.exercises[other], current.exercises[index]];
      });
    };
    if ((kind === 'replace' || kind === 'remove' || (kind === 'skip' && !row.skipped)) && row.sets.some(set => set.status === 'completed')) setWarning({ title: 'Есть выполненные подходы', action: run });
    else run();
  }
  function pick(exercise: Exercise) {
    writer.change(current => {
      if (picker === 'add') { const row = addedExercise(exercise); current.exercises.push(row); setOpen(row.slotId); }
      else {
        const row = current.exercises.find(item => item.slotId === picker);
        if (row) { replaceExercise(row, exercise); prefillSession({ ...current, exercises: [row] }, history); }
      }
    });
    setPicker(null); setUndo(null);
  }
  return <>
    <div className="active-heading"><button className="text-button back-button" onClick={onBack}><ArrowLeft size={18} />На главную</button><h1>{session.name}</h1><p className="muscles">{session.muscleGroups.join(' · ')}</p></div>
    <div className="session-metrics"><time aria-label="Продолжительность">{duration(session.startedAt, null, now)}</time><span>{stats.done} / {stats.total} {plural(stats.total, ['подход', 'подхода', 'подходов'])}</span></div>
    <progress className="workout-progress" value={stats.done} max={stats.total || 1} aria-label="Выполнение обязательных подходов" />
    {stats.optionalTotal > 0 && <p className="small muted">По желанию: {stats.optionalDone} / {stats.optionalTotal}</p>}
    {stats.actualTotal !== stats.total && <p className="small muted">Фактический план: {stats.actualTotal}. Исходная цель сохранена.</p>}
    <div className="save-status" role="status">{error ? 'Есть несохранённые изменения' : saving || dirty ? 'Сохранение…' : 'Сохранено на устройстве'}</div>
    {error && <div className="error-banner" role="alert"><p>Не удалось сохранить: {error} Изменения остаются на экране. Не закрывайте приложение до успешной записи.</p><button className="small-button outlined" onClick={() => void writer.flush()}>Повторить запись</button></div>}
    <div className="active-exercise-list">{session.exercises.map((row, index) => <ActiveExercise key={row.slotId} exercise={row} recommendation={recommendations.get(row.slotId) ?? null} open={open === row.slotId} onOpen={() => setOpen(open === row.slotId ? null : row.slotId)} first={index === 0} last={index === session.exercises.length - 1}
      onEdit={(id, field, value) => editExercise(row.slotId, exercise => { const set = exercise.sets.find(set => set.id === id); if (set) editSet(set, field, value); })}
      onSetToggle={id => editExercise(row.slotId, exercise => { const set = exercise.sets.find(set => set.id === id); if (set && (set.status === 'completed' || validSet(set, exercise.separateSides))) set.status = set.status === 'completed' ? 'pending' : 'completed'; })}
      onDeleteSet={(set, setIndex) => { setUndo({ slotId: row.slotId, exerciseId: row.exercise.id, set: structuredClone(set), index: setIndex, until: Date.now() + 8000 }); editExercise(row.slotId, exercise => { exercise.sets = exercise.sets.filter(item => item.id !== set.id); }); }}
      onAddSet={() => editExercise(row.slotId, exercise => { if (exercise.sets.length >= 100) return; const last = exercise.sets[exercise.sets.length - 1]; const set = newSet(last?.weightKg ?? null); if (exercise.separateSides) set.rightWeightKg = last?.rightWeightKg ?? null; exercise.sets.push(set); })}
      onNote={notes => editExercise(row.slotId, exercise => { exercise.notes = notes; })}
      onSplit={value => { const run = () => editExercise(row.slotId, exercise => splitSides(exercise, value)); if (row.sets.some(set => set.status === 'completed')) setWarning({ title: 'Подтвердите смену режима сторон', action: run }); else run(); }}
      onAction={kind => action(row, kind)} onNext={() => nextExercise(row.slotId)} nextLabel={stats.missing === 0 ? 'К завершению тренировки' : 'Следующее упражнение'} />)}</div>
    <button className="text-button add-exercise-button" onClick={() => setPicker('add')}><Plus size={18} />Добавить упражнение</button>
    <button className="primary-button" disabled={busy} onClick={() => setFinish(true)}>Завершить тренировку</button>
    <button className="text-button discard-button" disabled={busy} onClick={() => setCancel(true)}>Отменить тренировку</button>
    {undo && <div className="undo-toast" role="status"><span>Подход удалён</span><button className="small-button" onClick={() => {
      if (Date.now() < undo.until) editExercise(undo.slotId, exercise => { if (exercise.exercise.id === undo.exerciseId && !exercise.sets.some(set => set.id === undo.set.id)) exercise.sets.splice(Math.min(undo.index, exercise.sets.length), 0, undo.set); });
      setUndo(null);
    }}>Отменить</button></div>}
    {picker && <ExercisePicker library={library} onPick={pick} onClose={() => setPicker(null)} />}
    {(finish || cancel) && (error || actionError) && <p className="error-text" role="alert">{error || actionError}</p>}
    {warning && <Dialog title={warning.title} onClose={() => setWarning(null)}><p>Это действие может убрать записанные результаты или снять отметки выполнения. Основная программа останется прежней.</p><div className="button-row"><button className="small-button filled" onClick={() => { warning.action(); setWarning(null); }}>Продолжить</button><button className="small-button" onClick={() => setWarning(null)}>Назад</button></div></Dialog>}
    {finish && <Dialog title={stats.confirmed === 0 ? 'Отметить пропуск?' : 'Завершить тренировку?'} error={error || actionError} onClose={() => !busy && setFinish(false)}>
      {stats.confirmed === 0 ? <p>Ни один подход не выполнен. Отметить тренировку как пропущенную? Следующая тренировка останется прежней.</p> : <><dl className="summary-metrics"><div><dt>Продолжительность</dt><dd>{naturalDuration(session.startedAt, new Date(now).toISOString())}</dd></div><div><dt>Упражнений с результатами</dt><dd>{stats.exercisesDone}</dd></div><div><dt>Подтверждённых подходов</dt><dd>{stats.confirmed}</dd></div><div><dt>Пропущенных обязательных</dt><dd>{stats.missing}</dd></div></dl>{stats.missing > 0 && <p className="notice">Выполнены не все обязательные подходы. Сохранить неполную тренировку?</p>}</>}
      <button className="primary-button" disabled={busy} onClick={() => void onFinish()}>{busy ? 'Сохранение…' : stats.confirmed === 0 ? 'Отметить как пропущенную' : stats.missing ? 'Завершить неполную тренировку' : 'Сохранить тренировку'}</button>
      <button className="text-button" disabled={busy} onClick={() => setFinish(false)}>{stats.confirmed === 0 ? 'Продолжить тренировку' : 'Продолжить запись'}</button>
      {stats.confirmed === 0 && <button className="text-button danger" disabled={busy} onClick={() => void onCancel()}>Отменить тренировку без сохранения</button>}
    </Dialog>}
    {cancel && <Dialog title="Отменить тренировку?" error={error || actionError} onClose={() => !busy && setCancel(false)}><p>{stats.confirmed ? 'Подтверждённые результаты будут удалены. Это действие нельзя отменить.' : 'Незавершённая тренировка будет удалена.'} История, цикл и чередование упражнений не изменятся.</p><div className="button-row"><button className="small-button danger" disabled={busy} onClick={() => void onCancel()}>Удалить тренировку</button><button className="small-button" disabled={busy} onClick={() => setCancel(false)}>Оставить</button></div></Dialog>}
  </>;
}
