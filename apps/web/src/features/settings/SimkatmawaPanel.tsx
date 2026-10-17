import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, PlugZap, RefreshCw, Unplug } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { CredentialStatus } from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Alert, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const DEFAULT_URL = 'https://simkatmawa.kemdiktisaintek.go.id';

export function SimkatmawaPanel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can('credential.manage');
  const status = useQuery({ queryKey: ['simkatmawa-status'], queryFn: () => api<CredentialStatus>('/api/simkatmawa/status') });

  const [apiUrl, setApiUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const body = () => ({ api_url: apiUrl.trim() || undefined, email: email.trim(), password });
  const onError = (e: unknown) => {
    if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
    setNotice({ tone: 'danger', text: errorMessage(e) });
  };
  const refreshStatus = (data: CredentialStatus) => {
    qc.setQueryData(['simkatmawa-status'], data);
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; kode_pt: string | null }>('/api/simkatmawa/credentials/test', { method: 'POST', body: body() }),
    onSuccess: (r) => {
      setErrors({});
      setNotice({ tone: 'success', text: `Login berhasil${r.kode_pt ? ` (kode PT ${r.kode_pt})` : ''}. Kredensial belum disimpan.` });
    },
    onError,
  });
  const save = useMutation({
    mutationFn: () => api<CredentialStatus>('/api/simkatmawa/credentials', { method: 'PUT', body: body() }),
    onSuccess: (data) => {
      refreshStatus(data);
      setPassword('');
      setErrors({});
      setNotice(null);
      toast.success('Akun SIMKATMAWA terhubung', 'Password tersimpan terenkripsi di server.');
    },
    onError,
  });
  const refresh = useMutation({
    mutationFn: () => api<CredentialStatus>('/api/simkatmawa/refresh-token', { method: 'POST' }),
    onSuccess: (data) => {
      refreshStatus(data);
      toast.success('Token diperbarui');
    },
    onError: (e) => toast.error('Gagal memperbarui token', errorMessage(e)),
  });
  const disconnect = useMutation({
    mutationFn: () => api<CredentialStatus>('/api/simkatmawa/credentials', { method: 'DELETE' }),
    onSuccess: (data) => {
      refreshStatus(data);
      setDisconnecting(false);
      toast.success('Koneksi diputus', 'Kredensial dihapus dari server.');
    },
    onError: (e) => {
      setDisconnecting(false);
      toast.error('Gagal memutus koneksi', errorMessage(e));
    },
  });

  if (status.isPending) return <Skeleton className="h-72" />;
  if (status.isError) return <ErrorState message={errorMessage(status.error)} onRetry={() => void status.refetch()} />;
  const s = status.data;
  const canSubmit = email.trim().length > 0 && password.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader title={s.configured ? 'Perbarui kredensial' : 'Hubungkan akun SIMKATMAWA'} description="Gunakan akun PT di SIMKATMAWA. Password hanya dikirim ke server, diuji, lalu disimpan terenkripsi; tidak pernah ditampilkan kembali." />
        <form
          className="space-y-5 p-5"
          noValidate
          autoComplete="off"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setNotice(null);
            save.mutate();
          }}
        >
          {!manage && <Alert tone="info">Hanya Admin PT yang dapat mengelola koneksi.</Alert>}
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <Field label="URL API" error={errors.api_url} hint={`Kosongkan untuk memakai ${DEFAULT_URL}. Hanya host resmi yang diizinkan.`}>
            {(c) => <Input {...c} type="url" disabled={!manage} placeholder={DEFAULT_URL} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />}
          </Field>
          <Field label="Email akun SIMKATMAWA" required error={errors.email}>
            {(c) => <Input {...c} type="email" autoComplete="off" disabled={!manage} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={s.email ?? 'admin@kampus.ac.id'} />}
          </Field>
          <Field label="Password akun SIMKATMAWA" required error={errors.password}>
            {(c) => (
              <div className="relative">
                <Input {...c} type={reveal ? 'text' : 'password'} autoComplete="new-password" disabled={!manage} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
                <button type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={reveal} className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100">
                  {reveal ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                </button>
              </div>
            )}
          </Field>
          {manage && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={!canSubmit} loading={test.isPending} onClick={() => { setNotice(null); test.mutate(); }}>
                Uji koneksi
              </Button>
              <Button type="submit" disabled={!canSubmit} loading={save.isPending} icon={<PlugZap className="size-4" aria-hidden />}>
                Simpan &amp; hubungkan
              </Button>
            </div>
          )}
        </form>
      </Card>

      <Card className="h-fit">
        <CardHeader title="Status koneksi" />
        <div className="space-y-4 p-5">
          {s.configured ? (
            <>
              <Badge tone={s.is_connected ? 'emerald' : 'rose'} dot>
                {s.is_connected ? 'Terhubung' : 'Terputus'}
              </Badge>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-slate-600">Akun</dt>
                  <dd className="break-all font-bold text-slate-900">{s.email}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Server</dt>
                  <dd className="break-all font-bold text-slate-900">{s.api_url}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Terakhir dicek</dt>
                  <dd className="font-bold text-slate-900">{formatDateTime(s.last_checked_at)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Token berlaku hingga</dt>
                  <dd className="font-bold text-slate-900">{formatDateTime(s.token_expires_at)}</dd>
                </div>
              </dl>
              {s.last_error && <Alert tone="danger">{s.last_error}</Alert>}
              {manage && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" loading={refresh.isPending} icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => refresh.mutate()}>
                    Perbarui token
                  </Button>
                  <Button variant="ghost" size="sm" className="text-rose-700 hover:bg-rose-50" icon={<Unplug className="size-4" aria-hidden />} onClick={() => setDisconnecting(true)}>
                    Putuskan
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-700">Belum ada akun yang dihubungkan.</p>
          )}
          <p className="flex items-start gap-2 border-t border-line pt-4 text-sm text-slate-600">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            Kredensial dienkripsi AES-256-GCM dan terikat ke kampus Anda. Browser tidak pernah menerima password atau token.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={disconnecting}
        title="Putuskan koneksi SIMKATMAWA?"
        tone="danger"
        confirmLabel="Putuskan"
        loading={disconnect.isPending}
        message="Kredensial akan dihapus dari server dan pengiriman data berhenti sampai akun dihubungkan kembali."
        onConfirm={() => disconnect.mutate()}
        onClose={() => setDisconnecting(false)}
      />
    </div>
  );
}
