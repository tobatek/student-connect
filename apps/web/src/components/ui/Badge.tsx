import type { ReactNode } from 'react';
import { STATUS_LABEL, type RecordStatus } from '@students-connect/contracts';
import { cn } from '@/lib/cn';

export type Tone = 'slate' | 'sky' | 'blue' | 'emerald' | 'amber' | 'orange' | 'rose';

const TONE: Record<Tone, { box: string; dot: string }> = {
  slate: { box: 'bg-slate-100 text-slate-800 ring-slate-300', dot: 'bg-slate-500' },
  sky: { box: 'bg-sky-50 text-sky-900 ring-sky-200', dot: 'bg-sky-600' },
  blue: { box: 'bg-blue-50 text-blue-900 ring-blue-200', dot: 'bg-blue-600' },
  emerald: { box: 'bg-emerald-50 text-emerald-900 ring-emerald-200', dot: 'bg-emerald-600' },
  amber: { box: 'bg-amber-50 text-amber-900 ring-amber-300', dot: 'bg-amber-600' },
  orange: { box: 'bg-orange-50 text-orange-900 ring-orange-300', dot: 'bg-orange-600' },
  rose: { box: 'bg-rose-50 text-rose-900 ring-rose-200', dot: 'bg-rose-600' },
};

export function Badge({ tone = 'slate', dot, pulse, children, className }: { tone?: Tone; dot?: boolean; pulse?: boolean; children: ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset', t.box, className)}>
      {dot && <span className={cn('size-1.5 rounded-full', t.dot, pulse && 'animate-pulse')} aria-hidden />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<RecordStatus, Tone> = {
  DRAFT: 'slate',
  SUBMITTED_INTERNAL: 'amber',
  NEED_REVISION: 'orange',
  VERIFIED: 'sky',
  QUEUED: 'blue',
  SENDING: 'blue',
  SENT: 'emerald',
  FAILED: 'rose',
  CANCELLED: 'slate',
};

export function StatusBadge({ status }: { status: RecordStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot pulse={status === 'SENDING'}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
