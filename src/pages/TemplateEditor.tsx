import { useState, type SetStateAction } from 'react';
import type { Exercise, ProgramState, WorkoutTemplate } from '../domain/models';
import { createId } from '../domain/id';
import { saveTemplate } from '../db/program';
import { mayLeave, useDirtyGuard } from '../hooks/useDirtyGuard';
import { ExercisePicker } from '../components/ExercisePicker';
import { setCount } from '../domain/format';
import { reportError } from '../lib/reportError';
import { draftKey, useStoredState } from '../hooks/useStoredState';
import { Dialog } from '../components/Dialog';

export function TemplateEditor({ source, program, library, onClose }: { source?: WorkoutTemplate; program: ProgramState; library: Exercise[]; onClose: () => void }) {
  const [form, setForm, cache] = useStoredState(draftKey('template', source?.id ?? 'new'), () => { const baseline: WorkoutTemplate = structuredClone(source ?? { id: createId(), name: '', code: '', description: '', muscleGroups: [], revision: 0, slots: [] }); return { baseline, draft: structuredClone(baseline), expected: program.cycleRevision ?? 0, initialVariants: { ...program.alternationNext }, variants: { ...program.alternationNext } }; }, 'local');
  const { baseline, draft, expected, initialVariants, variants } = form;
  const setDraft = (action: SetStateAction<WorkoutTemplate>) => setForm(current => ({ ...current, draft: typeof action === 'function' ? action(current.draft) : action }));
  const setVariants = (action: SetStateAction<Record<string, string>>) => setForm(current => ({ ...current, variants: typeof action === 'function' ? action(current.variants) : action }));
  const [infoOpen, setInfoOpen] = useStoredState(`log:template-info:${source?.id ?? 'new'}`, !source);
  const [opened, setOpened] = useStoredState<Record<string, boolean>>(`log:template-slots:${source?.id ?? 'new'}`, {});
  const [disableSlot, setDisableSlot] = useState<string | null>(null);
  const [primary, setPrimary] = useState('');
  const [picker, setPicker] = useState<{ slot: string; action: 'add' | 'replace' | 'variant' } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || JSON.stringify(variants) !== JSON.stringify(initialVariants); useDirtyGuard(dirty);
  const change = (edit: (value: WorkoutTemplate) => void) => setDraft(current => { const value = structuredClone(current); edit(value); return value; });
  async function save() {
    setBusy(true); setError('');
    try { await saveTemplate(draft, expected, variants); cache.clear(); onClose(); }
    catch (cause) { reportError('Сохранение шаблона', cause); setError(cause instanceof Error ? cause.message : 'Ошибка записи'); }
    finally { setBusy(false); }
  }
  const counts = [false, true].map(optional => draft.slots.filter(slot => slot.optional === optional).reduce((sum, slot) => sum + slot.sets, 0));
  return <div className="template-editor"><div className="page-heading"><h1>{source ? 'Редактор тренировки' : 'Новая тренировка'}</h1></div>
    {cache.restored && dirty && <p className="small muted">Восстановлен черновик. Изменения ещё не применены.</p>}
    {cache.error && <p className="error-banner" role="alert">{cache.error}</p>}
    <details className="template-info" open={infoOpen} onToggle={event => { if (event.currentTarget.open !== infoOpen) setInfoOpen(event.currentTarget.open); }}><summary>Основная информация</summary>
    <label className="field-label" htmlFor="template-name">Название тренировки</label><input id="template-name" value={draft.name} maxLength={150} onChange={event => change(value => { value.name = event.target.value; })} />
    <label className="field-label" htmlFor="template-code">Обозначение</label><input id="template-code" value={draft.code ?? ''} maxLength={12} onChange={event => change(value => { value.code = event.target.value; })} />
    <label className="field-label" htmlFor="template-description">Описание тренировки</label><textarea id="template-description" rows={2} maxLength={4000} value={draft.description ?? ''} onChange={event => change(value => { value.description = event.target.value; })} />
    <label className="field-label" htmlFor="template-muscles">Мышечные группы (через запятую)</label><input id="template-muscles" defaultValue={draft.muscleGroups.join(', ')} onChange={event => change(value => { value.muscleGroups = [...new Set(event.target.value.split(',').map(name => name.trim()).filter(Boolean))]; })} />
    </details>
    <p className="template-totals small muted">Обязательно: {setCount(counts[0])}. По желанию: {setCount(counts[1])}.</p>
    {draft.slots.map((slot, index) => <details className="template-slot" key={slot.id} open={!!opened[slot.id]} onToggle={event => { if (event.currentTarget.open !== !!opened[slot.id]) setOpened(current => ({ ...current, [slot.id]: event.currentTarget.open })); }}><summary>{index + 1}. {library.find(row => row.id === (slot.alternating === false ? slot.primaryExerciseId ?? slot.exerciseIds[0] : slot.exerciseIds[0]))?.name ?? 'Упражнение'} · {slot.sets} × {slot.reps.join('–')}{slot.optional && ' · По желанию'}{slot.alternating !== false && slot.exerciseIds.length > 1 && ' · Чередование'}</summary>
      <div className="button-row"><button className="small-button outlined" onClick={() => setPicker({ slot: slot.id, action: 'replace' })}>Заменить</button><button className="small-button" disabled={index === 0} onClick={() => change(value => { [value.slots[index - 1], value.slots[index]] = [value.slots[index], value.slots[index - 1]]; })}>Выше</button><button className="small-button" disabled={index === draft.slots.length - 1} onClick={() => change(value => { [value.slots[index + 1], value.slots[index]] = [value.slots[index], value.slots[index + 1]]; })}>Ниже</button><button className="small-button danger" onClick={() => change(value => { value.slots.splice(index, 1); })}>Удалить позицию</button></div>
      <div className="slot-numbers">{(['Подходы', 'Повторы от', 'Повторы до'] as const).map((label, field) => <label key={label}>{label}<input type="number" inputMode="numeric" min="1" max={field === 0 ? 100 : 1000} value={field === 0 ? slot.sets || '' : slot.reps[field - 1] || ''} onChange={event => change(value => { if (field === 0) value.slots[index].sets = Number(event.target.value); else value.slots[index].reps[field - 1] = Number(event.target.value); })} /></label>)}</div>
      <label className="check-label"><input type="checkbox" checked={slot.optional} onChange={event => change(value => { value.slots[index].optional = event.target.checked; })} />Необязательное упражнение</label>
      <label className="field-label" htmlFor={`override-${slot.id}`}>Пояснение только для этой тренировки</label><textarea id={`override-${slot.id}`} rows={2} value={slot.descriptionOverride ?? ''} placeholder="По умолчанию — из библиотеки" maxLength={4000} onChange={event => change(value => { value.slots[index].descriptionOverride = event.target.value || undefined; })} />
      <label className="check-label"><input type="checkbox" checked={slot.alternating === true || (slot.alternating !== false && slot.exerciseIds.length > 1)} onChange={event => { if (!event.target.checked && slot.exerciseIds.length > 1) { setDisableSlot(slot.id); setPrimary(slot.primaryExerciseId ?? slot.exerciseIds[0]); } else change(value => { value.slots[index].alternating = event.target.checked; }); }} />Чередовать варианты</label>
      {(slot.alternating === true || (slot.alternating !== false && slot.exerciseIds.length > 1)) && <div className="alternation-settings"><p className="small muted">Варианты меняются после фактического выполнения упражнения, а не по календарным неделям.</p>
      <div className="variant-list">{slot.exerciseIds.map((id, variantIndex) => <div className="variant-row" key={id}><span>{library.find(row => row.id === id)?.name ?? id}</span><button className="small-button" aria-label="Вариант выше" disabled={variantIndex === 0} onClick={() => change(value => { const ids = value.slots[index].exerciseIds; [ids[variantIndex - 1], ids[variantIndex]] = [ids[variantIndex], ids[variantIndex - 1]]; })}>↑</button><button className="small-button" aria-label="Вариант ниже" disabled={variantIndex === slot.exerciseIds.length - 1} onClick={() => change(value => { const ids = value.slots[index].exerciseIds; [ids[variantIndex + 1], ids[variantIndex]] = [ids[variantIndex], ids[variantIndex + 1]]; })}>↓</button><button className="small-button" aria-label="Удалить вариант" disabled={slot.exerciseIds.length === 1} onClick={() => change(value => { const target = value.slots[index]; target.exerciseIds = target.exerciseIds.filter(item => item !== id); if (target.primaryExerciseId === id) target.primaryExerciseId = target.exerciseIds[0]; })}>×</button></div>)}</div>
      <button className="text-button" onClick={() => setPicker({ slot: slot.id, action: 'variant' })}>Добавить вариант чередования</button>
      {slot.exerciseIds.length > 1 && <><label className="field-label" htmlFor={`next-${slot.id}`}>Следующий вариант</label><select id={`next-${slot.id}`} value={slot.exerciseIds.includes(variants[slot.id]) ? variants[slot.id] : slot.exerciseIds[0]} onChange={event => setVariants(current => ({ ...current, [slot.id]: event.target.value }))}>{slot.exerciseIds.map(id => <option key={id} value={id}>{library.find(row => row.id === id)?.name ?? id}</option>)}</select></>}
      </div>}
    </details>)}
    <button className="text-button" onClick={() => setPicker({ slot: '', action: 'add' })}>Добавить упражнение в шаблон</button>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="editor-action-space" /><div className="editor-action-bar"><button className="small-button outlined" disabled={busy} onClick={() => { if (mayLeave()) { cache.clear(); onClose(); } }}>Отмена</button><button className="small-button filled" aria-label="Сохранить шаблон" disabled={busy || (!!source && !dirty)} onClick={() => void save()}>Сохранить</button></div>
    {disableSlot && <Dialog title="Отключить чередование?" onClose={() => setDisableSlot(null)}><p>Варианты и выбранная очередь сохранятся. Укажите упражнение, которое останется основным.</p><label className="field-label" htmlFor="primary-variant">Основное упражнение</label><select id="primary-variant" value={primary} onChange={event => setPrimary(event.target.value)}>{draft.slots.find(row => row.id === disableSlot)?.exerciseIds.map(id => <option key={id} value={id}>{library.find(row => row.id === id)?.name ?? id}</option>)}</select><button className="primary-button" onClick={() => { change(value => { const slot = value.slots.find(row => row.id === disableSlot)!; slot.alternating = false; slot.primaryExerciseId = primary; }); setDisableSlot(null); }}>Отключить чередование</button></Dialog>}
    {picker && <ExercisePicker library={library} onClose={() => setPicker(null)} onPick={(exercise: Exercise) => { change(value => { if (picker.action === 'add') value.slots.push({ id: createId(), exerciseIds: [exercise.id], sets: 3, reps: [8, 12], optional: false }); else { const slot = value.slots.find(row => row.id === picker.slot)!; if (picker.action === 'replace') { slot.exerciseIds = [exercise.id]; slot.primaryExerciseId = exercise.id; slot.alternating = false; } else if (!slot.exerciseIds.includes(exercise.id)) { slot.exerciseIds.push(exercise.id); slot.alternating = true; } } }); setPicker(null); }} />}
  </div>;
}
