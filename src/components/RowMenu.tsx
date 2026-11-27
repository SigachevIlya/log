import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } }; window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape); return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); }; }, [open]);
  return <div className="row-menu" ref={ref}><button className="icon-button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={21} /></button>{open && <div className="row-menu-items" onClick={event => { if ((event.target as HTMLElement).closest('button')) setOpen(false); }}>{children}</div>}</div>;
}
