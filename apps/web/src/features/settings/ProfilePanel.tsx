import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { Me, TenantView } from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';

export function ProfilePanel() {
  const { me, can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const editable = can('tenant.manage');
  const [form, setForm] = useState({
    nama_pt: me.tenant.nama_pt,
    kode_pt: me.tenant.kode_pt,
    tahun_aktif: String(me.tenant.tahun_aktif),
    allow_kab_rekognisi: me.tenant.allow_kab_rekognisi,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      api<TenantView>('/api/tenant', { method: 'PUT', body: { ...form, tahun_aktif: Number(form.tahun_aktif) } }),
    onSuccess: (tenant) => {
      qc.setQueryData<Me | null>(['me'], (old) => (old ? { ...old, tenant } : old));
      setErrors({});
      toast.success('Profil PT tersimpan');
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      else toast.error('Gagal menyimpan', errorMessage(e));
    },
  });

  return (
    <Card>
      <CardHeader title="Profil perguruan tinggi" description="Kode PT dan tahun diisi server SIMKATMAWA berdasarkan akun yang login; nilai di sini hanya untuk tampilan dan arsip." />
      <form
        className="space-y-5 p-5"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {!editable && <Alert tone="info">Hanya Admin PT yang dapat mengubah profil.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama perguruan tinggi" required error={errors.nama_pt} className="sm:col-span-2">
            {(c) => <Input {...c} disabled={!editable} value={form.nama_pt} onChange={(e) => setForm({ ...form, nama_pt: e.target.value })} />}
          </Field>
          <Field label="Kode PT" required error={errors.kode_pt}>
            {(c) => <Input {...c} disabled={!editable} value={form.kode_pt} onChange={(e) => setForm({ ...form, kode_pt: e.target.value })} />}
          </Field>
          <Field label="Tahun aktif" required error={errors.tahun_aktif}>
            {(c) => <Input {...c} inputMode="numeric" disabled={!editable} value={form.tahun_aktif} onChange={(e) => setForm({ ...form, tahun_aktif: e.target.value.replace(/\D/g, '').slice(0, 4) })} />}
          </Field>
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" disabled={!editable} checked={form.allow_kab_rekognisi} onChange={(e) => setForm({ ...form, allow_kab_rekognisi: e.target.checked })} className="mt-1 size-5 accent-brand-700" />
          <span>
            <span className="block font-bold text-slate-900">Izinkan level Kabupaten/Kota pada Rekognisi</span>
            <span className="block text-sm text-slate-600">Dokumentasi API mencantumkan KAB, tetapi form web SIMKATMAWA hanya PROV, NAS, dan INT. Aktifkan setelah dikonfirmasi ke pengelola.</span>
          </span>
        </label>
        {editable && (
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>
              Simpan profil
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
