import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { AuditEntry, ChainReport, Page } from '@students-connect/contracts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Pagination, Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const TONE = { SUCCESS: 'emerald', DENIED: 'amber', FAILURE: 'rose' } as const;
const OUTCOME = { SUCCESS: 'Berhasil', DENIED: 'Ditolak', FAILURE: 'Gagal' } as const;

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['audit', page],
    queryFn: () => api<Page<AuditEntry>>(`/api/audit-logs${qs({ page, page_size: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const verify = useMutation({ mutationFn: () => api<ChainReport>('/api/audit-logs/verify') });

  return (
    <>
      <PageHeader
        title="Jejak Audit"
        description="Catatan tahan-ubah atas login, perubahan data, dokumen, dan pengiriman. Tiap baris terikat hash ke baris sebelumnya sehingga perubahan diam-diam dapat dideteksi."
        actions={
          <Button variant="secondary" loading={verify.isPending} icon={<ShieldCheck className="size-4" aria-hidden />} onClick={() => verify.mutate()}>
            Verifikasi integritas
          </Button>
        }
      />

      {verify.isError && <Alert tone="danger" className="mb-4">{errorMessage(verify.error)}</Alert>}
      {verify.data &&
        (verify.data.intact ? (
          <Alert tone="success" className="mb-4" title="Rantai audit utuh">
            {verify.data.checked.toLocaleString('id-ID')} baris diperiksa dan tidak ada yang berubah.
          </Alert>
        ) : (
          <Alert tone="danger" className="mb-4" title="Rantai audit tidak utuh">
            Ketidaksesuaian ditemukan mulai baris #{verify.data.first_broken_id}. Segera laporkan ke penanggung jawab keamanan informasi.
          </Alert>
        ))}

      <Card>
        {q.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={<ShieldAlert className="size-6" aria-hidden />} title="Belum ada catatan" />
        ) : (
          <>
            <TableWrap>
              <Table>
                <caption className="sr-only">Jejak audit</caption>
                <thead>
                  <tr>
                    <Th>Waktu</Th>
                    <Th>Pelaku</Th>
                    <Th>Aksi</Th>
                    <Th>Hasil</Th>
                    <Th>IP</Th>
                    <Th>Hash</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((a) => (
                    <Tr key={a.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(a.created_at)}</Td>
                      <Td>
                        <p className="font-bold text-slate-900">{a.actor_email ?? 'Sistem'}</p>
                        {a.actor_role && <p className="text-xs text-slate-600">{a.actor_role}</p>}
                      </Td>
                      <Td>
                        <p className="font-mono text-[0.8rem] text-slate-900">{a.action}</p>
                        <p className="text-xs text-slate-600">{a.entity}{a.entity_ref ? ` · ${a.entity_ref.slice(0, 8)}` : ''}</p>
                      </Td>
                      <Td>
                        <Badge tone={TONE[a.outcome]} dot>
                          {OUTCOME[a.outcome]}
                        </Badge>
                      </Td>
                      <Td className="font-mono text-xs">{a.ip ?? '—'}</Td>
                      <Td className="font-mono text-xs text-slate-500" title={a.hash}>
                        {a.hash.slice(0, 10)}…
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={q.data.page} totalPages={q.data.total_pages} totalItems={q.data.total_items} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
