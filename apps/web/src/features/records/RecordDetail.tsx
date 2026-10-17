import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  BENTUK_LABEL,
  JENIS_REKOGNISI_LABEL,
  KATEGORI_LABEL,
  KELOMPOK_LABEL,
  LEVEL_LABEL,
  PERINGKAT_LABEL,
  type RecordBase,
} from '@students-connect/contracts';
import { StatusBadge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { formatDate, formatDateTime, safeHref } from '@/lib/format';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="min-w-0 break-words text-[0.95rem] font-bold text-slate-900">{children}</dd>
    </div>
  );
}

function Link({ url, label }: { url: string | null }  & { label?: string }) {
  const href = safeHref(url);
  if (!url) return <span className="font-normal text-slate-500">—</span>;
  if (!href) return <span className="font-normal text-rose-700">Tautan tidak valid</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-brand-800 underline underline-offset-2 hover:text-brand-900">
      <span className="truncate">{label ?? url}</span>
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  );
}

export function RecordDetail({ record, nameLabel, onClose }: { record: RecordBase | null; nameLabel: string; onClose: () => void }) {
  return (
    <Dialog open={record !== null} onClose={onClose} variant="drawer" title="Detail data" description={record ? record.nama : undefined}>
      {record && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={record.status} />
            {record.simkatmawa_id && <span className="text-sm text-slate-700">ID SIMKATMAWA <strong className="font-mono">{record.simkatmawa_id}</strong></span>}
          </div>

          {record.revision_note && (
            <Alert tone="warning" title="Catatan revisi dari verifikator">
              {record.revision_note}
            </Alert>
          )}
          {record.last_error && (
            <Alert tone="danger" title={`Pengiriman gagal (percobaan ke-${record.submission_attempts})`}>
              {record.last_error}
            </Alert>
          )}

          <dl className="divide-y divide-line">
            <Row label={nameLabel}>{record.nama}</Row>
            {record.jenis && <Row label="Jenis">{JENIS_REKOGNISI_LABEL[record.jenis]}</Row>}
            <Row label="Level">{LEVEL_LABEL[record.level]}</Row>
            {record.kategori && <Row label="Kategori">{KATEGORI_LABEL[record.kategori]}</Row>}
            {record.cabang && <Row label="Cabang">{record.cabang}</Row>}
            {record.peringkat && <Row label="Peringkat">{PERINGKAT_LABEL[record.peringkat]}</Row>}
            {record.kelompok_prestasi && <Row label="Kelompok">{KELOMPOK_LABEL[record.kelompok_prestasi]}</Row>}
            {record.bentuk && <Row label="Bentuk">{BENTUK_LABEL[record.bentuk]}</Row>}
            {record.jumlah_unit_peserta && <Row label="Unit peserta">{record.jumlah_unit_peserta}</Row>}
            <Row label="Penyelenggara">{record.penyelenggara}</Row>
            <Row label="Tanggal sertifikat">{formatDate(record.tgl_sertifikat)}</Row>
            <Row label="Daftar peserta"><Link url={record.url_peserta} /></Row>
            <Row label="Sertifikat"><Link url={record.url_sertifikat} /></Row>
            <Row label="Foto UPP"><Link url={record.url_foto_upp} /></Row>
            <Row label="Dokumen undangan"><Link url={record.url_dokumen_undangan} /></Row>
            <Row label="Keterangan">{record.keterangan ?? <span className="font-normal text-slate-500">—</span>}</Row>
          </dl>

          <section aria-labelledby="mhs">
            <h3 id="mhs" className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-800">
              Mahasiswa ({record.mahasiswa.length})
            </h3>
            <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
              {record.mahasiswa.map((m) => (
                <li key={m.nim} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="font-bold text-slate-900">{m.nama}</span>
                  <span className="font-mono text-sm text-slate-600">{m.nim}</span>
                </li>
              ))}
            </ul>
          </section>

          {record.dosen.length > 0 && (
            <section aria-labelledby="dsn">
              <h3 id="dsn" className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-800">
                Dosen pendamping ({record.dosen.length})
              </h3>
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {record.dosen.map((d) => (
                  <li key={d.nuptk} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span>
                      <span className="block font-bold text-slate-900">{d.nama}</span>
                      <span className="font-mono text-sm text-slate-600">{d.nuptk}</span>
                    </span>
                    {d.url_surat_tugas && <Link url={d.url_surat_tugas} label="Surat tugas" />}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-slate-500">
            Dibuat {formatDateTime(record.created_at)} · Diperbarui {formatDateTime(record.updated_at)}
            {record.sent_at && <> · Terkirim {formatDateTime(record.sent_at)}</>}
          </p>
        </div>
      )}
    </Dialog>
  );
}
