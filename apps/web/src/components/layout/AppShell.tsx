import {
  Award,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  FolderArchive,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Medal,
  Menu,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, type Permission } from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { BrandMark } from './BrandMark';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  end?: boolean;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Ringkasan', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Modul SIMKATMAWA',
    items: [
      { to: '/prestasi-mandiri', label: 'Prestasi Mandiri', icon: Trophy },
      { to: '/sertifikasi', label: 'Sertifikasi', icon: BadgeCheck },
      { to: '/rekognisi', label: 'Rekognisi', icon: Award },
      { to: '/kejuaraan', label: 'Kejuaraan', icon: CalendarDays },
      { to: '/prestasi-belmawa', label: 'Prestasi Belmawa', icon: Medal },
      { to: '/institusi', label: 'Institusi', icon: Landmark },
    ],
  },
  {
    title: 'Pengelolaan',
    items: [
      { to: '/dokumen', label: 'Brankas Dokumen', icon: FolderArchive },
      { to: '/antrean', label: 'Antrean Pengiriman', icon: SendHorizontal, permission: 'logs.read' },
      { to: '/audit', label: 'Jejak Audit', icon: ShieldCheck, permission: 'audit.read' },
      { to: '/pengaturan', label: 'Pengaturan', icon: Settings },
    ],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-6">
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => !i.permission || can(i.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <p className="px-3 pb-2 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-slate-400">{group.title}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-11 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-bold transition-colors',
                        isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span aria-hidden className={cn('absolute left-0 h-5 w-1 rounded-r-full bg-brand-400 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
                        <Icon className={cn('size-5 shrink-0', isActive ? 'text-brand-300' : 'text-slate-400 group-hover:text-slate-200')} aria-hidden />
                        <span className="truncate">{label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className="mb-8 flex items-center gap-3 px-3 pt-1">
        <BrandMark />
        <span className="leading-tight">
          <span className="block text-base font-bold text-white">Student Connect</span>
          <span className="block max-w-40 truncate text-xs text-slate-400">{me.tenant.nama_pt}</span>
        </span>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <NavList onNavigate={onNavigate} />
      </div>
      <p className="mt-6 px-3 text-xs text-slate-500">Tahun aktif {me.tenant.tahun_aktif} · Kode PT {me.tenant.kode_pt}</p>
    </div>
  );
}

function UserMenu() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  return (
    <details key={location.key} className="group relative">
      <summary className="flex h-11 list-none items-center gap-2.5 rounded-lg pl-1.5 pr-2.5 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white" aria-hidden>
          {initials(me.user.name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-40 truncate text-sm font-bold text-slate-900">{me.user.name}</span>
          <span className="block text-xs text-slate-600">{ROLE_LABEL[me.user.role]}</span>
        </span>
        <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />
        <span className="sr-only">Menu akun</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 animate-rise rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-line">
        <div className="border-b border-line px-3 py-2.5">
          <p className="truncate text-sm font-bold text-slate-900">{me.user.name}</p>
          <p className="truncate text-xs text-slate-600">{me.user.email}</p>
        </div>
        <Link to="/ganti-sandi" className="mt-1 flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-slate-800 hover:bg-slate-100">
          <KeyRound className="size-4" aria-hidden /> Ganti kata sandi
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await logout();
            } finally {
              navigate('/masuk', { replace: true });
            }
          }}
          className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden /> Keluar
        </button>
      </div>
    </details>
  );
}

const DemoBanner = import.meta.env.VITE_MOCK === 'true' ? lazy(() => import('@/mock/Demo').then((m) => ({ default: m.DemoBanner }))) : null;

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { me } = useAuth();

  return (
    <div className="min-h-dvh lg:pl-72">
      <a href="#konten" className="sr-only z-[70] rounded-lg bg-white px-4 py-2 font-bold text-brand-800 shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Lewati ke konten utama
      </a>

      {DemoBanner && (
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
      )}

      <aside className="fixed inset-y-0 left-0 hidden w-72 bg-gradient-to-b from-navy-900 to-navy-950 p-4 lg:block" aria-label="Navigasi">
        <SidebarBody />
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="Buka menu" onClick={() => setMenuOpen(true)} className="lg:hidden">
            <Menu className="size-5" aria-hidden />
          </IconButton>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold text-slate-900">{me.tenant.nama_pt}</p>
            <p className="truncate text-xs text-slate-600">Tahun pelaporan {me.tenant.tahun_aktif}</p>
          </div>
        </div>
        <UserMenu />
      </header>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" variant="drawer">
        <div className="-mx-5 -my-5 min-h-full bg-gradient-to-b from-navy-900 to-navy-950 p-4">
          <SidebarBody onNavigate={() => setMenuOpen(false)} />
        </div>
      </Dialog>

      <main id="konten" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Suspense fallback={<Spinner className="py-24" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
