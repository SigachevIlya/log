import type { WorkoutSession } from '../domain/models';
import { createId } from '../domain/id';
import { tabId } from './draftStorage';

type InputSnapshot = Pick<WorkoutSession, 'id' | 'status' | 'revision' | 'exercises' | 'notes'>;
const inputSnapshot = ({ id, status, revision, exercises, notes }: WorkoutSession): InputSnapshot => structuredClone({ id, status, revision, exercises, notes });
export interface SessionJournalEntry {
  epoch: string; owner: string; tab: string; released: boolean;
  base: InputSnapshot; latest: InputSnapshot; inflight?: InputSnapshot;
}
const prefix = 'log:session-journal:v1:';
let owner: string | undefined;
const pageOwner = () => owner ??= createId();
export const sameSessionInput = (a: InputSnapshot, b: InputSnapshot) => JSON.stringify([a.exercises, a.notes]) === JSON.stringify([b.exercises, b.notes]);

/** Synchronous fallback only. IndexedDB revision checks remain authoritative. */
export function sessionJournal(session: WorkoutSession, epoch?: string) {
  if (!epoch || !('localStorage' in globalThis)) return undefined;
  const entry: SessionJournalEntry = { epoch, owner: pageOwner(), tab: tabId(), released: false, base: inputSnapshot(session), latest: inputSnapshot(session) };
  const key = `${prefix}${epoch}:${session.id}:${entry.owner}`;
  const write = () => localStorage.setItem(key, JSON.stringify(entry));
  return {
    rebase(value: WorkoutSession) { entry.base = inputSnapshot(value); entry.latest = inputSnapshot(value); delete entry.inflight; },
    change(value: WorkoutSession) { entry.latest = inputSnapshot(value); write(); },
    sending(value: WorkoutSession) { entry.inflight = inputSnapshot(value); write(); },
    committed(value: WorkoutSession, latest: WorkoutSession, dirty: boolean) {
      entry.base = inputSnapshot(value); entry.latest = inputSnapshot(latest); delete entry.inflight;
      if (dirty) write(); else localStorage.removeItem(key);
    },
    release() { entry.released = true; if (localStorage.getItem(key)) write(); },
  };
}

export function recoverableSessionEntries(epoch: string): Array<{ key: string; raw: string; entry: SessionJournalEntry }> {
  if (typeof localStorage === 'undefined') return [];
  const result = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)!;
    if (!key.startsWith(`${prefix}${epoch}:`)) continue;
    const raw = localStorage.getItem(key)!;
    const entry = JSON.parse(raw) as SessionJournalEntry;
    if (entry.epoch === epoch && entry.owner !== pageOwner() && (entry.released || entry.tab !== 'storage-unavailable' && entry.tab === tabId())) result.push({ key, raw, entry });
  }
  return result;
}
export function removeRecoveredEntry(key: string, raw: string) {
  // A live page may have added another edit while IndexedDB was committing.
  if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
}
