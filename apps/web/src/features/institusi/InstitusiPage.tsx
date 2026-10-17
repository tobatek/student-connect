import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Lock, Save, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  INDICATORS,
  INDICATOR_GROUPS,
  LEVEL_KELEMBAGAAN_LABEL,
  SECTION_TITLE,
  type InstitusiInput,
  type InstitusiReport,
} from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Alert, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { LinkField } from '@/features/documents/LinkField';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRupiah } from '@/lib/format';

type Section = 'A' | 'B' | 'C' | 'D' | 'E';
interface IndState {
  checked: boolean;
  url: string;
}
interface FormState {
  ind: Record<string, IndState>;
  beasiswa: string;
  level: string;
  anggaranPt: string;
  anggaranMhs: string;
}

const toForm = (r: InstitusiReport): FormState => ({
  ind: Object.fromEntries(r.indikator.map((i) => [i.id, { checked: i.checked, url: i.url ?? '' }])),
  beasiswa: String(r.jumlah_penerima_beasiswa_non_apbn),
  level: r.level_kelembagaan ? String(r.level_kelembagaan) : '',
  anggaranPt: String(r.total_anggaran_pt),
  anggaranMhs: String(r.total_anggaran_kemahasiswaan),
});

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 15);

function Editor({ report, year }: { report: InstitusiReport; year: number }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const locked = report.status === 'SUBMITTED';
  const writable = can('institusi.write') && !locked;

  const [form, setForm] = useState<FormState>(() => toForm(report));
  const [section, setSection] = useState<Section>('A');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmFinal, setConfirmFinal] = useState(false);

  const counted = useMemo(() => INDICATORS.filter((i) => form.ind[i.id]?.checked && form.ind[i.id]?.url.trim()).length, [form.ind]);
  const missingLinks = INDICATORS.filter((i) => form.ind[i.id]?.checked && !form.ind[i.id]?.url.trim()).length;
  const pct = Math.round((counted / INDICATORS.length) * 100);
  const ratio = Number(form.anggaranPt) > 0 ? (Number(form.anggaranMhs) / Number(form.anggaranPt)) * 100 : 0;

  const buildInput = (finalize: boolean): InstitusiInput => ({
    indikator: INDICATORS.map((i) => ({ id: i.id, checked: form.ind[i.id]?.checked ?? false, url: form.ind[i.id]?.url.trim() || null })),
    jumlah_penerima_beasiswa_non_apbn: Number(form.beasiswa || 0),
    level_kelembagaan: form.level ? (Number(form.level) as 1 | 2 | 3) : null,
    total_anggaran_pt: Number(form.anggaranPt || 0),
    total_anggaran_kemahasiswaan: Number(form.anggaranMhs || 0),
    finalize,
  });

  const save = useMutation({
    mutationFn: (finalize: boolean) => api<InstitusiReport>(`/api/institusi/${year}`, { method: 'PUT', body: buildInput(finalize) }),
    onSuccess: (saved, finalize) => {
      setErrors({});
      qc.setQueryData(['institusi', year], saved);
      toast.success(finalize ? 'Laporan disimpan final' : 'Draf tersimpan');
      setConfirmFinal(false);
    },
    onError: (e) => {
      setConfirmFinal(false);
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
        setErrors(e.fieldErrors);
        toast.error('Periksa isian', 'Ada isian yang belum memenuhi syarat.');
      } else toast.error('Gagal menyimpan', errorMessage(e));
    },
  });

  const setInd = (id: string, patch: Partial<IndState>) => setForm((f) => ({ ...f, ind: { ...f.ind, [id]: { checked: false, url: '', ...f.ind[id], ...patch } } }));
  const sectionCount = (s: Section) => INDICATORS.filter((i) => i.section === s && form.ind[i.id]?.checked).length;

  const tabs = (['A', 'B', 'C', 'D', 'E'] as Section[]).map((s) => ({
    id: s,
    label: `Seksi ${s}`,
    badge: s === 'D' ? undefined : (
      <span className="rounded-full bg-slate-200 px-1.5 text-xs tabular-nums text-slate-800">
        {sectionCount(s)}/{INDICATORS.filter((i) => i.section === s).length}
      </span>
    ),
  }));

  return (
    <div className="space-y-6">
      {locked && (
        <Alert tone="success" title="Laporan sudah disimpan final">
          <p>Terakhir diperbarui {formatDateTime(report.updated_at)}. Laporan final tidak dapat diubah di sini.</p>
        </Alert>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative grid size-20 place-items-center" role="img" aria-label={`Kelengkapan ${pct} persen`}>
            <svg viewBox="0 0 36 36" className="size-20 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-slate-200" />
              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} className="stroke-brand-600 transition-[stroke-dasharray] duration-500" />
            </svg>
            <span className="absolute text-lg font-bold tabular-nums text-slate-900">{pct}%</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-slate-900">
              {counted} dari {INDICATORS.length} indikator terpenuhi
            </p>
            <p className="text-sm text-slate-600">Indikator dihitung bila dicentang dan memiliki tautan dokumen.</p>
            {missingLinks > 0 && (
              <p className="mt-1 text-sm font-bold text-rose-700">{missingLinks} indikator dicentang tetapi belum ada tautan dokumen.</p>
            )}
          </div>
          <Badge tone={locked ? 'emerald' : 'amber'} dot>
            {locked ? 'Final' : 'Draf'}
          </Badge>
        </div>
      </Card>

      <Tabs label="Seksi laporan" items={tabs} value={section} onChange={setSection} />

      <div role="tabpanel" id={`panel-${section}`} aria-labelledby={`tab-${section}`} className="space-y-5">
        <h2 className="text-lg font-bold text-slate-900">
          Seksi {section}. {SECTION_TITLE[section]}
        </h2>

        {section === 'D' ? (
          <Card className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Total anggaran perguruan tinggi (Rp)" required error={errors.total_anggaran_pt}>
                {(c) => <Input {...c} inputMode="numeric" disabled={!writable} value={form.anggaranPt} onChange={(e) => setForm({ ...form, anggaranPt: digits(e.target.value) })} />}
              </Field>
              <Field label="Total anggaran kemahasiswaan (Rp)" required error={errors.total_anggaran_kemahasiswaan}>
                {(c) => <Input {...c} inputMode="numeric" disabled={!writable} value={form.anggaranMhs} onChange={(e) => setForm({ ...form, anggaranMhs: digits(e.target.value) })} />}
              </Field>
            </div>
            <div className="rounded-xl bg-brand-50 px-4 py-3 text-brand-900 ring-1 ring-brand-100">
              Porsi anggaran kemahasiswaan: <strong className="tabular-nums">{ratio.toFixed(2)}%</strong> dari total ({formatRupiah(Number(form.anggaranMhs || 0))} dari {formatRupiah(Number(form.anggaranPt || 0))})
            </div>
          </Card>
        ) : (
          INDICATOR_GROUPS.filter((g) => g.section === section).map((g) => (
            <Card key={g.code}>
              <CardHeader title={`${g.code} · ${g.title}`} description={`${g.count} butir`} />
              {g.code === 'A.2a' && (
                <div className="border-b border-line p-5">
                  <Field label="2.b Jumlah penerima beasiswa non-APBN" error={errors.jumlah_penerima_beasiswa_non_apbn} hint="Isian angka (jumlah mahasiswa).">
                    {(c) => <Input {...c} inputMode="numeric" disabled={!writable} className="max-w-48" value={form.beasiswa} onChange={(e) => setForm({ ...form, beasiswa: digits(e.target.value) })} />}
                  </Field>
                </div>
              )}
              {g.code === 'B.1' && (
                <div className="border-b border-line p-5">
                  <Field label="Level kelembagaan" error={errors.level_kelembagaan}>
                    {(c) => (
                      <Select {...c} disabled={!writable} className="max-w-60" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                        <option value="">Belum dipilih</option>
                        {Object.entries(LEVEL_KELEMBAGAAN_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
              )}
              <ul className="divide-y divide-line">
                {INDICATORS.filter((i) => i.group === g.code).map((i) => {
                  const st = form.ind[i.id] ?? { checked: false, url: '' };
                  const checkId = `ind-${i.id}`;
                  const err = errors[`indikator.${i.id}`] ?? (st.checked && !st.url.trim() ? 'Wajib melampirkan tautan dokumen.' : undefined);
                  return (
                    <li key={i.id} className={cn('space-y-3 px-5 py-4', st.checked && 'bg-brand-50/40')}>
                      <div className="flex items-start gap-3">
                        <input
                          id={checkId}
                          type="checkbox"
                          disabled={!writable}
                          checked={st.checked}
                          onChange={(e) => setInd(i.id, { checked: e.target.checked })}
                          className="mt-1 size-5 shrink-0 rounded border-slate-400 accent-brand-700"
                        />
                        <label htmlFor={checkId} className="min-w-0 flex-1 cursor-pointer">
                          <span className="font-mono text-xs text-slate-500">{i.id}</span>
                          <span className="block font-bold text-slate-900">{i.label}</span>
                        </label>
                        {st.checked && st.url.trim() && <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-600" aria-label="Lengkap" />}
                      </div>
                      {st.checked && (
                        <div className="pl-8">
                          <LinkField
                            label="Tautan dokumen bukti"
                            required
                            value={st.url}
                            error={err}
                            onChange={(v) => setInd(i.id, { url: v })}
                            upload={writable ? { record_type: 'institusi', record_ref: String(year), document_type: 'bukti', tahun: year } : null}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))
        )}
      </div>

      {writable && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Button variant="secondary" icon={<Save className="size-4" aria-hidden />} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>
            Simpan draf
          </Button>
          <Button icon={<Send className="size-4" aria-hidden />} disabled={missingLinks > 0} onClick={() => setConfirmFinal(true)}>
            Simpan laporan
          </Button>
        </div>
      )}
      {locked && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Lock className="size-4" aria-hidden /> Laporan final bersifat read-only.
        </p>
      )}

      <ConfirmDialog
        open={confirmFinal}
        title="Simpan laporan sebagai final?"
        confirmLabel="Simpan final"
        loading={save.isPending}
        message="Setelah disimpan final, laporan tahun ini tidak dapat diubah di Student Connect. Pastikan seluruh tautan dokumen sudah benar."
        onConfirm={() => save.mutate(true)}
        onClose={() => setConfirmFinal(false)}
      />
    </div>
  );
}

export default function InstitusiPage() {
  const { me } = useAuth();
  const [year, setYear] = useState(me.tenant.tahun_aktif);
  const q = useQuery({ queryKey: ['institusi', year], queryFn: () => api<InstitusiReport>(`/api/institusi/${year}`) });
  const years = [me.tenant.tahun_aktif + 1, me.tenant.tahun_aktif, me.tenant.tahun_aktif - 1, me.tenant.tahun_aktif - 2];

  return (
    <>
      <PageHeader
        title="Institusi"
        description="Laporan tahunan tata kelola kemahasiswaan. Setiap indikator yang dicentang wajib dilengkapi tautan dokumen."
        actions={
          <Field label="Tahun laporan" className="w-40">
            {(c) => (
              <Select {...c} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        }
      />
      {q.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <Editor key={`${year}-${q.data.updated_at ?? 'baru'}`} report={q.data} year={year} />
      )}
    </>
  );
}
