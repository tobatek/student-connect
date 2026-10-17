import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function TableWrap({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('overflow-x-auto', className)} {...rest} />;
}

export function Table({ className, ...rest }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-left text-sm', className)} {...rest} />;
}

export function Th({ className, ...rest }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('whitespace-nowrap border-b border-line bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 first:pl-5 last:pr-5', className)}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: ComponentProps<'td'>) {
  return <td className={cn('border-b border-line px-4 py-3.5 align-top text-slate-800 first:pl-5 last:pr-5', className)} {...rest} />;
}

export function Tr({ className, ...rest }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors hover:bg-brand-50/40', className)} {...rest} />;
}

export function Pagination({ page, totalPages, totalItems, onPage }: { page: number; totalPages: number; totalItems: number; onPage: (p: number) => void }) {
  if (totalItems === 0) return null;
  return (
    <nav aria-label="Navigasi halaman" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="text-sm text-slate-600">
        Halaman <strong className="text-slate-900">{page}</strong> dari {Math.max(totalPages, 1)} · {totalItems.toLocaleString('id-ID')} data
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="size-4" aria-hidden />}>
          Sebelumnya
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Berikutnya
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
