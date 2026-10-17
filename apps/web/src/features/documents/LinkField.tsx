import { ExternalLink, Paperclip } from 'lucide-react';
import { useRef, useState } from 'react';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { safeHref } from '@/lib/format';
import { ACCEPTED_TYPES, uploadDocument, validateFile, type UploadTarget } from './upload';

/**
 * Isian tautan bukti. SIMKATMAWA menerima URL, jadi pengguna dapat menempel tautan sendiri atau
 * mengunggah berkas (disimpan di storage kampus dan tautan publik permanen terisi otomatis).
 */
export function LinkField({
  label,
  value,
  onChange,
  error,
  required,
  hint,
  upload,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  hint?: string;
  /** Tanpa target, unggah dinonaktifkan (mis. record belum disimpan). */
  upload?: UploadTarget | null;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const href = safeHref(value);

  const onFile = async (file: File | undefined) => {
    if (!file || !upload) return;
    const problem = validateFile(file);
    if (problem) {
      toast.error('File ditolak', problem);
      return;
    }
    setBusy(true);
    try {
      const doc = await uploadDocument(file, upload);
      onChange(doc.public_url);
      toast.success('File terunggah', doc.original_filename);
    } catch (err) {
      toast.error('Unggah gagal', errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Field label={label} required={required} error={error} hint={hint}>
      {(c) => (
        <div className="flex gap-2">
          <Input {...c} type="url" inputMode="url" placeholder="https://…" value={value} onChange={(e) => onChange(e.target.value)} />
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Buka tautan ${label}`} className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
              <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
          <input ref={input} type="file" accept={ACCEPTED_TYPES} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button
            variant="secondary"
            loading={busy}
            disabled={!upload}
            title={upload ? 'Unggah berkas' : 'Simpan draf dulu untuk mengaktifkan unggah berkas'}
            onClick={() => input.current?.click()}
            icon={<Paperclip className="size-4" aria-hidden />}
            aria-label={`Unggah berkas untuk ${label}`}
          >
            <span className="hidden sm:inline">Unggah</span>
          </Button>
        </div>
      )}
    </Field>
  );
}
