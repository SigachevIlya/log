import type { WorkoutSession } from '../domain/models';
import { db, saveSession } from '../db/database';
import { sessionJournal } from './sessionJournal';
import { reportError } from './reportError';

export class SessionWriter {
  private listeners = new Set<() => void>();
  private generation = 0;
  private persistedRevision: number;
  private running: Promise<boolean> | null = null;
  private journal;
  private journalError = '';
  private snapshot: { session: WorkoutSession; dirty: boolean; saving: boolean; error: string };
  constructor(session: WorkoutSession, private save = saveSession) {
    this.journal = sessionJournal(session, db.epoch);
    this.persistedRevision = session.revision;
    this.snapshot = { session: structuredClone(session), dirty: false, saving: false, error: '' };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(patch: Partial<typeof this.snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  acceptExternal(session: WorkoutSession) {
    if (!this.snapshot.dirty && session.revision > this.persistedRevision) {
      this.journal?.rebase(session);
      this.persistedRevision = session.revision; this.publish({ session: structuredClone(session) });
    }
  }
  change(edit: (session: WorkoutSession) => void) {
    const session = structuredClone(this.snapshot.session);
    edit(session); this.generation++;
    const retry = !this.snapshot.error;
    try { this.journal?.change(session); this.journalError = ''; } catch (error) { reportError('Журнал несохранённого ввода', error); this.journalError = 'Не удалось записать временный журнал. Не закрывайте вкладку до завершения сохранения.'; }
    this.publish({ session, dirty: true, error: this.journalError || this.snapshot.error });
    if (retry) void this.flush();
  }
  flush(): Promise<boolean> {
    if (this.running) return this.running;
    this.running = Promise.resolve().then(async () => {
      this.publish({ error: this.journalError, saving: true });
      try {
        while (this.snapshot.dirty) {
          const generation = this.generation;
          try { this.journal?.sending(this.snapshot.session); } catch (error) { reportError('Журнал записи тренировки', error); }
          const saved = await this.save(this.snapshot.session, this.persistedRevision);
          this.persistedRevision = saved.revision;
          if (generation === this.generation) this.journalError = '';
          this.publish({ session: { ...this.snapshot.session, revision: saved.revision }, dirty: generation !== this.generation, error: this.journalError });
          try { this.journal?.committed(saved, this.snapshot.session, this.snapshot.dirty); } catch (error) { reportError('Очистка журнала тренировки', error); }
        }
        return true;
      } catch (error) {
        reportError('Автосохранение тренировки', error);
        this.publish({ error: error instanceof Error ? error.message : 'Не удалось сохранить тренировку.' });
        return false;
      } finally { this.publish({ saving: false }); }
    }).finally(() => { this.running = null; });
    return this.running;
  }
  releasePage() {
    try { this.journal?.release(); } catch (error) { reportError('Закрытие журнала тренировки', error); }
    if (this.snapshot.dirty) void this.flush();
  }
}
