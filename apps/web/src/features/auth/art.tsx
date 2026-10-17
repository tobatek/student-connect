/**
 * Ilustrasi dekoratif halaman masuk (SVG/CSS asli, tanpa aset pihak ketiga).
 * Semua dekorasi aria-hidden; animasinya hanya transform dan dimatikan oleh prefers-reduced-motion.
 */
import { Link2, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Pita atas: gradasi biru, busur garis tipis, dan bulatan mengambang. */
export function TopBand() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-[#2c5db0] via-[#2a3f86] to-transparent [clip-path:polygon(0_0,100%_0,100%_60%,40%_100%,0_100%)]" />
      <svg className="absolute inset-0 size-full opacity-40" viewBox="0 0 1440 144" preserveAspectRatio="none" fill="none">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M ${300 + i * 40} -10 C ${700 + i * 30} ${40 + i * 10}, ${900 + i * 20} ${120}, ${1200 + i * 50} 150`} stroke="#9ec5ff" strokeWidth="0.8" />
        ))}
      </svg>
      <span className="absolute left-[41%] top-3 size-10 animate-float-slow rounded-full bg-gradient-to-b from-[#7aa5d6] to-[#456ea8]" />
      <span className="absolute left-[43%] top-14 h-24 w-48 animate-float rounded-t-full bg-gradient-to-br from-[#33a39b] via-[#4a6fd1] to-[#8a4ad0]" />
      <span className="absolute left-[60%] top-14 h-20 w-24 rounded-t-full bg-[#5b6485] opacity-80 [animation:float-y_11s_ease-in-out_infinite_reverse]" />
    </div>
  );
}

/** Laptop berisi dasbor ilustratif (bentuk saja, tanpa angka/data). */
export function LaptopArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative mx-auto w-full max-w-[44rem]', className)}>
      <div className="animate-float-slow">
        <div className="rounded-t-[1.6rem] bg-[#eef3fb] p-2.5 shadow-2xl shadow-black/40 ring-1 ring-white/60">
          <div className="relative overflow-hidden rounded-[1.1rem] bg-[#d6e4fb] p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <span className="size-5 rounded-full ring-2 ring-white/80" />
              <span className="h-5 flex-1 rounded-full bg-white">
                <span className="ml-auto block h-full w-1/6 rounded-r-full bg-[#8fb0e3]" />
              </span>
              <span className="h-1 w-12 rounded bg-white/70" />
            </div>
            <div className="mt-3 h-6 rounded-md bg-[#8fb0e3]" />
            <div className="mt-3 grid grid-cols-[1fr_2fr_2fr] gap-3">
              <div className="rounded-lg bg-white p-2.5">
                <svg viewBox="0 0 48 48" className="mx-auto size-10">
                  <circle cx="24" cy="24" r="18" fill="none" stroke="#dbe5f5" strokeWidth="5" />
                  <circle cx="24" cy="24" r="18" fill="none" stroke="#2fb89a" strokeWidth="5" strokeDasharray="108 113" strokeLinecap="round" transform="rotate(-90 24 24)" />
                  <path d="m17 24 5 5 9-10" fill="none" stroke="#2fb89a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="mt-2 block h-1.5 rounded bg-slate-200" />
                <span className="mt-1.5 block h-1.5 w-2/3 rounded bg-slate-200" />
              </div>
              <div className="rounded-lg bg-white/85 p-2.5">
                <div className="flex h-14 items-end gap-2">
                  {[40, 60, 82, 100].map((h, i) => (
                    <span key={h} className={cn('flex-1 rounded-t', ['bg-[#9fb7e6]', 'bg-[#7da0e0]', 'bg-[#5f86d6]', 'bg-[#3f6bc8]'][i])} style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {['#2fb89a', '#e9e0d0', '#f08a4b', '#35c3c1'].map((c) => (
                    <span key={c} className="h-1.5 rounded" style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-[#1d8df0] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="grid size-12 place-items-center rounded-md ring-2 ring-white/70">
                    <span className="size-8 rounded-full border-[5px] border-white/90 border-r-transparent" />
                  </span>
                  <div className="flex h-12 items-end gap-1.5">
                    {[55, 100, 45, 80].map((h, i) => (
                      <span key={h} className={cn('w-3 rounded-sm', ['bg-[#f08a4b]', 'bg-[#f08a4b]', 'bg-[#35a8e0]', 'bg-[#35a8e0]'][i])} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2.5">
              <div className="flex animate-float items-center justify-between rounded-lg bg-white px-3 py-2.5">
                <span className="h-1.5 w-1/3 rounded bg-[#a9bde6]" />
                <span className="h-2 w-12 rounded bg-[#7ee0c8]" />
              </div>
              <div className="ml-6 flex items-center justify-between rounded-lg bg-white/90 px-3 py-2.5 [animation:float-y_9s_ease-in-out_1.2s_infinite]">
                <span className="h-1.5 w-1/4 rounded bg-[#a9bde6]" />
                <span className="h-2 w-10 rounded bg-[#b9a7ee]" />
              </div>
              <div className="ml-12 flex items-center justify-between rounded-lg bg-white/80 px-3 py-2.5 [animation:float-y_10s_ease-in-out_2.2s_infinite]">
                <span className="h-1.5 w-1/5 rounded bg-[#a9bde6]" />
                <span className="h-2 w-8 rounded bg-[#7ee0c8]" />
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-[2rem] bg-gradient-to-b from-[#d8dde8] to-[#9aa3b5] shadow-lg shadow-black/40">
          <span className="mx-auto block h-1.5 w-24 rounded-b-full bg-[#bcc3d2]" />
        </div>
      </div>
      <span className="absolute -right-2 top-1/3 flex animate-float items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xl sm:-right-6">
        <span className="size-2 rounded-full bg-emerald-500" /> Terkirim
      </span>
    </div>
  );
}

/** Ilustrasi bagian bawah: dokumen terverifikasi yang terhubung dan terkunci. */
export function ConnectArt() {
  return (
    <div aria-hidden className="relative mx-auto mt-10 h-72 w-full max-w-md">
      <span className="absolute left-4 top-6 size-24 animate-float-slow rounded-[40%_60%_55%_45%] bg-gradient-to-br from-fuchsia-400/60 to-indigo-500/40 blur-sm" />
      <span className="absolute bottom-4 right-6 size-16 animate-float rounded-[55%_45%_40%_60%] bg-gradient-to-br from-fuchsia-400/60 to-indigo-500/40 blur-sm" />
      <div className="absolute left-1/2 top-4 w-56 -translate-x-1/2 animate-float-slow rounded-2xl bg-white p-4 shadow-2xl shadow-indigo-950/40">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <ShieldCheck className="size-6" />
          </span>
          <div className="flex-1 space-y-1.5">
            <span className="block h-2 rounded bg-slate-300" />
            <span className="block h-2 w-2/3 rounded bg-slate-200" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <span className="block h-2 rounded bg-slate-200" />
          <span className="block h-2 w-5/6 rounded bg-slate-200" />
          <span className="block h-2 w-3/5 rounded bg-slate-200" />
        </div>
        <span className="mt-4 block h-8 rounded-lg bg-gradient-to-r from-[#3b5bfd] to-[#9b4ad0]" />
      </div>
      <span className="absolute left-2 top-40 grid size-14 animate-float place-items-center rounded-2xl bg-white text-[#3b5bfd] shadow-xl">
        <Link2 className="size-6" />
      </span>
      <span className="absolute bottom-6 right-2 grid size-14 animate-float place-items-center rounded-2xl bg-white text-[#9b4ad0] shadow-xl [animation-delay:1.4s]">
        <Lock className="size-6" />
      </span>
      <svg className="absolute inset-0 size-full" viewBox="0 0 448 288" fill="none">
        <path d="M70 190 C 110 140, 150 150, 190 130" stroke="white" strokeOpacity=".5" strokeWidth="2" strokeDasharray="4 6" />
        <path d="M300 160 C 340 190, 370 200, 380 235" stroke="white" strokeOpacity=".5" strokeWidth="2" strokeDasharray="4 6" />
      </svg>
    </div>
  );
}

/** Gelombang pemisah antara hero gelap dan bagian biru. */
export function Wave({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 260" preserveAspectRatio="none" className={cn('block h-24 w-full sm:h-40 lg:h-52', className)}>
      <path fill="#1f2144" d="M0 0h1440v140c-120 60-260 100-420 60S700 60 520 70 160 150 0 220z" />
    </svg>
  );
}
