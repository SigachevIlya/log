import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({ title, onClose, children, error }: { title: string; onClose: () => void; children: ReactNode; error?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog className="dialog" ref={ref} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button></div>
    {error && <p className="error-banner" role="alert">{error} Повторите попытку или вернитесь к записи.</p>}
    {children}
  </dialog>;
}
