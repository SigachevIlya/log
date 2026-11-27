import { useState } from 'react';
import type { BodyWeightEntry } from '../../domain/models';
import { weightSummary } from '../../domain/analytics/bodyWeight';
import { fullDate, type DateRange } from '../../domain/analytics/periods';
import { parseWeight } from '../../domain/workout';
import { saveBodyWeight, deleteBodyWeight } from '../../db/bodyWeight';
import { useDirtyGuard, mayLeave } from '../../hooks/useDirtyGuard';
import { draftKey, useStoredState } from '../../hooks/useStoredState';
import { go, objectPath } from '../../routing/router';
import { reportError } from '../../lib/reportError';
import { Dialog } from '../../components/Dialog';
import { RowMenu } from '../../components/RowMenu';
import { TimeChart, numberText } from '../../components/analytics/TimeChart';
const localInputTime = (date: string) => { const value = new Date(date); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`; };
export function BodyWeightForm({ source }: { source?: BodyWeightEntry }) {
  const [form, setForm, cache] = useStoredState(draftKey('body-weight', source?.id ?? 'new'), () => { const baseline = { time: localInputTime(source?.measuredAt ?? new Date().toISOString()), weight: source ? String(source.weightKg).replace('.', ',') : '' }; return { baseline, draft: { ...baseline }, expected: source?.revision ?? 0 }; }, 'local');
  const dirty = JSON.stringify(form.baseline) !== JSON.stringify(form.draft); useDirtyGuard(dirty);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <div className="body-weight-form"><div className="page-heading progress-heading"><h1>{source ? 'Изменить измерение' : 'Новое измерение'}</h1></div>
    {cache.restored && dirty && <p className="small muted">Восстановлен черновик. Изменения ещё не применены.</p>}
    <label className="field-label" htmlFor="body-weight-date">Дата и время измерения</label><input id="body-weight-date" type="datetime-local" step="1" value={form.draft.time} onChange={event => setForm(current => ({ ...current, draft: { ...current.draft, time: event.target.value } }))} />
    <label className="field-label" htmlFor="body-weight-value">Собственный вес, кг</label><input id="body-weight-value" inputMode="decimal" autoComplete="off" value={form.draft.weight} onChange={event => setForm(current => ({ ...current, draft: { ...current.draft, weight: event.target.value } }))} />
    {(error || cache.error) && <p className="error-banner" role="alert">{error || cache.error}</p>}
    <div className="button-row"><button className="small-button filled" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const weightKg = parseWeight(form.draft.weight); if (weightKg === null || !form.draft.time || !Number.isFinite(Date.parse(form.draft.time))) throw new Error('Проверьте вес, дату и время.'); await saveBodyWeight({ id: source?.id, measuredAt: form.draft.time, weightKg }, source ? form.expected : null); cache.clear(); go('/progress/body', { guard: false }); } catch (cause) { reportError('Сохранение собственного веса', cause); setError(cause instanceof Error ? cause.message : 'Ошибка записи'); } finally { setBusy(false); } }}>Сохранить измерение</button><button className="small-button outlined" disabled={busy} onClick={() => { if (mayLeave()) { cache.clear(); go('/progress/body', { guard: false }); } }}>Отмена</button></div>
  </div>;
}
export function BodyWeightPage({ entries, range }: { entries: BodyWeightEntry[]; range: DateRange }) {
  const summary = weightSummary(entries, range);
  const [removing, setRemoving] = useState<BodyWeightEntry | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <>
    <button className="primary-button" onClick={() => go('/progress/body/new')}>Добавить измерение</button>
    <div className="analytics-stats"><div><b>{summary.latest ? `${numberText(summary.latest.weightKg)} кг` : '—'}</b><span>{summary.latest ? fullDate(summary.latest.measuredAt) : 'пока нет измерений'}</span></div><div><b>{summary.delta === null ? '—' : `${summary.delta > 0 ? '+' : ''}${numberText(summary.delta)} кг`}</b><span>изменение за период</span></div><div><b>{summary.weeklyRate === null ? '—' : `${summary.weeklyRate > 0 ? '+' : ''}${numberText(summary.weeklyRate)} кг`}</b><span>в неделю, интервал ≥ 7 дней</span></div></div>
    <TimeChart points={summary.days.map(row => ({ id: row.date, timestamp: row.timestamp, value: row.value, average: row.average, label: fullDate(row.timestamp) }))} unit="кг" label="Измерения и среднее за 7 дней" average />
    <p className="small muted">Сплошная линия — среднее фактических измерений дня, пунктир — среднее дневных значений за последние семь календарных дней. Пропущенные дни не заполняются. Изменение и скорость рассчитаны по первому и последнему измерениям периода; состав тела по ним не определяется.</p>
    <section className="analytics-section"><h2>Фактические измерения</h2>{summary.selected.length ? [...summary.selected].reverse().map(entry => <div className="measurement-row" key={entry.id} data-measurement-id={entry.id}><button className="measurement-main" onClick={() => go(objectPath('/progress/body', entry.id))}><strong>{numberText(entry.weightKg)} кг</strong><span className="small muted">{new Date(entry.measuredAt).toLocaleString('ru-RU')}</span></button><RowMenu label={`Действия с измерением ${entry.id}`}><button onClick={() => go(objectPath('/progress/body', entry.id))}>Редактировать</button><button onClick={() => { setRemoving(entry); setError(''); }}>Удалить</button></RowMenu></div>) : <p className="analytics-empty">За выбранный период измерений нет.</p>}</section>
    {removing && <Dialog title="Удалить измерение?" error={error} onClose={() => !busy && setRemoving(null)}><p>Графики и расчёты общей нагрузки подтягиваний будут пересчитаны.</p><button className="primary-button" disabled={busy} onClick={async () => { setBusy(true); try { await deleteBodyWeight(removing.id, removing.revision ?? 0); setRemoving(null); } catch (cause) { reportError('Удаление измерения', cause); setError(cause instanceof Error ? cause.message : 'Ошибка записи'); } finally { setBusy(false); } }}>Удалить измерение</button></Dialog>}
  </>;
}
