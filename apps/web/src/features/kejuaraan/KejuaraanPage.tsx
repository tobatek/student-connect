import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, FilePenLine, Plus, Trash2, Wand2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  BENTUK_EVENT_LABEL,
  BENTUK_EVENT_OPTIONS,
  JENIS_PENYELENGGARAAN_LABEL,
  JENIS_PENYELENGGARAAN_OPTIONS,
  KATEGORI_LABEL,
  KATEGORI_OPTIONS,
  LEVEL_LABEL,
  LEVEL_OPTIONS,
  type Kejuaraan,
  type KejuaraanInput,
  type Page,
} from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pagination, Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { LinkField } from '@/features/documents/LinkField';
import { api, ApiError, errorMessage, qs } from '@/lib/api';
import { safeHref } from '@/lib/format';

interface FormState {
  nama_ajang: string;
  jenis_penyelenggaraan: string;
  level: string;
  kategori: string;
  bentuk: string;
  tempat: string;
  url_ajang: string;
  tahun: string;
  laporan: { tahun: string; url_ajang: string; url_laporan: string }[];
}

const blank = (): FormState => ({
  nama_ajang: '',
  jenis_penyelenggaraan: 'MANDIRI',
  level: '',
  kategori: '',
  bentuk: '',
  tempat: '',
  url_ajang: '',
  tahun: String(new Date().getFullYear()),
  laporan: [],
});

const fromItem = (k: Kejuaraan): FormState => ({
  nama_ajang: k.nama_ajang,
  jenis_penyelenggaraan: k.jenis_penyelenggaraan,
  level: k.level,
  kategori: k.kategori,
  bentuk: k.bentuk,
  tempat: k.tempat,
  url_ajang: k.url_ajang,
  tahun: String(k.tahun),
  laporan: k.laporan.map((l) => ({ tahun: String(l.tahun), url_ajang: l.url_ajang, url_laporan: l.url_laporan })),
});

const toInput = (s: FormState): KejuaraanInput => ({
  nama_ajang: s.nama_ajang.trim(),
  jenis_penyelenggaraan: s.jenis_penyelenggaraan as KejuaraanInput['jenis_penyelenggaraan'],
  level: s.level as KejuaraanInput['level'],
  kategori: s.kategori as KejuaraanInput['kategori'],
  bentuk: s.bentuk as KejuaraanInput['bentuk'],
  tempat: s.tempat.trim(),
  url_ajang: s.url_ajang.trim(),
  tahun: Number(s.tahun),
  laporan: s.laporan.map((l) => ({ tahun: Number(l.tahun), url_ajang: l.url_ajang.trim(), url_laporan: l.url_laporan.trim() })),
});

function KejuaraanForm({ item, onClose }: { item: Kejuaraan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => (item ? fromItem(item) : blank()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => (item ? api<Kejuaraan>(`/api/kejuaraan/${item.id}`, { method: 'PUT', body: toInput(form) }) : api<Kejuaraan>('/api/kejuaraan', { method: 'POST', body: toInput(form) })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kejuaraan'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(item ? 'Perubahan tersimpan' : 'Kejuaraan ditambahkan');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
        setErrors(e.fieldErrors);
        setFormError('Periksa kembali isian yang ditandai.');
      } else setFormError(errorMessage(e));
    },
  });

  const autoYears = () => {
    const last = Number(form.tahun);
    if (!Number.isInteger(last)) return;
    set(
      'laporan',
      [last - 2, last - 1, last].map((y) => ({ tahun: String(y), url_ajang: form.url_ajang, url_laporan: '' })),
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={item ? 'Ubah kejuaraan' : 'Tambah kejuaraan'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button type="submit" form="kejuaraan-form" loading={save.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <form
        id="kejuaraan-form"
        noValidate
        className="space-y-5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setFormError(null);
          save.mutate();
        }}
      >
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Nama ajang / lomba" required error={errors.nama_ajang}>
          {(c) => <Input {...c} value={form.nama_ajang} onChange={(e) => set('nama_ajang', e.target.value)} maxLength={300} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jenis penyelenggaraan" required error={errors.jenis_penyelenggaraan}>
            {(c) => (
              <Select {...c} value={form.jenis_penyelenggaraan} onChange={(e) => set('jenis_penyelenggaraan', e.target.value)}>
                {JENIS_PENYELENGGARAAN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tahun" required error={errors.tahun}>
            {(c) => <Input {...c} inputMode="numeric" value={form.tahun} onChange={(e) => set('tahun', e.target.value.replace(/\D/g, '').slice(0, 4))} />}
          </Field>
          <Field label="Level" required error={errors.level}>
            {(c) => (
              <Select {...c} value={form.level} onChange={(e) => set('level', e.target.value)}>
                <option value="">Pilih level…</option>
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Kategori" required error={errors.kategori}>
            {(c) => (
              <Select {...c} value={form.kategori} onChange={(e) => set('kategori', e.target.value)}>
                <option value="">Pilih kategori…</option>
                {KATEGORI_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Bentuk" required error={errors.bentuk}>
            {(c) => (
              <Select {...c} value={form.bentuk} onChange={(e) => set('bentuk', e.target.value)}>
                <option value="">Pilih bentuk…</option>
                {BENTUK_EVENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tempat" required error={errors.tempat}>
            {(c) => <Input {...c} value={form.tempat} onChange={(e) => set('tempat', e.target.value)} maxLength={300} />}
          </Field>
        </div>
        <LinkField label="URL ajang" required value={form.url_ajang} onChange={(v) => set('url_ajang', v)} error={errors.url_ajang} />

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-800">Laporan kegiatan tahunan</legend>
          <p className="text-sm text-slate-600">URL ajang dan URL laporan kegiatan wajib diisi untuk setiap tahun.</p>
          {form.laporan.map((l, i) => (
            <div key={i} className="grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-line sm:grid-cols-[6rem_1fr_1fr_auto]">
              <Field label="Tahun" error={errors[`laporan[${i}].tahun`]}>
                {(c) => <Input {...c} inputMode="numeric" value={l.tahun} onChange={(e) => set('laporan', form.laporan.map((x, j) => (j === i ? { ...x, tahun: e.target.value.replace(/\D/g, '').slice(0, 4) } : x)))} />}
              </Field>
              <Field label="URL ajang" error={errors[`laporan[${i}].url_ajang`]}>
                {(c) => <Input {...c} type="url" value={l.url_ajang} onChange={(e) => set('laporan', form.laporan.map((x, j) => (j === i ? { ...x, url_ajang: e.target.value } : x)))} />}
              </Field>
              <Field label="URL laporan" error={errors[`laporan[${i}].url_laporan`]}>
                {(c) => <Input {...c} type="url" value={l.url_laporan} onChange={(e) => set('laporan', form.laporan.map((x, j) => (j === i ? { ...x, url_laporan: e.target.value } : x)))} />}
              </Field>
              <div className="flex items-end">
                <IconButton label={`Hapus laporan tahun ${l.tahun || i + 1}`} onClick={() => set('laporan', form.laporan.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => set('laporan', [...form.laporan, { tahun: '', url_ajang: form.url_ajang, url_laporan: '' }])}>
              Tambah tahun
            </Button>
            {form.jenis_penyelenggaraan === 'MANDIRI_TERVERIFIKASI' && (
              <Button variant="secondary" size="sm" icon={<Wand2 className="size-4" aria-hidden />} onClick={autoYears}>
                Buat 3 tahun berurutan
              </Button>
            )}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

export default function KejuaraanPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ item: Kejuaraan | null } | null>(null);
  const [removing, setRemoving] = useState<Kejuaraan | null>(null);

  const q = useQuery({
    queryKey: ['kejuaraan', page],
    queryFn: () => api<Page<Kejuaraan>>(`/api/kejuaraan${qs({ page, page_size: 15 })}`),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (k: Kejuaraan) => api(`/api/kejuaraan/${k.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kejuaraan'] });
      toast.success('Kejuaraan dihapus');
      setRemoving(null);
    },
    onError: (e) => {
      toast.error('Gagal menghapus', errorMessage(e));
      setRemoving(null);
    },
  });

  const items = q.data?.items ?? [];
  const writable = can('event.write');

  return (
    <>
      <PageHeader
        title="Kejuaraan"
        description="Laporan ajang/lomba yang diselenggarakan kampus. Modul ini hanya tersedia di web SIMKATMAWA, jadi data di sini berfungsi sebagai arsip dan bahan pengisian."
        actions={writable && <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ item: null })}>Tambah kejuaraan</Button>}
      />
      <Card>
        {q.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={<CalendarDays className="size-6" aria-hidden />} title="Belum ada kejuaraan" description="Catat ajang yang diselenggarakan kampus beserta laporan tahunannya." action={writable ? <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ item: null })}>Tambah kejuaraan</Button> : undefined} />
        ) : (
          <>
            <TableWrap>
              <Table>
                <caption className="sr-only">Daftar kejuaraan</caption>
                <thead>
                  <tr>
                    <Th>Ajang</Th>
                    <Th>Level / kategori</Th>
                    <Th>Bentuk</Th>
                    <Th>Tahun</Th>
                    <Th>Laporan</Th>
                    {writable && (
                      <Th className="text-right">
                        <span className="sr-only">Aksi</span>
                      </Th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((k) => {
                    const href = safeHref(k.url_ajang);
                    return (
                      <Tr key={k.id}>
                        <Td className="max-w-xs">
                          <p className="font-bold text-slate-900">{k.nama_ajang}</p>
                          <p className="text-slate-600">{k.tempat}</p>
                          <Badge tone={k.jenis_penyelenggaraan === 'MANDIRI' ? 'slate' : 'sky'} className="mt-1.5">
                            {JENIS_PENYELENGGARAAN_LABEL[k.jenis_penyelenggaraan].split(' (')[0]}
                          </Badge>
                        </Td>
                        <Td>
                          <p>{LEVEL_LABEL[k.level]}</p>
                          <p className="text-slate-600">{KATEGORI_LABEL[k.kategori]}</p>
                        </Td>
                        <Td>{BENTUK_EVENT_LABEL[k.bentuk]}</Td>
                        <Td className="tabular-nums">{k.tahun}</Td>
                        <Td>
                          <span className="tabular-nums">{k.laporan.length} tahun</span>
                          {href && (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-brand-800 underline underline-offset-2">
                              Buka ajang <ExternalLink className="size-3.5" aria-hidden />
                            </a>
                          )}
                        </Td>
                        {writable && (
                          <Td>
                            <div className="flex justify-end">
                              <IconButton label={`Ubah ${k.nama_ajang}`} onClick={() => setEditing({ item: k })}>
                                <FilePenLine className="size-4" aria-hidden />
                              </IconButton>
                              <IconButton label={`Hapus ${k.nama_ajang}`} onClick={() => setRemoving(k)} className="text-rose-700 hover:bg-rose-50">
                                <Trash2 className="size-4" aria-hidden />
                              </IconButton>
                            </div>
                          </Td>
                        )}
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            {q.data && <Pagination page={q.data.page} totalPages={q.data.total_pages} totalItems={q.data.total_items} onPage={setPage} />}
          </>
        )}
      </Card>

      {editing && <KejuaraanForm key={editing.item?.id ?? 'baru'} item={editing.item} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={removing !== null}
        title="Hapus kejuaraan?"
        tone="danger"
        confirmLabel="Hapus"
        loading={remove.isPending}
        message={<>Kejuaraan <strong>{removing?.nama_ajang}</strong> akan dihapus permanen.</>}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}
