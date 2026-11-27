let writes = 0;
const dirty = new Set<symbol>();
export function trackWrite(transaction: { addEventListener?: (name: string, listener: () => void, options?: { once: boolean }) => void }) {
  if (!transaction.addEventListener) return;
  writes++; let finished = false;
  const finish = () => { if (!finished) { finished = true; writes--; } };
  transaction.addEventListener('complete', finish, { once: true }); transaction.addEventListener('abort', finish, { once: true });
}
export const pendingWrites = () => writes;
export const dirtyEditors = () => dirty.size;
export function registerDirtyEditor() { const id = Symbol(); dirty.add(id); return () => { dirty.delete(id); }; }
