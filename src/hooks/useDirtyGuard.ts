import { useEffect } from 'react';
import { registerDirtyEditor } from '../lib/activity';
export function mayLeave(): boolean { return window.dispatchEvent(new Event('log:before-navigate', { cancelable: true })); }
export function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unregister = registerDirtyEditor();
    const warn = (event: Event) => { if (!window.confirm('Есть несохранённые изменения. Покинуть редактор без сохранения?')) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('log:before-navigate', warn); window.addEventListener('beforeunload', unload);
    return () => { unregister(); window.removeEventListener('log:before-navigate', warn); window.removeEventListener('beforeunload', unload); };
  }, [dirty]);
}
