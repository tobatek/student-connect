import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseZap, RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MasterEmployee, MasterStudent, MasterSyncStatus, Page, SyncKind, SyncRun } from '@students-connect/contracts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Field';
import { Pagination, Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage, qs } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useDebounced } from '@/features/records/useDebounced';

const KIND_LABEL: Record<SyncKind, string> = { students: 'Mahasiswa', employees: 'Dosen & pegawai' };
const STATUS_LABEL: Record<SyncRun['status'], string> = { RUNNING: 'Berjalan', SUCCESS: 'Berhasil', PARTIAL: 'Sebagian', FAILED: 'Gagal' };
const STATUS_TONE = { RUNNING: 'sky', SUCCESS: 'emerald', PARTIAL: 'amber', FAILED: 'rose' } as const;
const POLL_MS = 2000;

/** Persentase 0-100 dari run berjalan; null bila total tidak diketahui. */
export function progressPercent(run: Pick<SyncRun, 'fetched' | 'progress_total'>): number | null {
  if (!run.progress_total || run.progress_total <= 0) return null;
  return Math.min(100, Math.round((run.fetched / run.progress_total) * 100));
}

function ProgressBar({ run }: { run: SyncRun }) {
  const percent = progressPercent(run);
  const finishing = percent === 100;
  return (
    <div className="mt-3">
      <div
        role="progressbar"
        aria-label={`Progres tarik data ${KIND_LABEL[run.kind]}`}
        aria-valuemin={0}
        aria-valuemax={run.progress_total ?? undefined}
        aria-valuenow={percent === null ? undefined : run.fetched}
        aria-valuetext={percent === null ? `${formatNumber(run.fetched)} baris diproses` : `${formatNumber(run.fetched)} dari ${formatNumber(run.progress_total ?? 0)}, ${percent} persen`}
        className="h-3 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={percent === null ? 'h-full w-1/3 animate-pulse rounded-full bg-brand-600' : 'h-full rounded-full bg-brand-600 transition-[width] duration-500'}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-sm text-slate-700" aria-live="polite">
        <span>
          {percent === null ? (
            <>
              <strong className="text-slate-900">{formatNumber(run.fetched)}</strong> baris diproses
            </>
          ) : (
            <>
              <strong className="text-slate-900">{formatNumber(run.fetched)}</strong> dari {formatNumber(run.progress_total ?? 0)} baris
            </>
          )}
          {finishing && ' · menyelesaikan…'}
        </span>
        {percent !== null && <strong className="text-slate-900">{percent}%</strong>}
      </p>
    </div>
  );
}

function KindCard({ kind, status, running, last, canRun, onRun, starting }: { kind: SyncKind; status: MasterSyncStatus; running: SyncRun | undefined; last: SyncRun | undefined; canRun: boolean; onRun: () => void; starting: boolean }) {
  const counts = status.counts[kind];
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{KIND_LABEL[kind]}</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            <strong className="text-slate-900">{formatNumber(counts.active)}</strong> aktif
            {counts.inactive > 0 && <> · {formatNumber(counts.inactive)} nonaktif</>}
          </p>
        </div>
        <Button size="sm" icon={<RefreshCw className="size-4" aria-hidden />} loading={starting || Boolean(running)} disabled={!canRun || Boolean(running)} onClick={onRun}>
          {running ? 'Sedang menarik' : 'Tarik sekarang'}
        </Button>
      </div>
      {running && <ProgressBar run={running} />}
      {!running && last && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
          <Badge tone={STATUS_TONE[last.status]} dot>
            {STATUS_LABEL[last.status]}
          </Badge>
          <span>{formatDateTime(last.finished_at ?? last.started_at)}</span>
          <span>· {formatNumber(last.fetched)} baris{last.created > 0 && `, ${formatNumber(last.created)} baru`}{last.deactivated > 0 && `, ${formatNumber(last.deactivated)} dinonaktifkan`}</span>
        </p>
      )}
      {!running && last?.note && <p className="mt-1.5 text-sm text-slate-600">{last.note}</p>}
      {!running && !last && <p className="mt-3 text-sm text-slate-600">Belum pernah ditarik.</p>}
    </Card>
  );
}

function RunHistory({ runs }: { runs: SyncRun[] }) {
  if (runs.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Riwayat penarikan" description="20 penarikan terakhir (terjadwal pukul 02:00, manual, atau lewat tugas)." />
      <TableWrap>
        <Table>
          <caption className="sr-only">Riwayat penarikan data master</caption>
          <thead>
            <tr>
              <Th>Waktu</Th>
              <Th>Jenis</Th>
              <Th>Status</Th>
              <Th>Diambil</Th>
              <Th>Baru</Th>
              <Th>Berubah</Th>
              <Th>Nonaktif</Th>
              <Th>Gagal</Th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDateTime(r.started_at)}</Td>
                <Td>{KIND_LABEL[r.kind]}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[r.status]} dot pulse={r.status === 'RUNNING'}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </Td>
                <Td>{formatNumber(r.fetched)}</Td>
                <Td>{formatNumber(r.created)}</Td>
                <Td>{formatNumber(r.updated)}</Td>
                <Td>{formatNumber(r.deactivated)}</Td>
                <Td>{formatNumber(r.failed)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'emerald' : 'slate'} dot>
      {active ? 'Aktif' : 'Nonaktif'}
    </Badge>
  );
}

function DataList({ kind }: { kind: SyncKind }) {
  const [term, setTerm] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(term.trim());

  useEffect(() => setPage(1), [kind, q, state]);

  const list = useQuery({
    queryKey: ['master-data', kind, { q, state, page }],
    queryFn: () => api<Page<MasterStudent | MasterEmployee>>(`/api/master-sync/${kind}${qs({ page, page_size: 15, q: q || undefined, status: state || undefined })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <Card>
      <CardHeader
        title={`Daftar ${KIND_LABEL[kind].toLowerCase()}`}
        description="Salinan lokal dari Portal. Data diubah di Portal, bukan di sini."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <label className="sr-only" htmlFor="master-search">
                Cari {KIND_LABEL[kind].toLowerCase()}
              </label>
              <Input id="master-search" className="h-10 w-64 pl-9 text-sm" placeholder={kind === 'students' ? 'Cari NIM, nama, atau email' : 'Cari NIP, NUPTK, nama, atau email'} maxLength={60} value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <label className="sr-only" htmlFor="master-state">
              Status
            </label>
            <Select id="master-state" className="h-10 w-36 text-sm" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Semua status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </Select>
          </>
        }
      />
      {list.isPending ? (
        <Skeleton className="m-5 h-64" />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<DatabaseZap className="size-6" aria-hidden />} title="Belum ada data" description={q || state ? 'Tidak ada yang cocok dengan pencarian.' : 'Tekan "Tarik sekarang" untuk mengambil data dari Portal.'} />
      ) : (
        <>
          <TableWrap>
            <Table>
              <caption className="sr-only">Daftar {KIND_LABEL[kind]}</caption>
              <thead>
                {kind === 'students' ? (
                  <tr>
                    <Th>NIM</Th>
                    <Th>Nama</Th>
                    <Th>Program studi</Th>
                    <Th>Angkatan</Th>
                    <Th>Status</Th>
                  </tr>
                ) : (
                  <tr>
                    <Th>NUPTK</Th>
                    <Th>NIP</Th>
                    <Th>Nama</Th>
                    <Th>Unit</Th>
                    <Th>Status</Th>
                  </tr>
                )}
              </thead>
              <tbody>
                {kind === 'students'
                  ? (list.data.items as MasterStudent[]).map((s) => (
                      <Tr key={s.nim}>
                        <Td className="font-mono text-sm">{s.nim}</Td>
                        <Td>
                          <p className="font-bold text-slate-900">{s.nama}</p>
                          {s.email && <p className="text-sm text-slate-600">{s.email}</p>}
                        </Td>
                        <Td>{s.prodi ?? '–'}</Td>
                        <Td>{s.angkatan ?? '–'}</Td>
                        <Td>
                          <ActiveBadge active={s.is_active} />
                        </Td>
                      </Tr>
                    ))
                  : (list.data.items as MasterEmployee[]).map((e) => (
                      <Tr key={e.nip}>
                        <Td className="font-mono text-sm">{e.nuptk ?? '–'}</Td>
                        <Td className="font-mono text-sm">{e.nip}</Td>
                        <Td>
                          <p className="font-bold text-slate-900">{e.nama}</p>
                          {e.email && <p className="text-sm text-slate-600">{e.email}</p>}
                        </Td>
                        <Td>{e.unit ?? '–'}</Td>
                        <Td>
                          <ActiveBadge active={e.is_active} />
                        </Td>
                      </Tr>
                    ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination page={list.data.page} totalPages={list.data.total_pages} totalItems={list.data.total_items} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

export function MasterDataPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<SyncKind>('students');
  const wasRunning = useRef(false);

  const status = useQuery({
    queryKey: ['master-sync'],
    queryFn: () => api<MasterSyncStatus>('/api/master-sync'),
    // Polling cepat hanya saat ada penarikan berjalan.
    refetchInterval: (query) => (query.state.data?.runs.some((r) => r.status === 'RUNNING') ? POLL_MS : false),
  });

  const anyRunning = status.data?.runs.some((r) => r.status === 'RUNNING') ?? false;
  useEffect(() => {
    // Penarikan baru saja selesai: segarkan daftar data.
    if (wasRunning.current && !anyRunning) void qc.invalidateQueries({ queryKey: ['master-data'] });
    wasRunning.current = anyRunning;
  }, [anyRunning, qc]);

  const run = useMutation({
    mutationFn: (kind: SyncKind | 'all') => api<{ queued: string[] }>('/api/master-sync/run', { method: 'POST', body: { kind } }),
    onSuccess: () => {
      toast.success('Penarikan dimulai', 'Progres tampil di bawah dan diperbarui otomatis.');
      void qc.invalidateQueries({ queryKey: ['master-sync'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) toast.success('Sudah berjalan', 'Penarikan yang sama sedang berlangsung.');
      else toast.error('Gagal memulai penarikan', errorMessage(e));
      void qc.invalidateQueries({ queryKey: ['master-sync'] });
    },
  });

  if (status.isPending) return <Skeleton className="h-72" />;
  if (status.isError) return <ErrorState message={errorMessage(status.error)} onRetry={() => void status.refetch()} />;

  const runs = status.data.runs;
  const latest = (kind: SyncKind) => runs.find((r) => r.kind === kind && r.status !== 'RUNNING');
  const running = (kind: SyncKind) => runs.find((r) => r.kind === kind && r.status === 'RUNNING');
  const tabs: TabItem<SyncKind>[] = [
    { id: 'students', label: 'Mahasiswa' },
    { id: 'employees', label: 'Dosen & pegawai' },
  ];

  return (
    <div className="space-y-5">
      {!status.data.enabled && (
        <Alert tone="warning" title="Sinkronisasi belum diaktifkan">
          Aktifkan SSO dan sinkronisasi master di konfigurasi server (SSO_ENABLED dan MASTER_SYNC_ENABLED), lalu muat ulang halaman ini.
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Data ditarik otomatis tiap pukul 02:00. Tekan tombol untuk menarik sekarang tanpa menunggu.</p>
        <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" aria-hidden />} disabled={!status.data.enabled || anyRunning || run.isPending} onClick={() => run.mutate('all')}>
          Tarik semua
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(['students', 'employees'] as const).map((kind) => (
          <KindCard key={kind} kind={kind} status={status.data} running={running(kind)} last={latest(kind)} canRun={status.data.enabled} starting={run.isPending && run.variables === kind} onRun={() => run.mutate(kind)} />
        ))}
      </div>
      <Tabs label="Jenis data master" items={tabs} value={view} onChange={setView} />
      <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        <DataList kind={view} />
      </div>
      <RunHistory runs={runs} />
    </div>
  );
}
