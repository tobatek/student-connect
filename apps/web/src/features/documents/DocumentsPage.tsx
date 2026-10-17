import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, FileImage, FileText, FolderArchive, Lock, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import {
  DOCUMENT_TYPE_LABEL,
  DOCUMENT_TYPE_OPTIONS,
  RECORD_TYPE_LABEL,
  RECORD_TYPE_OPTIONS,
  type DocumentItem,
  type DocumentRecordType,
  type DocumentType,
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
import { api, errorMessage, qs } from '@/lib/api';
import { formatBytes, formatDateTime, safeHref } from '@/lib/format';
import { ACCEPTED_TYPES, MAX_UPLOAD_MB, uploadDocument, validateFile } from './upload';

function UploadDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recordType, setRecordType] = useState<DocumentRecordType>('umum');
  const [documentType, setDocumentType] = useState<DocumentType>('bukti');
  const [recordRef, setRecordRef] = useState('umum');
  const [problem, setProblem] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Pilih file terlebih dahulu.');
      return uploadDocument(file, { record_type: recordType, record_ref: recordRef.trim() || 'umum', document_type: documentType });
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Dokumen tersimpan', doc.original_filename);
      onClose();
    },
    onError: (e) => setProblem(errorMessage(e)),
  });

  const pick = (f: File | undefined) => {
    setFile(f ?? null);
    setProblem(f ? validateFile(f) : null);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Unggah dokumen"
      description={`PDF, JPG, atau PNG, maksimal ${MAX_UPLOAD_MB} MB. Isi file diperiksa di server.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={upload.isPending}>
            Batal
          </Button>
          <Button type="submit" form="upload-form" loading={upload.isPending} disabled={!file || !!validateFile(file)} icon={<Upload className="size-4" aria-hidden />}>
            Unggah
          </Button>
        </>
      }
    >
      <form
        id="upload-form"
        className="space-y-5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setProblem(null);
          upload.mutate();
        }}
      >
        {problem && <Alert tone="danger">{problem}</Alert>}
        <div>
          <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} className="sr-only" id="berkas" onChange={(e) => pick(e.target.files?.[0])} />
          <label
            htmlFor="berkas"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/50 focus-within:border-brand-600"
          >
            <Upload className="size-7 text-brand-700" aria-hidden />
            <span className="font-bold text-slate-900">{file ? file.name : 'Pilih berkas dari perangkat'}</span>
            <span className="text-sm text-slate-600">{file ? formatBytes(file.size) : 'Klik untuk memilih PDF, JPG, atau PNG'}</span>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Terkait" required>
            {(c) => (
              <Select {...c} value={recordType} onChange={(e) => setRecordType(e.target.value as DocumentRecordType)}>
                {RECORD_TYPE_OPTIONS.filter((o) => o.value === 'umum' || o.value === 'kejuaraan' || o.value === 'institusi').map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Jenis dokumen" required>
            {(c) => (
              <Select {...c} value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
                {DOCUMENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Referensi" hint="Huruf, angka, dan tanda hubung (mis. tahun atau kode kegiatan).">
          {(c) => <Input {...c} value={recordRef} onChange={(e) => setRecordRef(e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64))} />}
        </Field>
        <p className="text-sm text-slate-600">Untuk melampirkan dokumen pada prestasi/sertifikasi/rekognisi, gunakan tombol Unggah di formulir data tersebut agar dokumen ikut terkunci saat terkirim.</p>
      </form>
    </Dialog>
  );
}

export default function DocumentsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<DocumentItem | null>(null);
  const [removing, setRemoving] = useState<DocumentItem | null>(null);

  const q = useQuery({
    queryKey: ['documents', { page, type }],
    queryFn: () => api<Page<DocumentItem>>(`/api/documents${qs({ page, page_size: 15, record_type: type })}`),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (d: DocumentItem) => api(`/api/documents/${d.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Dokumen dihapus');
      setRemoving(null);
    },
    onError: (e) => {
      toast.error('Gagal menghapus', errorMessage(e));
      setRemoving(null);
    },
  });

  const copy = async (d: DocumentItem) => {
    try {
      await navigator.clipboard.writeText(d.public_url);
      toast.success('Tautan disalin');
    } catch {
      toast.error('Tidak dapat menyalin', 'Salin tautan secara manual dari tombol Lihat.');
    }
  };

  const items = q.data?.items ?? [];
  const previewHref = safeHref(preview?.public_url);

  return (
    <>
      <PageHeader
        title="Brankas Dokumen"
        description="Berkas bukti tersimpan dengan tautan publik permanen yang sulit ditebak. Dokumen yang sudah terkirim ke SIMKATMAWA terkunci dan tidak bisa dihapus."
        actions={can('document.upload') && <Button icon={<Upload className="size-4" aria-hidden />} onClick={() => setUploading(true)}>Unggah dokumen</Button>}
      />
      <Card>
        <div className="border-b border-line p-4">
          <Field label="Filter terkait" className="w-full sm:w-64">
            {(c) => (
              <Select {...c} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                <option value="">Semua dokumen</option>
                {RECORD_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {q.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={<FolderArchive className="size-6" aria-hidden />} title="Belum ada dokumen" description="Unggah sertifikat, daftar peserta, atau bukti lain untuk disimpan dengan aman." />
        ) : (
          <>
            <TableWrap>
              <Table>
                <caption className="sr-only">Daftar dokumen</caption>
                <thead>
                  <tr>
                    <Th>Berkas</Th>
                    <Th>Terkait</Th>
                    <Th>Ukuran</Th>
                    <Th>Diunggah</Th>
                    <Th>
                      <span className="sr-only">Aksi</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <Tr key={d.id}>
                      <Td className="max-w-sm">
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                            {d.mime_type === 'application/pdf' ? <FileText className="size-5" aria-hidden /> : <FileImage className="size-5" aria-hidden />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">{d.original_filename}</p>
                            <p className="font-mono text-xs text-slate-500" title={d.checksum_sha256}>
                              sha256 {d.checksum_sha256.slice(0, 12)}…
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <p>{RECORD_TYPE_LABEL[d.record_type]}</p>
                        <p className="text-slate-600">{DOCUMENT_TYPE_LABEL[d.document_type]}</p>
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums">{formatBytes(d.size_bytes)}</Td>
                      <Td className="whitespace-nowrap">
                        {formatDateTime(d.created_at)}
                        {d.is_locked && (
                          <Badge tone="emerald" className="ml-2">
                            <Lock className="size-3" aria-hidden /> Terkunci
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        <div className="flex justify-end">
                          <IconButton label={`Lihat ${d.original_filename}`} onClick={() => setPreview(d)}>
                            <Eye className="size-4" aria-hidden />
                          </IconButton>
                          <IconButton label={`Salin tautan ${d.original_filename}`} onClick={() => void copy(d)}>
                            <Copy className="size-4" aria-hidden />
                          </IconButton>
                          {can('document.delete') && !d.is_locked && (
                            <IconButton label={`Hapus ${d.original_filename}`} onClick={() => setRemoving(d)} className="text-rose-700 hover:bg-rose-50">
                              <Trash2 className="size-4" aria-hidden />
                            </IconButton>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            {q.data && <Pagination page={q.data.page} totalPages={q.data.total_pages} totalItems={q.data.total_items} onPage={setPage} />}
          </>
        )}
      </Card>

      {uploading && <UploadDialog onClose={() => setUploading(false)} />}

      <Dialog open={preview !== null} onClose={() => setPreview(null)} size="xl" title={preview?.original_filename ?? 'Pratinjau'} description={preview ? `${RECORD_TYPE_LABEL[preview.record_type]} · ${DOCUMENT_TYPE_LABEL[preview.document_type]}` : undefined}>
        {preview && previewHref ? (
          <div className="space-y-3">
            {preview.mime_type === 'application/pdf' ? (
              <iframe title={`Pratinjau ${preview.original_filename}`} src={previewHref} sandbox="" referrerPolicy="no-referrer" className="h-[65dvh] w-full rounded-lg ring-1 ring-line" />
            ) : (
              <img src={previewHref} alt={preview.original_filename} referrerPolicy="no-referrer" className="mx-auto max-h-[65dvh] rounded-lg ring-1 ring-line" />
            )}
            <a href={previewHref} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-bold text-brand-800 underline underline-offset-2">
              Buka di tab baru
            </a>
          </div>
        ) : (
          <Alert tone="danger">Tautan dokumen tidak valid.</Alert>
        )}
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="Hapus dokumen?"
        tone="danger"
        confirmLabel="Hapus"
        loading={remove.isPending}
        message={<>Berkas <strong>{removing?.original_filename}</strong> akan dihapus dari penyimpanan. Tautan publiknya tidak akan berfungsi lagi.</>}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}
