import { afterEach, expect, it, vi } from 'vitest';
import { boundedImport } from './sectionModules';
afterEach(() => vi.useRealTimers());
it('does not resolve before module evaluation and transitive imports finish', async () => {
  let finish!: (value: string) => void; let ready = false;
  const result = boundedImport(() => new Promise<string>(resolve => { finish = resolve; }));
  void result.then(() => { ready = true; }); await Promise.resolve(); expect(ready).toBe(false);
  finish('module'); expect(await result).toBe('module'); expect(ready).toBe(true);
});
it('rejects a module promise that never settles instead of keeping Suspense forever', async () => {
  vi.useFakeTimers(); const result = boundedImport(() => new Promise(() => {}));
  const rejected = expect(result).rejects.toThrow('Загрузка раздела не завершилась');
  await vi.advanceTimersByTimeAsync(15000); await rejected; expect(vi.getTimerCount()).toBe(0);
});
it('preserves import errors for the section boundary and clears its timer', async () => {
  vi.useFakeTimers(); const error = new TypeError('Importing a module script failed');
  await expect(boundedImport(() => Promise.reject(error))).rejects.toBe(error); expect(vi.getTimerCount()).toBe(0);
});
