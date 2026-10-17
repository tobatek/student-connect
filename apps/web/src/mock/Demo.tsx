import { FlaskConical, RotateCcw } from 'lucide-react';
import { ROLE_LABEL } from '@students-connect/contracts';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, resetMock } from './server';

/** Pita penanda mode demo (hanya dimuat saat VITE_MOCK=true). */
export function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-950 ring-1 ring-inset ring-amber-300">
      <p className="flex items-center gap-2 font-bold">
        <FlaskConical className="size-4" aria-hidden /> Mode demo: data contoh fiktif, tersimpan di browser ini saja. Tidak ada yang dikirim ke SIMKATMAWA.
      </p>
      <button
        type="button"
        onClick={() => {
          resetMock();
          window.location.assign('/');
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 font-bold ring-1 ring-inset ring-amber-400 hover:bg-amber-50"
      >
        <RotateCcw className="size-4" aria-hidden /> Reset data demo
      </button>
    </div>
  );
}

/** Daftar akun demo di halaman login. */
export function DemoHint({ onPick }: { onPick: (email: string, password: string) => void }) {
  return (
    <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-inset ring-amber-300">
      <p className="font-bold">Akun demo (klik untuk mengisi)</p>
      <ul className="mt-2 space-y-1.5">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.email}>
            <button type="button" onClick={() => onPick(a.email, DEMO_PASSWORD)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-amber-100">
              <span className="font-mono">{a.email}</span>
              <span className="font-bold">{ROLE_LABEL[a.role]}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-amber-900">
        Kata sandi semua akun demo: <span className="font-mono font-bold">{DEMO_PASSWORD}</span>
      </p>
    </div>
  );
}
