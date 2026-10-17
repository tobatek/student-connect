import { Check, Circle, KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { checkPassword, isStrong } from '@/lib/password';

export default function ChangePasswordPage() {
  const { me, changePassword } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const forced = me.user.must_change_password;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const checks = checkPassword(next, me.user.email);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && isStrong(next, me.user.email) && confirm === next;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFields({});
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success('Kata sandi diperbarui', 'Sesi lain telah dikeluarkan demi keamanan.');
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setFields(err.fieldErrors);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-4 py-10">
      <Card className="w-full animate-rise p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{forced ? 'Buat kata sandi baru' : 'Ganti kata sandi'}</h1>
            <p className="text-sm text-slate-600">{forced ? 'Kata sandi sementara Anda harus diganti sebelum melanjutkan.' : 'Semua sesi lain akan dikeluarkan setelah kata sandi diganti.'}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Kata sandi saat ini" required error={fields.current_password}>
            {(c) => <Input {...c} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
          <Field label="Kata sandi baru" required error={fields.new_password}>
            {(c) => <Input {...c} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label="Syarat kata sandi">
            {checks.map((c) => (
              <li key={c.label} className={cn('flex items-center gap-2', c.ok ? 'text-emerald-800' : 'text-slate-600')}>
                {c.ok ? <Check className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
                {c.label}
                <span className="sr-only">{c.ok ? '(terpenuhi)' : '(belum terpenuhi)'}</span>
              </li>
            ))}
          </ul>
          <Field label="Ulangi kata sandi baru" required error={mismatch ? 'Kata sandi tidak sama.' : undefined}>
            {(c) => <Input {...c} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {!forced && (
              <Button variant="secondary" onClick={() => navigate(-1)}>
                Batal
              </Button>
            )}
            <Button type="submit" loading={busy} disabled={!canSubmit}>
              Simpan kata sandi
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
