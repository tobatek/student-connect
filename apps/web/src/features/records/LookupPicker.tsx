import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Field, Input, Select } from '@/components/ui/Field';
import { api, qs } from '@/lib/api';
import { useDebounced } from './useDebounced';

export interface PickerOption<T> {
  /** Kunci unik (NIM / NUPTK). */
  value: string;
  label: string;
  raw: T;
}

/**
 * Pilihan dari data master Portal: kotak cari + daftar tarik-turun. Tidak ada isian bebas;
 * nilai yang dikirim ke backend selalu berasal dari hasil pencarian, dan backend memeriksanya lagi.
 */
export function LookupPicker<T>({
  label,
  kind,
  minChars,
  optionOf,
  onPick,
  exclude = [],
  error,
  hint,
}: {
  label: string;
  kind: 'mahasiswa' | 'dosen';
  /** Panjang kata kunci minimal sebelum mencari (daftar mahasiswa tidak ditampilkan utuh). */
  minChars: number;
  optionOf: (item: T) => PickerOption<T>;
  onPick: (item: T) => void;
  /** Kunci yang sudah dipilih di baris lain. */
  exclude?: string[];
  error?: string;
  hint?: string;
}) {
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 250);
  const ready = term.length >= minChars;
  const results = useQuery({
    queryKey: ['lookup', kind, term],
    queryFn: () => api<T[]>(`/api/lookups/${kind}${qs({ q: term })}`),
    enabled: ready,
    staleTime: 30_000,
  });
  const options = (results.data ?? []).map(optionOf).filter((o) => !exclude.includes(o.value));

  let status = hint;
  if (!ready) status = `Ketik minimal ${minChars} huruf untuk mencari.`;
  else if (results.isPending) status = 'Mencari…';
  else if (results.isError) status = 'Pencarian gagal. Coba lagi.';
  else if (options.length === 0) status = kind === 'dosen' ? 'Tidak ada dosen yang cocok. Data dosen berasal dari Portal; hubungi admin bila belum muncul.' : 'Tidak ada mahasiswa yang cocok di data Portal.';

  return (
    <Field label={label} required error={error} hint={status}>
      {(c) => (
        <div className="space-y-2">
          <Input type="search" aria-label={`Cari ${label.toLowerCase()}`} placeholder="Cari nama atau nomor…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          <Select
            {...c}
            value=""
            disabled={options.length === 0}
            onChange={(e) => {
              const picked = options.find((o) => o.value === e.target.value);
              if (picked) {
                onPick(picked.raw);
                setQ('');
              }
            }}
          >
            <option value="">{options.length ? `Pilih (${options.length} hasil)…` : 'Belum ada pilihan'}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      )}
    </Field>
  );
}
