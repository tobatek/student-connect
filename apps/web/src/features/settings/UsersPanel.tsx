import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ROLE_LABEL, ROLE_OPTIONS, type Role, type UserView } from '@students-connect/contracts';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { checkPassword, isStrong } from '@/lib/password';

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const [form, setForm] = useState({ email: '', name: '', role: 'MAHASISWA' as Role, password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const roles = me.user.role === 'SUPER_ADMIN' ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r.value !== 'SUPER_ADMIN');

  const create = useMutation({
    mutationFn: () => api<UserView>('/api/users', { method: 'POST', body: { ...form, email: form.email.trim(), name: form.name.trim() } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Pengguna dibuat', 'Mereka wajib mengganti kata sandi sementara saat login pertama.');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      else if (e instanceof ApiError && e.status === 409) setErrors({ email: 'Email sudah terdaftar.' });
      else toast.error('Gagal membuat pengguna', errorMessage(e));
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Tambah pengguna"
      description="Tidak ada pendaftaran mandiri. Berikan kata sandi sementara yang kuat secara aman."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Batal
          </Button>
          <Button type="submit" form="user-form" loading={create.isPending} disabled={!form.email || !form.name || !isStrong(form.password, form.email)}>
            Buat pengguna
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        noValidate
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setErrors({});
          create.mutate();
        }}
      >
        <Field label="Nama lengkap" required error={errors.name}>
          {(c) => <Input {...c} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label="Email" required error={errors.email}>
          {(c) => <Input {...c} type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="Peran" required error={errors.role}>
          {(c) => (
            <Select {...c} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Kata sandi sementara" required error={errors.password}>
          {(c) => <Input {...c} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <ul className="grid gap-1 text-sm sm:grid-cols-2" aria-label="Syarat kata sandi">
          {checkPassword(form.password, form.email).map((c) => (
            <li key={c.label} className={c.ok ? 'text-emerald-800' : 'text-slate-600'}>
              {c.ok ? '✓' : '○'} {c.label}
            </li>
          ))}
        </ul>
      </form>
    </Dialog>
  );
}

function ResetDialog({ user, onClose }: { user: UserView; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api(`/api/users/${user.id}/reset-password`, { method: 'POST', body: { password } }),
    onSuccess: () => {
      toast.success('Kata sandi direset', 'Semua sesi pengguna dikeluarkan.');
      onClose();
    },
    onError: (e) => toast.error('Gagal mereset', errorMessage(e)),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Reset kata sandi"
      description={user.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={reset.isPending}>
            Batal
          </Button>
          <Button loading={reset.isPending} disabled={!isStrong(password, user.email)} onClick={() => reset.mutate()}>
            Reset
          </Button>
        </>
      }
    >
      <Field label="Kata sandi sementara baru" required hint="Pengguna wajib menggantinya saat login berikutnya.">
        {(c) => <Input {...c} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

export function UsersPanel() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserView | null>(null);
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<UserView[]>('/api/users') });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ role: Role; is_active: boolean }> }) => api<UserView>(`/api/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Pengguna diperbarui');
    },
    onError: (e) => toast.error('Gagal memperbarui', errorMessage(e)),
  });

  if (q.isPending) return <Skeleton className="h-72" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;

  return (
    <Card>
      <CardHeader title="Pengguna" description="Perubahan peran atau status langsung mengeluarkan semua sesi pengguna tersebut." actions={<Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>Tambah pengguna</Button>} />
      <TableWrap>
        <Table>
          <caption className="sr-only">Daftar pengguna</caption>
          <thead>
            <tr>
              <Th>Pengguna</Th>
              <Th>Peran</Th>
              <Th>Status</Th>
              <Th>Login terakhir</Th>
              <Th>
                <span className="sr-only">Aksi</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((u) => {
              const self = u.id === me.user.id;
              const locked = u.role === 'SUPER_ADMIN' && me.user.role !== 'SUPER_ADMIN';
              return (
                <Tr key={u.id}>
                  <Td>
                    <p className="font-bold text-slate-900">
                      {u.name} {self && <Badge tone="sky">Anda</Badge>}
                    </p>
                    <p className="text-slate-600">{u.email}</p>
                  </Td>
                  <Td>
                    <label className="sr-only" htmlFor={`role-${u.id}`}>
                      Peran {u.name}
                    </label>
                    <Select id={`role-${u.id}`} className="h-10 w-52 text-sm" disabled={self || locked || patch.isPending} value={u.role} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value as Role } })}>
                      {ROLE_OPTIONS.filter((r) => r.value !== 'SUPER_ADMIN' || me.user.role === 'SUPER_ADMIN' || u.role === 'SUPER_ADMIN').map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Badge tone={u.is_active ? 'emerald' : 'slate'} dot>
                      {u.is_active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                    {u.must_change_password && <Badge tone="amber" className="ml-1.5">Sandi sementara</Badge>}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDateTime(u.last_login_at)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton label={`Reset kata sandi ${u.name}`} disabled={locked} onClick={() => setResetting(u)}>
                        <KeyRound className="size-4" aria-hidden />
                      </IconButton>
                      <IconButton label={u.is_active ? `Nonaktifkan ${u.name}` : `Aktifkan ${u.name}`} disabled={self || locked || patch.isPending} onClick={() => patch.mutate({ id: u.id, body: { is_active: !u.is_active } })}>
                        {u.is_active ? <UserX className="size-4" aria-hidden /> : <UserCheck className="size-4" aria-hidden />}
                      </IconButton>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      <div className="border-t border-line p-4">
        <Alert tone="info">Peran: {Object.values(ROLE_LABEL).join(', ')}.</Alert>
      </div>
      {creating && <NewUserDialog onClose={() => setCreating(false)} />}
      {resetting && <ResetDialog user={resetting} onClose={() => setResetting(null)} />}
    </Card>
  );
}
