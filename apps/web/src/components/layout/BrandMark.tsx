import { cn } from '@/lib/cn';

/** Logo Student Connect: huruf "S" yang tersambung ke satu titik (koneksi). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15', className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="size-6" fill="none">
        <path d="M9 21c0-3 2-4.5 5-5.5s4-1.5 4-3.2c0-1.6-1.3-2.6-3-2.6-1.9 0-3.1 1-3.6 2.7" stroke="#38bdf8" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="21.5" cy="21" r="2.4" fill="#38bdf8" />
      </svg>
    </span>
  );
}
