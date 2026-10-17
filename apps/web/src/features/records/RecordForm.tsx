import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  BENTUK_OPTIONS,
  JENIS_REKOGNISI_OPTIONS,
  KATEGORI_OPTIONS,
  KELOMPOK_OPTIONS,
  LEVEL_OPTIONS,
  PERINGKAT_OPTIONS,
  type LecturerOption,
  type RecordBase,
  type RecordInput,
  type RecordKind,
  type StudentOption,
} from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { LinkField } from '@/features/documents/LinkField';
import { api, ApiError, errorMessage } from '@/lib/api';
import { today } from '@/lib/format';
import { KINDS } from './kinds';
import { LookupPicker } from './LookupPicker';

/** UUID untuk draf baru (fallback bila crypto.randomUUID tidak tersedia, mis. HTTP non-aman). */
const newRef = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

interface FormState {
  nama: string;
  level: string;
  penyelenggara: string;
  url_peserta: string;
  url_sertifikat: string;
  tgl_sertifikat: string;
  url_foto_upp: string;
  url_dokumen_undangan: string;
  keterangan: string;
  mahasiswa: { nim: string; nama: string }[];
  dosen: { nuptk: string; nama: string; url_surat_tugas: string }[];
  kategori: string;
  cabang: string;
  peringkat: string;
  jumlah_unit_peserta: string;
  kelompok_prestasi: string;
  bentuk: string;
  jenis: string;
}

const EMPTY: FormState = {
  nama: '',
  level: '',
  penyelenggara: '',
  url_peserta: '',
  url_sertifikat: '',
  tgl_sertifikat: '',
  url_foto_upp: '',
  url_dokumen_undangan: '',
  keterangan: '',
  mahasiswa: [],
  dosen: [],
  kategori: '',
  cabang: '',
  peringkat: '',
  jumlah_unit_peserta: '',
  kelompok_prestasi: '',
  bentuk: '',
  jenis: '',
};

const fromRecord = (r: RecordBase): FormState => ({
  nama: r.nama,
  level: r.level,
  penyelenggara: r.penyelenggara,
  url_peserta: r.url_peserta,
  url_sertifikat: r.url_sertifikat,
  tgl_sertifikat: r.tgl_sertifikat,
  url_foto_upp: r.url_foto_upp ?? '',
  url_dokumen_undangan: r.url_dokumen_undangan ?? '',
  keterangan: r.keterangan ?? '',
  mahasiswa: r.mahasiswa.map((m) => ({ nim: m.nim, nama: m.nama })),
  dosen: r.dosen.map((d) => ({ nuptk: d.nuptk, nama: d.nama, url_surat_tugas: d.url_surat_tugas ?? '' })),
  kategori: r.kategori ?? '',
  cabang: r.cabang ?? '',
  peringkat: r.peringkat ?? '',
  jumlah_unit_peserta: r.jumlah_unit_peserta ?? '',
  kelompok_prestasi: r.kelompok_prestasi ?? '',
  bentuk: r.bentuk ?? '',
  jenis: r.jenis ?? '',
});

/** Hanya field yang dikenal backend yang dikirim (backend menolak field asing). */
export const toInput = (s: FormState, kind: RecordKind, version?: number): RecordInput => {
  const optional = (v: string) => (v.trim() === '' ? null : v.trim());
  const input: RecordInput = {
    nama: s.nama.trim(),
    level: s.level as RecordInput['level'],
    penyelenggara: s.penyelenggara.trim(),
    url_peserta: s.url_peserta.trim(),
    url_sertifikat: s.url_sertifikat.trim(),
    tgl_sertifikat: s.tgl_sertifikat,
    url_foto_upp: optional(s.url_foto_upp),
    url_dokumen_undangan: optional(s.url_dokumen_undangan),
    keterangan: optional(s.keterangan),
    mahasiswa: s.mahasiswa.map((m) => ({ nim: m.nim.trim(), nama: m.nama.trim() })),
    dosen: s.dosen.map((d) => ({ nuptk: d.nuptk.trim(), nama: d.nama.trim(), url_surat_tugas: optional(d.url_surat_tugas) })),
  };
  if (kind === 'prestasi-mandiri') {
    Object.assign(input, {
      kategori: s.kategori,
      cabang: s.cabang.trim(),
      peringkat: s.peringkat,
      jumlah_unit_peserta: s.jumlah_unit_peserta.trim(),
      kelompok_prestasi: s.kelompok_prestasi,
      bentuk: s.bentuk,
    });
  }
  if (kind === 'rekognisi') input.jenis = s.jenis as RecordInput['jenis'];
  if (version !== undefined) input.version = version;
  return input;
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-800">{title}</legend>
      {description && <p className="-mt-1 text-sm text-slate-600">{description}</p>}
      {children}
    </fieldset>
  );
}

export function RecordForm({ kind, record, open, onClose }: { kind: RecordKind; record?: RecordBase | null; open: boolean; onClose: () => void }) {
  const cfg = KINDS[kind];
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const [current, setCurrent] = useState<RecordBase | null>(record ?? null);
  // Akun mahasiswa: dirinya (NIM + nama dari Portal) langsung terisi dan tidak bisa diubah.
  const own = me.user.role === 'MAHASISWA' ? (me.student ?? null) : null;
  const ownMissing = me.user.role === 'MAHASISWA' && !own;
  const [form, setForm] = useState<FormState>(() => (record ? fromRecord(record) : { ...EMPTY, mahasiswa: own ? [{ nim: own.nim, nama: own.nama }] : [] }));
  // Draf baru memakai UUID dari klien sehingga berkas bisa diunggah dan tautannya terisi sebelum disimpan.
  const [draftRef] = useState(() => record?.id ?? newRef());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const levels = useMemo(
    () => (kind === 'rekognisi' && !me.tenant.allow_kab_rekognisi ? LEVEL_OPTIONS.filter((l) => l.value !== 'KAB') : LEVEL_OPTIONS),
    [kind, me.tenant.allow_kab_rekognisi],
  );
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const err = (key: string) => errors[key];

  const save = useMutation({
    mutationFn: (): Promise<RecordBase> =>
      current
        ? api<RecordBase>(`/api/records/${kind}/${current.id}`, { method: 'PUT', body: toInput(form, kind, current.version) })
        : api<RecordBase>(`/api/records/${kind}`, { method: 'POST', body: { ...toInput(form, kind), client_ref: draftRef } }),
    onSuccess: (saved) => {
      const wasNew = !current;
      setCurrent(saved);
      setErrors({});
      setFormError(null);
      void qc.invalidateQueries({ queryKey: ['records', kind] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (wasNew) toast.success('Draf tersimpan', 'Ajukan verifikasi dari daftar bila data sudah lengkap.');
      else {
        toast.success('Perubahan tersimpan');
        onClose();
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
        setErrors(e.fieldErrors);
        setFormError('Periksa kembali isian yang ditandai.');
      } else {
        setFormError(errorMessage(e));
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    save.mutate();
  };

  const upload = (documentType: 'sertifikat' | 'peserta' | 'foto-upp' | 'undangan') =>
    ({ record_type: kind, record_ref: current?.id ?? draftRef, document_type: documentType });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={current ? `Ubah ${cfg.title}` : `Tambah ${cfg.title}`}
      description={current ? 'Perubahan disimpan sebagai draf sampai diajukan untuk verifikasi.' : 'Data disimpan sebagai draf terlebih dahulu.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {current && !save.isPending ? 'Tutup' : 'Batal'}
          </Button>
          <Button type="submit" form="record-form" loading={save.isPending}>
            {current ? 'Simpan perubahan' : 'Simpan draf'}
          </Button>
        </>
      }
    >
      <form id="record-form" onSubmit={submit} className="space-y-8" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        {current && !record && <Alert tone="success">Draf tersimpan. Anda dapat melengkapi berkas bukti dengan tombol Unggah, lalu simpan perubahan.</Alert>}

        <Section title="Informasi utama">
          <Field label={cfg.nameLabel} required error={err('nama')}>
            {(c) => <Input {...c} value={form.nama} onChange={(e) => set('nama', e.target.value)} maxLength={300} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Level" required error={err('level')}>
              {(c) => (
                <Select {...c} value={form.level} onChange={(e) => set('level', e.target.value)}>
                  <option value="">Pilih level…</option>
                  {levels.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tanggal sertifikat" required error={err('tgl_sertifikat')}>
              {(c) => <Input {...c} type="date" max={today()} min="2000-01-01" value={form.tgl_sertifikat} onChange={(e) => set('tgl_sertifikat', e.target.value)} />}
            </Field>
          </div>
          <Field label="Penyelenggara" required error={err('penyelenggara')}>
            {(c) => <Input {...c} value={form.penyelenggara} onChange={(e) => set('penyelenggara', e.target.value)} maxLength={300} />}
          </Field>

          {kind === 'prestasi-mandiri' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kategori" required error={err('kategori')}>
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
                <Field label="Cabang lomba" required error={err('cabang')}>
                  {(c) => <Input {...c} value={form.cabang} onChange={(e) => set('cabang', e.target.value)} maxLength={200} />}
                </Field>
                <Field label="Peringkat" required error={err('peringkat')}>
                  {(c) => (
                    <Select {...c} value={form.peringkat} onChange={(e) => set('peringkat', e.target.value)}>
                      <option value="">Pilih peringkat…</option>
                      {PERINGKAT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Jumlah unit peserta" required error={err('jumlah_unit_peserta')} hint="Jumlah PT (level nasional) atau negara (level internasional).">
                  {(c) => <Input {...c} inputMode="numeric" pattern="[0-9]*" value={form.jumlah_unit_peserta} onChange={(e) => set('jumlah_unit_peserta', e.target.value.replace(/\D/g, '').slice(0, 5))} />}
                </Field>
                <Field label="Kelompok prestasi" required error={err('kelompok_prestasi')}>
                  {(c) => (
                    <Select {...c} value={form.kelompok_prestasi} onChange={(e) => set('kelompok_prestasi', e.target.value)}>
                      <option value="">Pilih…</option>
                      {KELOMPOK_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Bentuk kegiatan" required error={err('bentuk')}>
                  {(c) => (
                    <Select {...c} value={form.bentuk} onChange={(e) => set('bentuk', e.target.value)}>
                      <option value="">Pilih…</option>
                      {BENTUK_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </>
          )}

          {kind === 'rekognisi' && (
            <Field label="Jenis rekognisi" required error={err('jenis')}>
              {(c) => (
                <Select {...c} value={form.jenis} onChange={(e) => set('jenis', e.target.value)}>
                  <option value="">Pilih jenis…</option>
                  {JENIS_REKOGNISI_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </Section>

        <Section title="Bukti dokumen" description="SIMKATMAWA menerima tautan. Tempel URL atau unggah berkas (PDF/JPG/PNG, maks 15 MB).">
          <LinkField label="Tautan daftar peserta" required value={form.url_peserta} onChange={(v) => set('url_peserta', v)} error={err('url_peserta')} upload={upload('peserta')} />
          <LinkField label="Tautan sertifikat" required value={form.url_sertifikat} onChange={(v) => set('url_sertifikat', v)} error={err('url_sertifikat')} upload={upload('sertifikat')} />
          <LinkField label="Tautan foto UPP" value={form.url_foto_upp} onChange={(v) => set('url_foto_upp', v)} error={err('url_foto_upp')} upload={upload('foto-upp')} />
          <LinkField label="Tautan dokumen undangan" value={form.url_dokumen_undangan} onChange={(v) => set('url_dokumen_undangan', v)} error={err('url_dokumen_undangan')} upload={upload('undangan')} />
        </Section>

        <Section
          title="Mahasiswa"
          description={own ? 'Data Anda terisi otomatis dari Portal. Tambahkan anggota tim lain dari daftar bila ada.' : 'Pilih dari data mahasiswa Portal. Nama mengikuti data resmi.'}
        >
          {ownMissing && (
            <Alert tone="warning">NIM Anda belum diterima dari Portal, jadi data belum bisa disimpan. Keluar lalu masuk lagi lewat Login dengan Portal, atau hubungi admin.</Alert>
          )}
          {err('mahasiswa') && <p role="alert" className="text-sm font-bold text-rose-700">{err('mahasiswa')}</p>}
          {form.mahasiswa.length > 0 && (
            <ul className="space-y-2">
              {form.mahasiswa.map((m, i) => {
                const isOwn = own?.nim === m.nim;
                const rowError = err(`mahasiswa[${i}].nim`) ?? err(`mahasiswa[${i}].nama`);
                return (
                  <li key={m.nim} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-900">{m.nama}</p>
                      <p className="text-sm text-slate-600">
                        NIM {m.nim}
                        {isOwn && ' · akun Anda, terisi otomatis dari Portal'}
                      </p>
                      {rowError && <p role="alert" className="text-sm font-bold text-rose-700">{rowError}</p>}
                    </div>
                    {!isOwn && (
                      <IconButton label={`Hapus ${m.nama}`} onClick={() => set('mahasiswa', form.mahasiswa.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" aria-hidden />
                      </IconButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <LookupPicker<StudentOption>
            label={form.mahasiswa.length ? 'Tambah mahasiswa' : 'Pilih mahasiswa'}
            kind="mahasiswa"
            minChars={2}
            exclude={form.mahasiswa.map((m) => m.nim)}
            optionOf={(s) => ({ value: s.nim, label: `${s.nama} · ${s.nim}${s.prodi ? ` · ${s.prodi}` : ''}`, raw: s })}
            onPick={(s) => set('mahasiswa', [...form.mahasiswa, { nim: s.nim, nama: s.nama }])}
          />
        </Section>

        <Section title="Dosen pendamping" description="Opsional. Pilih dari daftar dosen di Portal; NUPTK dan nama terisi otomatis.">
          {form.dosen.length > 0 && (
            <ul className="space-y-3">
              {form.dosen.map((d, i) => {
                const rowError = err(`dosen[${i}].nuptk`) ?? err(`dosen[${i}].nama`);
                return (
                  <li key={d.nuptk} className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900">{d.nama}</p>
                        <p className="text-sm text-slate-600">NUPTK {d.nuptk}</p>
                        {rowError && <p role="alert" className="text-sm font-bold text-rose-700">{rowError}</p>}
                      </div>
                      <IconButton label={`Hapus ${d.nama}`} onClick={() => set('dosen', form.dosen.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" aria-hidden />
                      </IconButton>
                    </div>
                    <LinkField
                      label="Tautan surat tugas"
                      value={d.url_surat_tugas}
                      onChange={(v) => set('dosen', form.dosen.map((x, j) => (j === i ? { ...x, url_surat_tugas: v } : x)))}
                      error={err(`dosen[${i}].url_surat_tugas`)}
                      upload={{ record_type: kind, record_ref: current?.id ?? draftRef, document_type: 'surat-tugas' }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <LookupPicker<LecturerOption>
            label="Tambah dosen pendamping"
            kind="dosen"
            minChars={0}
            exclude={form.dosen.map((d) => d.nuptk)}
            optionOf={(d) => ({ value: d.nuptk, label: `${d.nama} · NUPTK ${d.nuptk}${d.unit ? ` · ${d.unit}` : ''}`, raw: d })}
            onPick={(d) => set('dosen', [...form.dosen, { nuptk: d.nuptk, nama: d.nama, url_surat_tugas: '' }])}
          />
        </Section>

        <Section title="Catatan">
          <Field label="Keterangan" error={err('keterangan')}>
            {(c) => <Textarea {...c} value={form.keterangan} onChange={(e) => set('keterangan', e.target.value)} maxLength={1000} />}
          </Field>
        </Section>
      </form>
    </Dialog>
  );
}
