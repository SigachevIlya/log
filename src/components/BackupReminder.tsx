import { useState } from 'react';
import { db, type AppData } from '../db/database';
import { go } from '../routing/router';
import { reportError } from '../lib/reportError';
export function BackupReminder({ data, now }: { data: AppData; now: Date }) {
  const [error, setError] = useState(''); const settings = data.settings;
  const due = !settings.lastBackupAt || now.getTime() - Date.parse(settings.lastBackupAt) > 30 * 86_400_000;
  if (!data.history.length || data.active || settings.backupRemindersEnabled === false || !due || (settings.backupReminderDismissedUntil && Date.parse(settings.backupReminderDismissedUntil) > now.getTime())) return null;
  return <aside className="backup-reminder"><p>Сохраните резервную копию истории.</p><div><button className="text-button" onClick={() => go('/settings/data')}>Создать копию</button><button className="text-button" onClick={async () => { try { await db.settings.update('user', { backupReminderDismissedUntil: new Date(now.getTime() + 30 * 86_400_000).toISOString() }); } catch (cause) { reportError('Скрытие напоминания', cause); setError('Не удалось сохранить настройку.'); } }}>Скрыть на 30 дней</button></div>{error && <p className="error-text">{error}</p>}</aside>;
}
