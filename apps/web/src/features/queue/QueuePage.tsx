import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, Hourglass, SendHorizontal, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SUBMISSION_OUTCOME_LABEL, type DashboardData, type Page, type SubmissionLog } from '@students-connect/contracts';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Pagination, Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';

const KIND_LABEL: Record<string, string> = { PRESTASI_MANDIRI: 'Prestasi Mandiri', SERTIFIKASI: 'Sertifikasi', REKOGNISI: 'Rekognisi' };
const KIND_PATH: Record<string, string> = { PRESTASI_MANDIRI: 'prestasi-mandiri', SERTIFIKASI: 'sertifikasi', REKOGNISI: 'rekognisi' };
const TONE = { SUCCESS: 'emerald', FAILED: 'rose', RETRY: 'amber' } as const;

export default function QueuePage() {
  const [page, setPage] = useState(1);
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/api/dashboard'), refetchInterval: 15_000 });
  const logs = useQuery({
    queryKey: ['submission-logs', page],
    queryFn: () => api<Page<SubmissionLog>>(`/api/submission-logs${qs({ page, page_size: 20 })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  const stat = (status: string) => dash.data?.counts.filter((c) => c.status === status) ?? [];
  const sum = (status: string) => stat(status).reduce((n, c) => n + c.total, 0);
  const cards = [
    { status: 'QUEUED', label: 'Dalam antrean', icon: Hourglass, tone: 'bg-blue-50 text-blue-700' },
    { status: 'SENDING', label: 'Sedang dikirim', icon: SendHorizontal, tone: 'bg-sky-50 text-sky-700' },
    { status: 'FAILED', label: 'Gagal kirim', icon: TriangleAlert, tone: 'bg-rose-50 text-rose-700' },
  ];

  return (
    <>
      <PageHeader title="Antrean Pengiriman" description="Pantau pengiriman ke SIMKATMAWA. Halaman diperbarui otomatis setiap 15 detik." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {cards.map(({ status, label, icon: Icon, tone }) => (
          <Card key={status} className="p-5">
            <div className="flex items-center gap-4">
              <span className={`grid size-12 place-items-center rounded-xl ${tone}`}>
                <Icon className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-600">{label}</p>
                <p className="text-3xl font-bold tabular-nums text-slate-900">{dash.isPending ? '–' : formatNumber(sum(status))}</p>
              </div>
            </div>
            {status === 'FAILED' && sum(status) > 0 && (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
                {stat(status).map((c) => (
                  <li key={c.kind}>
                    <Link className="inline-flex items-center gap-1 font-bold text-brand-800 hover:underline" to={`/${KIND_PATH[c.kind]}?status=FAILED`}>
                      {KIND_LABEL[c.kind]} ({c.total}) <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Alert tone="info" className="mb-6" title="Cara kerja pengiriman">
        Data berstatus <strong>Terverifikasi</strong> dimasukkan ke antrean, dikirim oleh server dengan akun SIMKATMAWA kampus, dan diulang otomatis bila terjadi gangguan sementara. Bila hasil pengiriman tidak pasti, sistem tidak mengirim ulang sendiri agar tidak terjadi data ganda.
      </Alert>

      <Card>
        <CardHeader title="Riwayat percobaan" description="Ringkasan setiap percobaan kirim. Isi data dan token tidak pernah dicatat." />
        {logs.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : logs.isError ? (
          <ErrorState message={errorMessage(logs.error)} onRetry={() => void logs.refetch()} />
        ) : logs.data.items.length === 0 ? (
          <EmptyState icon={<SendHorizontal className="size-6" aria-hidden />} title="Belum ada pengiriman" description="Riwayat akan muncul setelah data pertama dikirim ke SIMKATMAWA." />
        ) : (
          <>
            <TableWrap>
              <Table>
                <caption className="sr-only">Riwayat pengiriman</caption>
                <thead>
                  <tr>
                    <Th>Waktu</Th>
                    <Th>Jenis</Th>
                    <Th>Percobaan</Th>
                    <Th>Hasil</Th>
                    <Th>Keterangan</Th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.items.map((l) => (
                    <Tr key={l.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(l.created_at)}</Td>
                      <Td>{KIND_LABEL[l.kind] ?? l.kind}</Td>
                      <Td className="tabular-nums">#{l.attempt}</Td>
                      <Td>
                        <Badge tone={TONE[l.outcome]} dot>
                          {SUBMISSION_OUTCOME_LABEL[l.outcome]}
                        </Badge>
                        {l.http_status && <span className="ml-2 font-mono text-xs text-slate-500">HTTP {l.http_status}</span>}
                      </Td>
                      <Td className="max-w-md text-slate-700">{l.error ?? (typeof l.response_summary.id === 'string' ? `ID SIMKATMAWA ${l.response_summary.id}` : 'Berhasil')}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={logs.data.page} totalPages={logs.data.total_pages} totalItems={logs.data.total_items} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
