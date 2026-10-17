import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function Tabs<T extends string>({ items, value, onChange, label }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            type="button"
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const i = items.findIndex((x) => x.id === value);
              const next = e.key === 'ArrowRight' ? items[(i + 1) % items.length] : e.key === 'ArrowLeft' ? items[(i - 1 + items.length) % items.length] : undefined;
              if (next) {
                e.preventDefault();
                onChange(next.id);
                document.getElementById(`tab-${next.id}`)?.focus();
              }
            }}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-bold transition-colors',
              active ? 'bg-white text-brand-800 shadow-sm ring-1 ring-line' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.icon}
            {t.label}
            {t.badge}
          </button>
        );
      })}
    </div>
  );
}
