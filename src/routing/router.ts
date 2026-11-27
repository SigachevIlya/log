import { useSyncExternalStore } from 'react';
import { mayLeave } from '../hooks/useDirtyGuard';
type Listener = () => void;
const listeners = new Set<Listener>();
export function canonicalPath(hash: string): string {
  const value = hash.replace(/^#/, '').split('?')[0];
  const path = value.startsWith('/') ? value.replace(/\/+$/, '') || '/workout' : '/workout';
  return path;
}
let current = canonicalPath(location.hash);
export const currentRoute = () => current;
let index = Number(history.state?.logIndex ?? 0);
let restoring = false;
history.scrollRestoration = 'manual';
history.replaceState({ ...history.state, logIndex: index }, '', `#${current}`);
function publish() { listeners.forEach(listener => listener()); }
function browserNavigation() {
  const next = canonicalPath(location.hash), nextIndex = Number(history.state?.logIndex ?? index + 1);
  if (restoring) { restoring = false; return; }
  if (next === current) return;
  if (!mayLeave()) {
    const delta = index - nextIndex;
    if (delta) { restoring = true; history.go(delta); }
    else history.replaceState({ ...history.state, logIndex: index }, '', `#${current}`);
    return;
  }
  current = next; index = nextIndex; publish();
}
window.addEventListener('popstate', browserNavigation);
window.addEventListener('hashchange', browserNavigation);
export function go(path: string, options: { replace?: boolean; guard?: boolean; from?: string } = {}): boolean {
  if (options.from !== undefined && options.from !== current) return false;
  if (options.guard !== false && !mayLeave()) return false;
  const next = canonicalPath(path);
  if (next === current) return true;
  index += options.replace ? 0 : 1;
  history[options.replace ? 'replaceState' : 'pushState']({ logIndex: index }, '', `#${next}`);
  current = next; publish(); return true;
}
export function useRoute() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current);
}
export function objectPath(parent: string, id: string) { return `${parent}/${encodeURIComponent(id)}`; }
export function routeId(path: string, prefix: string): string | null {
  const remainder = path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1).split('/')[0] : '';
  try { return remainder ? decodeURIComponent(remainder) : null; } catch { return null; }
}
