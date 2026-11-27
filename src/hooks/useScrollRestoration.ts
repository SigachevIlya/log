import { useLayoutEffect } from 'react';
import { readStored } from './useStoredState';
export function useScrollRestoration(path: string, ready: boolean) {
  useLayoutEffect(() => {
    if (!ready) return;
    const key = `log:scroll:${path}`;
    let position = 0;
    try { position = readStored(sessionStorage, key, 0); } catch { /* Storage can be unavailable. */ }
    // Restore during layout, before the user can start scrolling the rendered page.
    window.scrollTo(0, position);
    const save = () => { try { sessionStorage.setItem(key, JSON.stringify(window.scrollY)); } catch { /* UI state is optional. */ } };
    window.addEventListener('scroll', save, { passive: true }); window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('scroll', save); window.removeEventListener('pagehide', save); };
  }, [path, ready]);
}
