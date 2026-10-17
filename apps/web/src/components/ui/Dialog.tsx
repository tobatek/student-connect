import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'modal' | 'drawer';
}

const SIZE = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

/** Dialog memakai elemen <dialog> native: focus trap, Esc, dan aria-modal ditangani browser. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', variant = 'modal' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const drawer = variant === 'drawer';
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'bg-transparent p-0 text-slate-900 open:flex',
        drawer ? 'my-0 ml-auto mr-0 h-dvh max-h-none w-full max-w-xl' : 'm-auto max-h-[92dvh] w-[calc(100%-1.5rem)]',
        !drawer && SIZE[size],
      )}
    >
      <div className={cn('flex max-h-[inherit] w-full flex-col bg-surface shadow-pop', drawer ? 'h-dvh animate-slide-in' : 'animate-rise rounded-2xl')}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Tutup" onClick={onClose} className="-mr-2 -mt-1">
            <X className="size-5" aria-hidden />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{open && children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-slate-50/70 px-5 py-3">{footer}</div>}
      </div>
    </dialog>
  );
}
