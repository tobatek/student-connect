import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Spinner({ label = 'Memuat…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-slate-600', className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

const ALERT = {
  info: { box: 'bg-sky-50 text-sky-950 ring-sky-200', Icon: Info },
  success: { box: 'bg-emerald-50 text-emerald-950 ring-emerald-200', Icon: CheckCircle2 },
  warning: { box: 'bg-amber-50 text-amber-950 ring-amber-300', Icon: TriangleAlert },
  danger: { box: 'bg-rose-50 text-rose-950 ring-rose-200', Icon: AlertCircle },
} as const;

export function Alert({ tone = 'info', title, children, className }: { tone?: keyof typeof ALERT; title?: string; children?: ReactNode; className?: string }) {
  const { box, Icon } = ALERT[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset', box, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">{icon}</div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-5 py-8">
      <Alert tone="danger" title="Data gagal dimuat">
        <p>{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-2 font-bold underline underline-offset-2">
            Coba lagi
          </button>
        )}
      </Alert>
    </div>
  );
}
