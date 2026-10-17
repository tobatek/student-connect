import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCheck, Download, Eye, FilePenLine, MoreHorizontal, Plus, RotateCcw, Search, Send, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  LEVEL_LABEL,
  PERINGKAT_LABEL,
  STATUS_OPTIONS,
  type Page,
  type RecordBase,
  type RecordKind,
  type RecordStatus,
} from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Pagination, Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage, MOCK, qs } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { KINDS, isRecordKind, type KindConfig } from './kinds';
import { RecordDetail } from './RecordDetail';
import { RecordForm } from './RecordForm';
import { useDebounced } from './useDebounced';

type ActionKey = 'submit-internal' | 'verify' | 'request-revision' | 'queue' | 'cancel' | 'delete';

interface ActionDef {
  key: ActionKey;
  label: string;
  icon: typeof Send;
  tone?: 'danger';
}

const EDITABLE: RecordStatus[] = ['DRAFT', 'NEED_REVISION', 'SUBMITTED_INTERNAL'];

function useActions(record: RecordBase) {
  const { can } = useAuth();
  const out: ActionDef[] = [];
  const s = record.status;
  if (can('record.write') && (s === 'DRAFT' || s === 'NEED_REVISION')) out.push({ key: 'submit-internal', label: 'Ajukan verifikasi', icon: UserCheck });
  if (can('record.verify') && (s === 'DRAFT' || s === 'SUBMITTED_INTERNAL' || s === 'NEED_REVISION')) out.push({ key: 'verify', label: 'Verifikasi', icon: ShieldCheck });
  if (can('record.verify') && (s === 'SUBMITTED_INTERNAL' || s === 'VERIFIED')) out.push({ key: 'request-revision', label: 'Minta revisi', icon: RotateCcw });
  if (can('record.submit') && (s === 'VERIFIED' || s === 'FAILED')) out.push({ key: 'queue', label: s === 'FAILED' ? 'Kirim ulang ke SIMKATMAWA' : 'Kirim ke SIMKATMAWA', icon: Send });
  if (can('record.verify') && ['DRAFT', 'SUBMITTED_INTERNAL', 'NEED_REVISION', 'VERIFIED', 'FAILED'].includes(s)) out.push({ key: 'cancel', label: 'Batalkan', icon: Ban, tone: 'danger' });
  if (can('record.write') && (EDITABLE.includes(s) || s === 'CANCELLED')) out.push({ key: 'delete', label: 'Hapus', icon: Trash2, tone: 'danger' });
  return out;
}

function ActionMenu({ record, onEdit, onAction }: { record: RecordBase; onEdit: () => void; onAction: (a: ActionDef) => void }) {
  const { can } = useAuth();
  const actions = useActions(record);
  const canEdit = can('record.write') && EDITABLE.includes(record.status);
  if (!canEdit && actions.length === 0) return null;
  return (
    <details className="group relative">
      <summary
        aria-label={`Aksi untuk ${record.nama}`}
        className="grid size-11 list-none place-items-center rounded-lg text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden"
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) e.currentTarget.parentElement?.removeAttribute('open');
        }}
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </summary>
      <ul role="menu" className="absolute right-0 z-20 mt-1 w-64 animate-rise rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-line">
        {canEdit && (
          <li role="none">
            <button
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.currentTarget.closest('details')?.removeAttribute('open');
                onEdit();
              }}
              className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              <FilePenLine className="size-4" aria-hidden /> Ubah data
            </button>
          </li>
        )}
        {actions.map((a) => (
          <li role="none" key={a.key}>
            <button
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.currentTarget.closest('details')?.removeAttribute('open');
                onAction(a);
              }}
              className={`flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-bold hover:bg-slate-100 ${a.tone === 'danger' ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-800'}`}
            >
              <a.icon className="size-4" aria-hidden /> {a.label}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function studentsLabel(r: RecordBase): string {
  const first = r.mahasiswa[0]?.nama ?? '—';
  return r.mahasiswa.length > 1 ? `${first} +${r.mahasiswa.length - 1}` : first;
}

export default function RecordsPage() {
  // Rute statis: /prestasi-mandiri, /sertifikasi, /rekognisi (segmen pertama = jenis).
  const kindParam = useLocation().pathname.split('/')[1];
  if (!isRecordKind(kindParam)) return <Navigate to="/" replace />;
  return <RecordsView key={kindParam} kind={kindParam} cfg={KINDS[kindParam]} />;
}

function RecordsView({ kind, cfg }: { kind: RecordKind; cfg: KindConfig }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search);

  const [form, setForm] = useState<{ record: RecordBase | null } | null>(null);
  const [detail, setDetail] = useState<RecordBase | null>(null);
  const [pending, setPending] = useState<{ record: RecordBase; action: ActionDef } | null>(null);
  const [note, setNote] = useState('');

  const list = useQuery({
    queryKey: ['records', kind, { page, status, q }],
    queryFn: () => api<Page<RecordBase>>(`/api/records/${kind}${qs({ page, page_size: 15, status, q })}`),
    placeholderData: keepPreviousData,
  });

  const run = useMutation({
    mutationFn: async ({ record, action, note: n }: { record: RecordBase; action: ActionKey; note?: string }) => {
      const base = `/api/records/${kind}/${record.id}`;
      if (action === 'delete') return api(base, { method: 'DELETE' });
      return api(`${base}/${action}`, { method: 'POST', body: action === 'request-revision' ? { note: n } : undefined });
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['records', kind] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(
        v.action === 'queue' ? 'Masuk antrean pengiriman' : v.action === 'delete' ? 'Data dihapus' : 'Status diperbarui',
        v.action === 'queue' ? 'Status akan berubah otomatis setelah diproses.' : undefined,
      );
      setPending(null);
      setNote('');
    },
    onError: (e) => {
      toast.error('Aksi gagal', errorMessage(e));
      setPending(null);
    },
  });

  const exportCsv = () => {
    if (MOCK) {
      toast.error('Tidak tersedia di mode demo', 'Ekspor CSV memerlukan backend.');
      return;
    }
    window.location.assign(`/api/records/${kind}/export`);
  };

  const onAction = (record: RecordBase, action: ActionDef) => {
    if (action.key === 'submit-internal' || action.key === 'verify') run.mutate({ record, action: action.key });
    else setPending({ record, action });
  };

  const data = list.data;
  const items = data?.items ?? [];
  const Icon = cfg.icon;

  return (
    <>
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        actions={
          <>
            {can('export') && (
              <Button variant="secondary" icon={<Download className="size-4" aria-hidden />} onClick={exportCsv}>
                Ekspor CSV
              </Button>
            )}
            {can('record.write') && (
              <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm({ record: null })}>
                Tambah {cfg.singular}
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Field label="Cari" className="min-w-0 flex-1 basis-56">
            {(c) => (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 size-5 text-slate-500" aria-hidden />
                <Input {...c} type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={`Nama ${cfg.singular} atau penyelenggara…`} className="pl-10" />
              </div>
            )}
          </Field>
          <Field label="Status" className="w-full sm:w-56">
            {(c) => (
              <Select
                {...c}
                value={status}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.value) next.set('status', e.target.value);
                  else next.delete('status');
                  setParams(next, { replace: true });
                  setPage(1);
                }}
              >
                <option value="">Semua status</option>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {list.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Icon className="size-6" aria-hidden />}
            title={q || status ? 'Tidak ada data yang cocok' : `Belum ada data ${cfg.singular}`}
            description={q || status ? 'Ubah kata kunci atau filter status.' : `Mulai dengan menambahkan ${cfg.singular} pertama kampus Anda.`}
            action={!q && !status && can('record.write') ? <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm({ record: null })}>Tambah {cfg.singular}</Button> : undefined}
          />
        ) : (
          <>
            <TableWrap className="hidden md:block">
              <Table>
                <caption className="sr-only">Daftar {cfg.title}</caption>
                <thead>
                  <tr>
                    <Th>{cfg.nameLabel}</Th>
                    <Th>Level</Th>
                    {kind === 'prestasi-mandiri' && <Th>Peringkat</Th>}
                    <Th>Mahasiswa</Th>
                    <Th>Tanggal</Th>
                    <Th>Status</Th>
                    <Th className="text-right">
                      <span className="sr-only">Aksi</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <Tr key={r.id}>
                      <Td className="max-w-sm">
                        <button type="button" onClick={() => setDetail(r)} className="block text-left font-bold text-slate-900 hover:text-brand-800 hover:underline">
                          {r.nama}
                        </button>
                        <span className="block truncate text-slate-600">{r.penyelenggara}</span>
                      </Td>
                      <Td>{LEVEL_LABEL[r.level]}</Td>
                      {kind === 'prestasi-mandiri' && <Td>{r.peringkat ? PERINGKAT_LABEL[r.peringkat] : '—'}</Td>}
                      <Td>{studentsLabel(r)}</Td>
                      <Td className="whitespace-nowrap">{formatDate(r.tgl_sertifikat)}</Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => setDetail(r)} aria-label={`Lihat detail ${r.nama}`} className="grid size-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100">
                            <Eye className="size-5" aria-hidden />
                          </button>
                          <ActionMenu record={r} onEdit={() => setForm({ record: r })} onAction={(a) => onAction(r, a)} />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            <ul className="divide-y divide-line md:hidden">
              {items.map((r) => (
                <li key={r.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => setDetail(r)} className="min-w-0 text-left">
                      <span className="block font-bold text-slate-900">{r.nama}</span>
                      <span className="block text-sm text-slate-600">{r.penyelenggara}</span>
                    </button>
                    <ActionMenu record={r} onEdit={() => setForm({ record: r })} onAction={(a) => onAction(r, a)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
                    <StatusBadge status={r.status} />
                    <span>{LEVEL_LABEL[r.level]}</span>
                    <span>{formatDate(r.tgl_sertifikat)}</span>
                    <span>{studentsLabel(r)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {data && <Pagination page={data.page} totalPages={data.total_pages} totalItems={data.total_items} onPage={setPage} />}
          </>
        )}
      </Card>

      {form && <RecordForm key={form.record?.id ?? 'baru'} kind={kind} record={form.record} open onClose={() => setForm(null)} />}
      <RecordDetail record={detail} nameLabel={cfg.nameLabel} onClose={() => setDetail(null)} />

      <ConfirmDialog
        open={pending?.action.key === 'queue'}
        title="Kirim ke SIMKATMAWA?"
        confirmLabel="Masukkan ke antrean"
        loading={run.isPending}
        message={
          <>
            <p>
              <strong>{pending?.record.nama}</strong> akan dikirim lewat antrean dengan akun SIMKATMAWA kampus Anda.
            </p>
            <p className="mt-2 text-slate-600">Setelah terkirim, data dan dokumen buktinya terkunci. Koreksi hanya dapat dilakukan lewat web SIMKATMAWA.</p>
          </>
        }
        onConfirm={() => pending && run.mutate({ record: pending.record, action: 'queue' })}
        onClose={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.action.key === 'cancel'}
        title="Batalkan data ini?"
        tone="danger"
        confirmLabel="Ya, batalkan"
        loading={run.isPending}
        message={<>Data <strong>{pending?.record.nama}</strong> akan ditandai dibatalkan dan tidak akan dikirim.</>}
        onConfirm={() => pending && run.mutate({ record: pending.record, action: 'cancel' })}
        onClose={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.action.key === 'delete'}
        title="Hapus data ini?"
        tone="danger"
        confirmLabel="Hapus permanen"
        loading={run.isPending}
        message={<>Data <strong>{pending?.record.nama}</strong> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</>}
        onConfirm={() => pending && run.mutate({ record: pending.record, action: 'delete' })}
        onClose={() => setPending(null)}
      />
      <Dialog
        open={pending?.action.key === 'request-revision'}
        onClose={() => setPending(null)}
        size="sm"
        title="Minta revisi"
        description={pending?.record.nama}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={run.isPending}>
              Batal
            </Button>
            <Button loading={run.isPending} disabled={note.trim().length === 0} icon={<CheckCheck className="size-4" aria-hidden />} onClick={() => pending && run.mutate({ record: pending.record, action: 'request-revision', note: note.trim() })}>
              Kirim catatan
            </Button>
          </>
        }
      >
        <Field label="Catatan untuk pengusul" required hint="Jelaskan bagian yang perlu diperbaiki (maks 500 karakter).">
          {(c) => <Textarea {...c} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
        </Field>
      </Dialog>
    </>
  );
}
