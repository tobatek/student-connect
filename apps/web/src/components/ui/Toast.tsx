import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  tone: 'success' | 'error';
  title: string;
  description?: string;
}
interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastItem['tone'], title: string, description?: string) => {
      const id = ++seq;
      setItems((l) => [...l.slice(-3), { id, tone, title, description }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ success: (t, d) => push('success', t, d), error: (t, d) => push('error', t, d) }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-xl bg-navy-900 px-4 py-3 text-white shadow-pop ring-1 ring-white/10"
          >
            {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" aria-hidden /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-400" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-slate-300">{t.description}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Tutup notifikasi" className="-mr-1 grid size-8 place-items-center rounded-md text-slate-300 hover:bg-white/10">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast harus dipakai di dalam ToastProvider');
  return ctx;
}
