import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileCheck2, FolderArchive, Plug, PlugZap, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LEVEL_LABEL, type DashboardData, type RecordStatus } from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { StatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';

const KIND_META = {
  PRESTASI_MANDIRI: { label: 'Prestasi Mandiri', to: '/prestasi-mandiri', bar: 'bg-brand-600' },
  SERTIFIKASI: { label: 'Sertifikasi', to: '/sertifikasi', bar: 'bg-emerald-600' },
  REKOGNISI: { label: 'Rekognisi', to: '/rekognisi', bar: 'bg-amber-500' },
} as const;
const KIND_SLUG = { PRESTASI_MANDIRI: 'prestasi-mandiri', SERTIFIKASI: 'sertifikasi', REKOGNISI: 'rekognisi' } as const;

function Stat({ icon, label, value, hint, tone, to }: { icon: ReactNode; label: string; value: number; hint: string; tone: string; to?: string }) {
  const body = (
    <div className="flex items-start gap-4">
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl', tone)}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-600">{label}</p>
        <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{formatNumber(value)}</p>
        <p className="mt-0.5 text-sm text-slate-600">{hint}</p>
      </div>
    </div>
  );
  const cls = 'block rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line transition-shadow';
  return to ? (
    <Link to={to} className={cn(cls, 'hover:shadow-pop')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function DashboardPage() {
  const { me, can } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/api/dashboard'), staleTime: 30_000 });

  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;

  const data = q.data;
  const total = (pred: (s: RecordStatus) => boolean) => data?.counts.filter((c) => pred(c.status)).reduce((n, c) => n + c.total, 0) ?? 0;
  const all = total(() => true);
  const pending = total((s) => s === 'DRAFT' || s === 'SUBMITTED_INTERNAL' || s === 'NEED_REVISION' || s === 'VERIFIED');
  const sent = total((s) => s === 'SENT');
  const attention = total((s) => s === 'FAILED' || s === 'NEED_REVISION');
  const inFlight = total((s) => s === 'QUEUED' || s === 'SENDING');

  const perKind = (Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((k) => {
    const rows = data?.counts.filter((c) => c.kind === k) ?? [];
    const sum = rows.reduce((n, c) => n + c.total, 0);
    const done = rows.filter((c) => c.status === 'SENT').reduce((n, c) => n + c.total, 0);
    return { key: k, sum, done };
  });
  const maxKind = Math.max(1, ...perKind.map((k) => k.sum));

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-900 to-brand-900 p-6 text-white shadow-card sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-brand-500/20 blur-3xl" />
        <p className="relative text-sm font-bold text-brand-300">{greeting},</p>
        <h1 className="relative mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{me.user.name}</h1>
        <p className="relative mt-2 max-w-2xl text-slate-300">
          Ringkasan capaian kemahasiswaan <strong className="text-white">{me.tenant.nama_pt}</strong> untuk tahun pelaporan {me.tenant.tahun_aktif}.
        </p>
        {can('record.write') && (
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Link to="/prestasi-mandiri" className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-[0.95rem] font-bold text-navy-900 hover:bg-brand-50">
              <Trophy className="size-4" aria-hidden /> Catat prestasi
            </Link>
            <Link to="/dokumen" className="inline-flex h-11 items-center gap-2 rounded-lg px-4 text-[0.95rem] font-bold text-white ring-1 ring-inset ring-white/25 hover:bg-white/10">
              <FolderArchive className="size-4" aria-hidden /> Brankas dokumen
            </Link>
          </div>
        )}
      </section>

      {q.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<FileCheck2 className="size-6" aria-hidden />} tone="bg-brand-50 text-brand-700" label="Total data" value={all} hint="Prestasi, sertifikasi, rekognisi" />
          <Stat icon={<Clock3 className="size-6" aria-hidden />} tone="bg-amber-50 text-amber-700" label="Dalam proses" value={pending + inFlight} hint={`${inFlight} sedang antre/dikirim`} />
          <Stat icon={<CheckCircle2 className="size-6" aria-hidden />} tone="bg-emerald-50 text-emerald-700" label="Terkirim" value={sent} hint="Sudah tercatat di SIMKATMAWA" />
          <Stat
            icon={<AlertTriangle className="size-6" aria-hidden />}
            tone={attention > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}
            label="Perlu tindakan"
            value={attention}
            hint="Gagal kirim atau perlu revisi"
            to={attention > 0 ? '/prestasi-mandiri?status=FAILED' : undefined}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Sebaran per modul" description="Jumlah data dan proporsi yang sudah terkirim ke SIMKATMAWA." />
          <ul className="divide-y divide-line">
            {perKind.map(({ key, sum, done }) => (
              <li key={key}>
                <Link to={KIND_META[key].to} className="group block px-5 py-4 hover:bg-slate-50/70">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-900">{KIND_META[key].label}</span>
                    <span className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="tabular-nums">
                        <strong className="text-slate-900">{formatNumber(done)}</strong> / {formatNumber(sum)} terkirim
                      </span>
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </div>
                  <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${KIND_META[key].label}: ${done} dari ${sum} terkirim`}>
                    <div className={cn('h-full rounded-full transition-[width] duration-500', KIND_META[key].bar)} style={{ width: `${(sum / maxKind) * 100}%`, opacity: 0.35 }}>
                      <div className={cn('h-full rounded-full', KIND_META[key].bar)} style={{ width: sum === 0 ? 0 : `${(done / sum) * 100}%`, opacity: 1 }} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-2">
            <Link to="/kejuaraan" className="bg-surface px-5 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Kejuaraan</span> <strong className="ml-1 tabular-nums text-slate-900">{formatNumber(data?.kejuaraan_total ?? 0)}</strong>
            </Link>
            <Link to="/dokumen" className="bg-surface px-5 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Dokumen tersimpan</span> <strong className="ml-1 tabular-nums text-slate-900">{formatNumber(data?.documents_total ?? 0)}</strong>
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Koneksi SIMKATMAWA" />
          <div className="space-y-4 p-5">
            {q.isPending ? (
              <Skeleton className="h-24" />
            ) : data?.simkatmawa.configured ? (
              <>
                <div className="flex items-center gap-3">
                  <span className={cn('grid size-11 place-items-center rounded-xl', data.simkatmawa.is_connected ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                    {data.simkatmawa.is_connected ? <PlugZap className="size-5" aria-hidden /> : <Plug className="size-5" aria-hidden />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{data.simkatmawa.is_connected ? 'Terhubung' : 'Terputus'}</p>
                    <p className="truncate text-sm text-slate-600">{data.simkatmawa.email}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600">Terakhir dicek {formatDateTime(data.simkatmawa.last_checked_at)}</p>
                {data.simkatmawa.last_error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{data.simkatmawa.last_error}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-700">Akun SIMKATMAWA belum dihubungkan, sehingga data belum dapat dikirim.</p>
            )}
            {can('credential.manage') && (
              <Link to="/pengaturan?tab=simkatmawa" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-800 hover:underline">
                Kelola koneksi <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Aktivitas terbaru" description="Data yang paling baru dibuat." />
        {q.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data && data.recent.length > 0 ? (
          <ul className="divide-y divide-line">
            {data.recent.map((r) => (
              <li key={r.id}>
                <Link to={`/${KIND_SLUG[r.kind]}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50/70">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{r.nama}</p>
                    <p className="text-sm text-slate-600">
                      {KIND_META[r.kind].label} · {LEVEL_LABEL[r.level]} · {formatDate(r.tgl_sertifikat)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Trophy className="size-6" aria-hidden />} title="Belum ada aktivitas" description="Data yang Anda catat akan muncul di sini." />
        )}
      </Card>
    </div>
  );
}
