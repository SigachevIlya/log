import { useState } from 'react';
import type { AppData } from '../db/database';
import { updateCycle } from '../db/program';
import { draftKey, useStoredState } from '../hooks/useStoredState';
import { mayLeave, useDirtyGuard } from '../hooks/useDirtyGuard';
import { go } from '../routing/router';
import { reportError } from '../lib/reportError';
export function CycleEditor({ data }: { data: AppData }) {
  const [form, setForm, cache] = useStoredState(draftKey('cycle', 'program'), () => { const baseline = { order: [...(data.program.sequence ?? [])], next: data.program.nextTemplateId, name: data.program.name ?? '', revision: data.program.cycleRevision ?? 0 }; return { baseline, draft: structuredClone(baseline) }; }, 'local');
  const cycle = form.draft, dirty = JSON.stringify(cycle) !== JSON.stringify(form.baseline); useDirtyGuard(dirty);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const patch = (value: Partial<typeof cycle>) => setForm(current => ({ ...current, draft: { ...current.draft, ...value } }));
  return <div className="cycle-editor"><div className="page-heading editor-heading"><h1>Изменить цикл</h1></div>{cache.restored && dirty && <p className="small muted">Восстановлен черновик. Изменения ещё не применены.</p>}
    <label className="field-label" htmlFor="program-name">Название программы</label><input id="program-name" value={cycle.name} maxLength={150} onChange={event => patch({ name: event.target.value })} />
    {cycle.order.map((id, index) => <div key={id} className="variant-row"><span>{data.templates.find(row => row.id === id)?.name ?? 'Удалённый шаблон'}</span><button className="small-button" disabled={index === 0} onClick={() => { const order = [...cycle.order]; [order[index - 1], order[index]] = [order[index], order[index - 1]]; patch({ order }); }}>Выше</button><button className="small-button" disabled={index === cycle.order.length - 1} onClick={() => { const order = [...cycle.order]; [order[index + 1], order[index]] = [order[index], order[index + 1]]; patch({ order }); }}>Ниже</button></div>)}
    <label className="field-label" htmlFor="cycle-next">Следующая тренировка</label><select id="cycle-next" value={cycle.next} onChange={event => patch({ next: event.target.value })}>{cycle.order.map(id => <option key={id} value={id}>{data.templates.find(row => row.id === id)?.name ?? 'Удалённый шаблон'}</option>)}</select>
    {(error || cache.error) && <p className="error-banner" role="alert">{error || cache.error}</p>}
    <button className="primary-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await updateCycle(cycle.order, cycle.next, cycle.name, form.baseline.revision); cache.clear(); go('/program', { guard: false }); } catch (cause) { reportError('Изменение цикла', cause); setError(cause instanceof Error ? cause.message : 'Ошибка записи'); } finally { setBusy(false); } }}>Сохранить цикл</button>
    <button className="text-button" disabled={busy} onClick={() => { if (mayLeave()) { cache.clear(); go('/program', { guard: false }); } }}>Отмена</button>
  </div>;
}
