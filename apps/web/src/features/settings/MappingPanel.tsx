import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Mapping } from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';

const GROUP_LABEL: Record<string, string> = {
  level: 'Level',
  kategori: 'Kategori',
  peringkat: 'Peringkat',
  kelompok_prestasi: 'Kelompok prestasi',
  bentuk: 'Bentuk kegiatan',
  jenis: 'Jenis rekognisi',
};

export function MappingPanel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const editable = can('settings.manage');
  const q = useQuery({ queryKey: ['mappings'], queryFn: () => api<Mapping[]>('/api/settings/enum-mappings') });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const key = (m: Mapping) => `${m.group_name}:${m.internal_value}`;
  const save = useMutation({
    mutationFn: (rows: Mapping[]) =>
      api<Mapping[]>('/api/settings/enum-mappings', {
        method: 'PUT',
        body: { mappings: rows.map((m) => ({ group_name: m.group_name, internal_value: m.internal_value, simkatmawa_code: edits[key(m)] ?? m.simkatmawa_code, label: m.label })) },
      }),
    onSuccess: (data) => {
      qc.setQueryData(['mappings'], data);
      setEdits({});
      toast.success('Pemetaan tersimpan');
    },
    onError: (e) => toast.error('Gagal menyimpan', errorMessage(e)),
  });

  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;

  const dirty = q.data.filter((m) => edits[key(m)] !== undefined && edits[key(m)] !== m.simkatmawa_code);
  const groups = [...new Set(q.data.map((m) => m.group_name))];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Pemetaan nilai internal ke kode SIMKATMAWA"
          description="Nilai bawaan sudah sesuai dokumentasi API. Ubah hanya bila SIMKATMAWA mengganti kodenya."
          actions={editable && <Button disabled={dirty.length === 0} loading={save.isPending} onClick={() => save.mutate(dirty)}>Simpan {dirty.length > 0 && `(${dirty.length})`}</Button>}
        />
      </Card>
      {groups.map((g) => (
        <Card key={g}>
          <CardHeader title={GROUP_LABEL[g] ?? g} />
          <TableWrap>
            <Table>
              <caption className="sr-only">Pemetaan {GROUP_LABEL[g] ?? g}</caption>
              <thead>
                <tr>
                  <Th>Nilai internal</Th>
                  <Th>Label</Th>
                  <Th>Kode SIMKATMAWA</Th>
                </tr>
              </thead>
              <tbody>
                {q.data.filter((m) => m.group_name === g).map((m) => (
                  <Tr key={key(m)}>
                    <Td className="font-mono text-xs">{m.internal_value}</Td>
                    <Td>{m.label}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`Kode SIMKATMAWA untuk ${m.label}`}
                          disabled={!editable}
                          className="h-10 max-w-44 font-mono text-sm"
                          value={edits[key(m)] ?? m.simkatmawa_code}
                          onChange={(e) => setEdits({ ...edits, [key(m)]: e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) })}
                        />
                        {m.is_override && <Badge tone="sky">Diubah</Badge>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      ))}
    </div>
  );
}
