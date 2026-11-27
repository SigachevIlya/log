import { ArrowLeft, BookOpen, ChevronRight, Play } from 'lucide-react';
import type { AppData } from '../db/database';
import type { TemplateId } from '../domain/models';
import { nextTrainingDate, sameDay } from '../domain/schedule';
import { resolveExercise, variantIndex } from '../domain/session';
import { upcomingDate } from '../domain/calendar';
import { ExerciseList } from '../components/ExerciseList';
import { Schedule } from '../components/Schedule';
import { exerciseCount, setCount } from '../domain/format';

interface Props {
  data: AppData; now: Date; selected: TemplateId; programView: boolean; busy: boolean;
  onSelect: (id: TemplateId) => void; onProgram: (value: boolean) => void;
  onStart: () => void; onSaveDescription: (id: string, value: string, expected: number) => Promise<void>;
}
export function WorkoutPage({ data, now, selected, programView, busy, onSelect, onProgram, onStart, onSaveDescription }: Props) {
  const templates = data.templates.filter(item => !item.archived);
  const template = templates.find(item => item.id === selected) ?? templates.find(item => item.id === data.program.nextTemplateId) ?? templates[0];
  if (!template) return <p role="alert">Нет активных шаблонов. Откройте программу в настройках.</p>;
  const requiredSets = template.slots.filter(slot => !slot.optional).reduce((sum, slot) => sum + slot.sets, 0);
  const optionalSets = template.slots.filter(slot => slot.optional).reduce((sum, slot) => sum + slot.sets, 0);
  const nextDate = upcomingDate(now, data.settings.trainingDays, data.exceptions, data.history);
  const nextLabel = nextDate ? sameDay(now, nextDate) ? 'Сегодня' : nextDate.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }) : 'День не выбран';
  const rows = template.slots.map(slot => {
    const exercise = { ...resolveExercise(slot, variantIndex(slot, data.program), data.exercises), ...(slot.descriptionOverride !== undefined ? { description: slot.descriptionOverride } : {}) };
    const alternate = slot.alternating !== false && slot.exerciseIds.length > 1 ? slot.exerciseIds.find(id => id !== exercise.id) : undefined;
    return { slot, exercise, alternateName: data.exercises.find(item => item.id === alternate)?.name };
  });
  return <>
    {programView ? <div className="page-heading"><button className="text-button back-button" onClick={() => onProgram(false)}><ArrowLeft size={18} />К тренировке</button><h1>Программа<span className="punctuation">.</span></h1></div>
      : <Schedule now={now} settings={data.settings} exceptions={data.exceptions} history={data.history} />}
    <section className="workout-section">
      <div className="section-heading"><span className="eyebrow">{programView ? 'Ваша программа' : data.active ? 'Есть незавершённая тренировка' : selected !== data.program.nextTemplateId ? 'Выбрана вручную' : 'Следующая тренировка'}</span>{!programView && <span className="small muted">{nextLabel}</span>}</div>
      {templates.length <= 3 ? <div className="template-tabs" role="group" aria-label="Выбрать тренировку">{templates.map(item => <button key={item.id} className={template.id === item.id ? 'template-tab selected' : 'template-tab'} aria-pressed={template.id === item.id} onClick={() => onSelect(item.id)}><span>{item.code ?? item.id}</span><span className="tab-subtitle">{item.id === data.program.nextTemplateId ? 'Следующая' : 'Тренировка'}</span></button>)}</div> : <select className="template-select" aria-label="Выбрать тренировку" value={template.id} onChange={event => onSelect(event.target.value)}>{templates.map(item => <option key={item.id} value={item.id}>{item.code ?? item.id} · {item.name}</option>)}</select>}
      <div className="workout-intro"><div><h2>{template.name}</h2><p className="muscles">{template.muscleGroups.join(' · ')}</p></div><span className={`workout-letter ${(template.code ?? template.id).length > 2 ? 'long-code' : ''}`} aria-hidden="true">{template.code ?? template.id}</span></div>
      <div className="workout-counts"><span>{exerciseCount(template.slots.length)}</span><span>{setCount(requiredSets)}</span>{optionalSets > 0 && <span className="optional-count">+ {optionalSets} по желанию</span>}</div>
      <button className="primary-button" onClick={onStart} disabled={busy}><Play size={18} fill="currentColor" />{busy ? 'Сохранение…' : data.active ? `Продолжить тренировку ${data.active.templateCode ?? data.active.templateId}` : 'Начать тренировку'}</button>
      <div className="exercise-heading"><span className="eyebrow">Упражнения</span><span className="small muted">Подходы × повторения</span></div>
      <ExerciseList rows={rows} onSave={onSaveDescription} />
      <p className="list-footnote">Все подходы — рабочие. Нажмите на упражнение, чтобы открыть пояснение.</p>
      {!programView && <button className="program-link" onClick={() => onProgram(true)}><BookOpen size={18} /><span>Программа тренировок</span><ChevronRight size={18} /></button>}
    </section>
  </>;
}
