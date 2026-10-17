import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-bold text-slate-800">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-600" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-bold text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-3 text-[0.95rem] text-slate-900 placeholder:text-slate-500 transition-colors duration-150 hover:border-slate-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500/20';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'h-11', className)} {...rest} />;
}

export function Textarea({ className, rows = 3, ...rest }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(CONTROL, 'min-h-24 py-2.5', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cn(CONTROL, 'h-11 pr-8', className)} {...rest}>
      {children}
    </select>
  );
}
