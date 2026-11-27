import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { WorkoutSession } from '../domain/models';
import { SessionWriter } from '../lib/SessionWriter';
const empty = { session: undefined, dirty: false, saving: false, error: '' };
const noopSubscribe = () => () => {};
export function useSessionEditor(source?: WorkoutSession) {
  const ref = useRef<SessionWriter | null>(null);
  if (source && ref.current?.getSnapshot().session.id !== source.id) ref.current = new SessionWriter(source);
  const writer = source ? ref.current : null;
  const state = useSyncExternalStore<{ session?: WorkoutSession; dirty: boolean; saving: boolean; error: string }>(writer?.subscribe ?? noopSubscribe, writer?.getSnapshot ?? (() => empty));
  useEffect(() => { if (source) writer?.acceptExternal(source); }, [source, writer]);
  useEffect(() => {
    if (!writer) return;
    const hide = () => writer.releasePage();
    const visibility = () => { if (document.visibilityState === 'hidden') void writer.flush(); };
    window.addEventListener('pagehide', hide); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', visibility); };
  }, [writer]);
  return { ...state, writer };
}
