import { useRef, useState, type SetStateAction } from 'react';
import { reportError } from '../lib/reportError';
import { draftStorageKey, markDraftStorage } from '../lib/draftStorage';
export function readStored<T>(storage: Storage, key: string, fallback: T): T {
  try { const value = storage.getItem(key); return value === null ? fallback : JSON.parse(value) as T; } catch { return fallback; }
}
export function useStoredState<T>(key: string, initial: T | (() => T), storage: 'session' | 'local' = 'session') {
  const [restored] = useState(() => { try { return (storage === 'local' ? localStorage : sessionStorage).getItem(key) !== null; } catch { return false; } });
  const [value, setValue] = useState<T>(() => { const fallback = typeof initial === 'function' ? (initial as () => T)() : initial; try { return readStored(storage === 'local' ? localStorage : sessionStorage, key, fallback); } catch { return fallback; } });
  const current = useRef(value); const [error, setError] = useState('');
  function set(action: SetStateAction<T>) {
    const next = typeof action === 'function' ? (action as (value: T) => T)(current.current) : action;
    current.current = next;
    try { (storage === 'local' ? localStorage : sessionStorage).setItem(key, JSON.stringify(next)); markDraftStorage(key, true); setError(''); }
    catch (cause) { markDraftStorage(key, false); reportError('Сохранение состояния интерфейса', cause); setError('Не удалось сохранить состояние для восстановления. Не закрывайте страницу с несохранённым черновиком.'); }
    setValue(next);
  }
  function clear() { try { (storage === 'local' ? localStorage : sessionStorage).removeItem(key); markDraftStorage(key, true); } catch (cause) { reportError('Удаление черновика', cause); } }
  return [value, set, { clear, error, restored }] as const;
}
export const draftKey = draftStorageKey;
