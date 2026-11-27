import { useEffect, useState } from 'react';
import type { AppData } from '../db/database';
import type { WorkoutTemplate } from '../domain/models';
import { archiveTemplate, duplicateTemplate } from '../db/program';
import { exerciseCount } from '../domain/format';
import { reportError } from '../lib/reportError';
import { go, objectPath, routeId, useRoute } from '../routing/router';
import { useStoredState } from '../hooks/useStoredState';
import { Dialog } from '../components/Dialog';
import { RowMenu } from '../components/RowMenu';
import { LibraryPage } from './LibraryPage';
import { TemplateEditor } from './TemplateEditor';
import { CycleEditor } from './CycleEditor';
export function ProgramPage({ data, onBack, onPreview }: { data: AppData; onBack: () => void; onPreview: (id: string) => void }) {
  const route = useRoute(), id = routeId(route, '/program/template');
  const source = data.templates.find(row => row.id === id);
  const [archive, setArchive] = useState<WorkoutTemplate | null>(null), [replacement, setReplacement] = useState(''), [archiveRevision, setArchiveRevision] = useState(0);
  const [archivesOpen, setArchivesOpen] = useStoredState('log:program-archives', false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (route.startsWith('/program/template/') && (!id || (id !== 'new' && !source))) go('/program', { replace: true, guard: false }); }, [id, source, route]);
  async function act(operation: () => Promise<unknown>) { setBusy(true); setError(''); try { await operation(); } catch (cause) { reportError('Изменение программы', cause); setError(cause instanceof Error ? cause.message : 'Ошибка записи'); } finally { setBusy(false); } }
  if (route.startsWith('/program/library')) return <LibraryPage exercises={data.exercises} onBack={() => go('/program')} />;
  if (route === '/program/cycle') return <CycleEditor data={data} />;
  if (id && (id === 'new' || source)) return <TemplateEditor key={id} source={source} program={data.program} library={data.exercises} onClose={() => go('/program', { guard: false })} />;
  const card = (template: WorkoutTemplate) => {
    const mandatory = template.slots.filter(slot => !slot.optional).reduce((sum, slot) => sum + slot.sets, 0), optional = template.slots.filter(slot => slot.optional).reduce((sum, slot) => sum + slot.sets, 0), code = template.code ?? template.id;
    const edit = () => go(objectPath('/program/template', template.id));
    return <section className="program-card compact-card" key={template.id} data-template-id={template.id}>
      <button className="compact-card-main" aria-label={`Редактировать ${code}`} onClick={edit}><span className="template-code">{code}</span><span className="compact-card-text"><strong>{template.name === `Тренировка ${code}` ? 'Тренировка' : template.name}</strong><span className="small muted">{template.muscleGroups.join(' · ') || 'Группы не указаны'}</span><span className="small muted">{exerciseCount(template.slots.length)} · Подходы: {mandatory} обяз. / {optional} по желанию</span>{!template.archived && template.id === data.program.nextTemplateId && <span className="next-label">Следующая</span>}</span></button>
      <RowMenu label={`Действия с тренировкой ${code}`}>
        {!template.archived && <button onClick={() => onPreview(template.id)}>Просмотреть {code}</button>}<button onClick={edit}>Редактировать</button><button disabled={!!data.active} onClick={() => void act(() => duplicateTemplate(template.id, data.program.cycleRevision ?? 0))}>Дублировать</button><button disabled={!!data.active} onClick={() => { setArchive(template); setArchiveRevision(data.program.cycleRevision ?? 0); setReplacement(''); setError(''); }}>{template.archived ? 'Восстановить' : 'Архивировать'}</button>
      </RowMenu>
    </section>;
  };
  const active = data.templates.filter(row => !row.archived), archived = data.templates.filter(row => row.archived);
  return <><div className="page-heading program-heading"><button className="text-button" onClick={onBack}>К тренировке</button><h1>{data.program.name ?? 'Программа'}</h1></div>
    <div className="program-topline"><p className="program-sequence">{data.program.sequence?.map(value => data.templates.find(row => row.id === value)?.code ?? value).join(' → ')}</p><button className="text-button" onClick={() => go('/program/cycle')} disabled={!!data.active}>Изменить цикл</button></div>
    {data.active && <p className="small muted">Идёт тренировка: изменение цикла и чередований доступно после её завершения или отмены.</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="program-list">{active.map(card)}</div>
    <button className="text-button" disabled={!!data.active} onClick={() => go('/program/template/new')}>Добавить тренировку</button>
    <button className="program-link" onClick={() => go('/program/library')}><span>Библиотека упражнений</span></button>
    {archived.length > 0 && <details className="archive-list" open={archivesOpen} onToggle={event => { if (event.currentTarget.open !== archivesOpen) setArchivesOpen(event.currentTarget.open); }}><summary>Архивные тренировки ({archived.length})</summary>{archived.map(card)}</details>}
    {archive && <Dialog title={archive.archived ? 'Восстановить тренировку?' : 'Архивировать тренировку?'} error={error} onClose={() => !busy && setArchive(null)}><p>Существующие снимки и история сохранятся.</p>{!archive.archived && archive.id === data.program.nextTemplateId && <><label className="field-label" htmlFor="archive-next">Новая следующая тренировка</label><select id="archive-next" value={replacement} onChange={event => setReplacement(event.target.value)}><option value="">Выберите тренировку</option>{data.templates.filter(row => !row.archived && row.id !== archive.id).map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></>}<button className="primary-button" disabled={busy} onClick={() => void act(async () => { await archiveTemplate(archive.id, !archive.archived, archiveRevision, replacement || undefined); setArchive(null); })}>Подтвердить</button></Dialog>}
  </>;
}
