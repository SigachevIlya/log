import { useState } from 'react';
import type { Exercise, LoadCalculation, WeightMode } from '../domain/models';
import { muscles, withExerciseMetadata } from '../data/muscles';
import { createId } from '../domain/id';
import { weightLabels } from '../domain/workout';
import { saveExercise } from '../db/program';
import { mayLeave, useDirtyGuard } from '../hooks/useDirtyGuard';
import { reportError } from '../lib/reportError';
import { Dialog } from './Dialog';
import { draftKey, useStoredState } from '../hooks/useStoredState';
export function ExerciseForm({ source, initialName = '', onSaved, onCancel }: { source?: Exercise; initialName?: string; onSaved: (exercise: Exercise) => void; onCancel: () => void }) {
  const [form, setForm, cache] = useStoredState(draftKey('exercise', source?.id ?? 'new'), () => { const baseline = withExerciseMetadata(source ?? { id: createId(), name: initialName, description: '', unilateral: false, weightMode: 'total' }); return { baseline, draft: structuredClone(baseline) }; }, 'local');
  const { baseline, draft } = form;
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState(false); const [variant, setVariant] = useState(true);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline); useDirtyGuard(dirty);
  const patch = (value: Partial<Exercise>) => setForm(current => ({ ...current, draft: { ...current.draft, ...value } }));
  async function save(confirmed = false) {
    if (source && !confirmed && ['description', 'weightMode', 'unilateral', 'repetitionRule', 'customWeightNote', 'bodyWeight', 'loadCalculation', 'bodyWeightModel'].some(key => draft[key as keyof Exercise] !== baseline[key as keyof Exercise])) { setWarning(true); return; }
    setBusy(true); setError('');
    try { const saved = await saveExercise(draft, source ? baseline.revision ?? 0 : null, confirmed && variant); cache.clear(); onSaved(saved); }
    catch (cause) { reportError('Сохранение библиотеки', cause); setError(cause instanceof Error ? cause.message : 'Не удалось сохранить упражнение.'); }
    finally { setBusy(false); }
  }
  return <div className="exercise-form">
    {cache.restored && dirty && <p className="small muted">Восстановлен черновик. Изменения ещё не применены.</p>}
    {cache.error && <p className="error-banner" role="alert">{cache.error}</p>}
    <label className="field-label" htmlFor="exercise-name">Название</label><input id="exercise-name" value={draft.name} maxLength={200} onChange={event => patch({ name: event.target.value })} />
    <label className="field-label" htmlFor="primary-muscle">Основная мышечная группа</label><select id="primary-muscle" value={draft.primaryMuscle} onChange={event => patch({ primaryMuscle: event.target.value, secondaryMuscles: draft.secondaryMuscles?.filter(value => value !== event.target.value) })}>{muscles.map(name => <option key={name}>{name}</option>)}</select>
    <details className="secondary-muscles"><summary>Второстепенные мышцы ({draft.secondaryMuscles?.length ?? 0})</summary><p className="small muted">Их участие не считается автоматически полным прямым подходом.</p>{muscles.filter(name => name !== draft.primaryMuscle).map(name => <label className="check-label" key={name}><input type="checkbox" checked={draft.secondaryMuscles?.includes(name) ?? false} onChange={event => patch({ secondaryMuscles: event.target.checked ? [...(draft.secondaryMuscles ?? []), name] : draft.secondaryMuscles?.filter(value => value !== name) })} />{name}</label>)}</details>
    <label className="field-label" htmlFor="weight-mode">Способ учёта веса</label><select id="weight-mode" value={draft.weightMode} onChange={event => patch({ weightMode: event.target.value as WeightMode, bodyWeight: ['additional', 'bodyweight'].includes(event.target.value), loadCalculation: 'unknown', bodyWeightModel: 'unknown' })}>{Object.entries(weightLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
    <label className="field-label" htmlFor="custom-weight-note">Пояснение учёта веса</label><textarea id="custom-weight-note" rows={2} maxLength={1000} value={draft.customWeightNote} onChange={event => patch({ customWeightNote: event.target.value })} />
    <label className="check-label"><input type="checkbox" checked={draft.unilateral} onChange={event => patch({ unilateral: event.target.checked, repetitionRule: event.target.checked ? 'Повторения на одну сторону; подход включает обе стороны' : 'Повторения за подход', loadCalculation: 'unknown', bodyWeightModel: 'unknown' })} />Одностороннее упражнение</label>
    <label className="check-label"><input type="checkbox" checked={draft.bodyWeight} disabled={['additional', 'bodyweight'].includes(draft.weightMode)} onChange={event => patch({ bodyWeight: event.target.checked })} />Используется собственный вес</label>
    <label className="field-label" htmlFor="repetition-rule">Правила учёта повторений</label><input id="repetition-rule" maxLength={300} value={draft.repetitionRule} onChange={event => patch({ repetitionRule: event.target.value })} />
    <label className="field-label" htmlFor="load-calculation">Расчёт тоннажа</label><select id="load-calculation" value={draft.loadCalculation ?? 'unknown'} onChange={event => patch({ loadCalculation: event.target.value as LoadCalculation })}><option value="unknown">Не определён — тоннаж не рассчитывается</option>{!draft.unilateral ? <><option value="total">Общий вес × повторения</option>{draft.weightMode === 'per-dumbbell' && <option value="paired">Две гантели одновременно: вес одной × 2</option>}</> : <><option value="per-side-one">Один снаряд: сумма обеих сторон</option><option value="per-side-pair">Два снаряда на каждую сторону: сумма × 2</option></>}</select>
    <p className="small muted">Укажите фактически перемещаемые снаряды. Смена правил относится к будущим снимкам, история не пересчитывается по текущей библиотеке.</p>
    {draft.bodyWeight && <><label className="field-label" htmlFor="bodyweight-model">Общая нагрузка с собственным весом</label><select id="bodyweight-model" value={draft.bodyWeightModel ?? 'unknown'} onChange={event => patch({ bodyWeightModel: event.target.value as 'unknown' | 'pull-up' })}><option value="unknown">Не рассчитывать</option>{!draft.unilateral && ['additional', 'bodyweight'].includes(draft.weightMode) && <option value="pull-up">Подтягивания: масса тела + отягощение</option>}</select><p className="small muted">Только для подтягиваний и измерения не старше семи дней, сделанного до тренировки. Для других движений полная масса тела не предполагается.</p></>}
    <label className="field-label" htmlFor="new-description">Пояснение по технике</label><textarea id="new-description" rows={3} maxLength={4000} value={draft.description} onChange={event => patch({ description: event.target.value })} />
    {error && <p className="error-banner" role="alert">{error}</p>}
    <button className="primary-button" disabled={busy} onClick={() => void save()}>{source ? 'Сохранить упражнение' : 'Создать и добавить'}</button><button className="text-button" disabled={busy} onClick={() => { if (mayLeave()) { cache.clear(); onCancel(); } }}>Отмена</button>
    {warning && <Dialog title="Изменение техники или нагрузки" error={error} onClose={() => !busy && setWarning(false)}><p>Новые и старые результаты могут стать несопоставимыми. Рекомендуется отдельный вариант. Снимки истории останутся прежними.</p><label className="check-label"><input type="checkbox" checked={variant} onChange={event => setVariant(event.target.checked)} />Создать отдельный вариант упражнения</label><button className="primary-button" disabled={busy} onClick={() => void save(true)}>{variant ? 'Сохранить вариант' : 'Изменить существующее'}</button></Dialog>}
  </div>;
}
