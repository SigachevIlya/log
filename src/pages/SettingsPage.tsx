import { Check, Database, Moon, Sun } from 'lucide-react';
import type { Theme } from '../domain/models';
import { db, type AppData } from '../db/database';
import { useEffect, useState } from 'react';
import { reportError } from '../lib/reportError';
import { ScheduleSettings } from '../components/ScheduleSettings';
import { go } from '../routing/router';
import { APP_VERSION } from '../lib/version';
export function SettingsPage({ theme, onTheme, busy, data, onProgram }: { theme: Theme; onTheme: (theme: Theme) => void; busy: boolean; data: AppData; onProgram: () => void }) {
  const [recommendationError, setRecommendationError] = useState('');
  const [recommendationsEnabled, setRecommendationsEnabled] = useState(data.settings.recommendationsEnabled !== false), [savingRecommendations, setSavingRecommendations] = useState(false);
  useEffect(() => { setRecommendationsEnabled(data.settings.recommendationsEnabled !== false); }, [data.settings.recommendationsEnabled]);
  return <><div className="page-heading settings-heading"><h1>Настройки.</h1></div>
    <section className="settings-section"><h2 className="eyebrow">Оформление</h2><div className="theme-options">{([{ id: 'dark', label: 'Тёмная', Icon: Moon }, { id: 'light', label: 'Светлая', Icon: Sun }] as const).map(({ id, label, Icon }) => <button key={id} disabled={busy} className={`theme-option ${theme === id ? 'selected' : ''}`} aria-pressed={theme === id} onClick={() => onTheme(id)}><Icon size={22} /><span>{label}</span>{theme === id && <Check size={17} />}</button>)}</div></section>
    <ScheduleSettings settings={data.settings} />
    <section className="settings-section"><h2 className="eyebrow">Прогрессия</h2><label className="check-label"><input type="checkbox" disabled={savingRecommendations} checked={recommendationsEnabled} onChange={async event => { const enabled = event.target.checked; setRecommendationsEnabled(enabled); setSavingRecommendations(true); setRecommendationError(''); try { await db.settings.update('user', { recommendationsEnabled: enabled }); } catch (cause) { setRecommendationsEnabled(data.settings.recommendationsEnabled !== false); reportError('Сохранение показа рекомендаций', cause); setRecommendationError('Не удалось сохранить настройку. Попробуйте ещё раз.'); } finally { setSavingRecommendations(false); } }} />Показывать рекомендации по прогрессии</label><p className="small muted">В прогрессе и при открытии упражнения во время тренировки. Значения подходов не меняются автоматически.</p>{recommendationError && <p className="error-text" role="alert">{recommendationError}</p>}</section>
    <section className="settings-section"><h2 className="eyebrow">Программа</h2><p className="small muted">{data.program.sequence?.map(id => data.templates.find(row => row.id === id)?.code ?? id).join(' → ')}</p><button className="text-button" onClick={onProgram}>Редактор программы и библиотека</button></section>
    <section className="settings-section"><button className="program-link" onClick={() => go('/settings/data')}>Данные и резервные копии</button><button className="program-link" onClick={() => go('/settings/application')}>Приложение и автономный режим</button><button className="program-link" onClick={() => go('/settings/guide')}>Руководство</button></section>
    <section className="storage-card"><Database size={24} strokeWidth={1.5} /><h2>На вашем устройстве</h2><p>Программа и настройки сохраняются в этом браузере. Аккаунт и подключение к внешней базе не нужны.</p><p className="small muted">Очистка данных сайта удалит локальный дневник. Сохраняйте JSON-копии в разделе управления данными.</p></section>
    <div className="settings-about"><span className="tiny-logo">LOG.</span><span className="small muted">Версия {APP_VERSION} · Дневник тренировок</span></div>
  </>;
}
