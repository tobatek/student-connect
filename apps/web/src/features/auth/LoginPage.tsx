import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '@/auth/AuthContext';
import { BrandMark } from '@/components/layout/BrandMark';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Alert, Spinner } from '@/components/ui/Feedback';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ConnectArt, LaptopArt, TopBand, Wave } from './art';
import { ssoErrorMessage, useSsoConfig } from './sso';

const DemoHint = import.meta.env.VITE_MOCK === 'true' ? lazy(() => import('@/mock/Demo').then((m) => ({ default: m.DemoHint }))) : null;

/** Tombol pil bergradasi (kontras teks putih >= 4.5:1 di kedua ujung gradasi). */
const PILL =
  'inline-flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#3b5bfd] to-[#9b4ad0] px-9 font-display text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-indigo-950/40 transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-xl active:translate-y-0 disabled:opacity-60';

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function LoginForm({ onDone }: { onDone: (mustChange: boolean) => void }) {
  const { login } = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const next = await login(email.trim(), password);
      onDone(next.user.must_change_password);
    } catch (err) {
      setPassword('');
      setError(err instanceof ApiError && err.status === 401 ? 'Email atau kata sandi salah, atau akun terkunci sementara.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email" required>
        {(c) => <Input {...c} type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@kampus.ac.id" autoFocus />}
      </Field>
      <Field label="Kata sandi" required>
        {(c) => (
          <div className="relative">
            <Input {...c} type={reveal ? 'text' : 'password'} name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              aria-pressed={reveal}
              className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
            >
              {reveal ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
            </button>
          </div>
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email || !password} icon={<LogIn className="size-5" aria-hidden />}>
        Masuk
      </Button>
      {DemoHint && (
        <Suspense fallback={null}>
          <DemoHint
            onPick={(e, p) => {
              setEmail(e);
              setPassword(p);
            }}
          />
        </Suspense>
      )}
      <p className="text-sm text-slate-600">Lupa kata sandi? Hubungi admin kampus Anda.</p>
    </form>
  );
}

/** Masuk lewat Portal: navigasi penuh ke backend (bukan fetch), karena alurnya berupa redirect lintas situs. */
function PortalLogin({ href, error, showDivider }: { href: string; error: string | null; showDivider: boolean }) {
  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <a
        href={href}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-6 text-base font-bold text-white shadow-sm transition-colors duration-150 hover:bg-brand-800 active:bg-brand-900"
      >
        <ShieldCheck className="size-5" aria-hidden />
        Login dengan Portal
      </a>
      {showDivider && (
        <p className="flex items-center gap-3 text-sm text-slate-600" aria-hidden>
          <span className="h-px flex-1 bg-slate-200" />
          atau dengan kata sandi
          <span className="h-px flex-1 bg-slate-200" />
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  const { me, loading } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const sso = useSsoConfig();
  const ssoError = ssoErrorMessage(params.get('sso_error'));
  const ssoOn = sso.data?.enabled === true;
  const passwordOn = !ssoOn || sso.data?.password_login_enabled !== false;
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  // Kembali dari Portal dengan galat: buka dialog agar pesannya langsung terbaca.
  const [open, setOpen] = useState(() => params.get('sso_error') !== null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (loading) return <Spinner className="min-h-dvh bg-night-900 text-white" />;
  if (me) return <Navigate to={me.user.must_change_password ? '/ganti-sandi' : from} replace />;

  return (
    <div className="min-h-dvh overflow-x-clip bg-night-900 text-white">
      <header className={cn('fixed inset-x-0 top-0 z-30 transition-colors duration-300', scrolled ? 'bg-[#3a2f8f]/95 shadow-lg shadow-black/30 backdrop-blur' : 'bg-transparent')}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-16">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="font-display text-sm font-semibold uppercase tracking-[0.28em] text-white">Student Connect</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            tabIndex={scrolled ? 0 : -1}
            aria-hidden={!scrolled}
            className={cn(
              'h-10 rounded-full bg-white/15 px-5 font-display text-sm font-bold uppercase tracking-wide ring-1 ring-white/30 transition-all duration-300 hover:bg-white/25',
              scrolled ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
            )}
          >
            Masuk
          </button>
        </div>
      </header>

      <main>
        <section className="relative isolate flex min-h-dvh items-center overflow-hidden">
          <TopBand />
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60rem_30rem_at_85%_70%,#2b3a8f55,transparent),radial-gradient(40rem_24rem_at_10%_90%,#4b2d8a40,transparent)]" />
          <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-6 pb-16 pt-32 lg:grid-cols-2 lg:px-16">
            <div>
              <h1 className="font-display text-5xl font-bold uppercase leading-[1.02] tracking-wide sm:text-7xl xl:text-8xl">
                <span className="block animate-enter">Student</span>
                <span className="block animate-enter" style={delay(120)}>
                  Connect
                </span>
              </h1>
              <p className="mt-6 max-w-xl animate-enter text-lg text-[#c9c3f5] sm:text-xl" style={delay(260)}>
                Solusi untuk seluruh urusan kemahasiswaan: catat prestasi, sertifikasi, rekognisi, dan laporan institusi, lalu kirim ke SIMKATMAWA.
              </p>
              <div className="mt-9 animate-enter" style={delay(400)}>
                <button type="button" className={PILL} onClick={() => setOpen(true)}>
                  Masuk
                </button>
              </div>
            </div>
            <div className="animate-enter lg:pl-6" style={delay(300)}>
              <LaptopArt />
            </div>
          </div>
        </section>

        <section className="relative -mt-px bg-gradient-to-b from-[#2563eb] via-[#1d4fd8] to-[#1e3a8a]">
          <Wave className="-mt-px" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 h-96 animate-pan opacity-70 [background:radial-gradient(18rem_12rem_at_15%_45%,#c05bd860,transparent),radial-gradient(14rem_10rem_at_80%_70%,#a855f755,transparent)]" />
          <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-4 text-center lg:px-16">
            <h2 className="font-display text-4xl font-bold tracking-wide sm:text-5xl">Satu akun untuk semua capaian</h2>
            <ConnectArt />
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white">
              Akun dibuat oleh admin kampus Anda. Setelah masuk, kata sandi sementara wajib diganti, dan seluruh aktivitas penting tercatat dalam jejak audit.
            </p>
            <div className="mt-8">
              <button type="button" className={PILL} onClick={() => setOpen(true)}>
                Masuk sekarang
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#171936] px-6 py-6 text-center text-sm text-[#b8b4e6]">Student Connect · Terintegrasi dengan SIMKATMAWA Kemdiktisaintek</footer>

      <Dialog open={open} onClose={() => setOpen(false)} title="Masuk ke Student Connect" description="Gunakan akun yang diberikan admin kampus Anda." size="sm">
        <div className="space-y-5">
          {ssoOn ? (
            <PortalLogin href={sso.data?.login_url ?? '/api/sso/login'} error={ssoError} showDivider={passwordOn} />
          ) : (
            ssoError && <Alert tone="danger">{ssoError}</Alert>
          )}
          {passwordOn && <LoginForm onDone={(mustChange) => navigate(mustChange ? '/ganti-sandi' : from, { replace: true })} />}
        </div>
      </Dialog>
    </div>
  );
}
