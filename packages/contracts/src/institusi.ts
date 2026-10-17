/**
 * Katalog indikator laporan Institusi (panduan §2.2). Jumlah butir per kelompok mengikuti panduan dan
 * HARUS sama dengan `GROUPS` di apps/server/src/models/institusi_reports.rs.
 *
 * Catatan: panduan hanya memuat judul kelompok dan jumlah butir, bukan redaksi tiap butir. Redaksi
 * resmi perlu disalin dari halaman /institusi SIMKATMAWA ke `items` bila ingin ditampilkan.
 */

export interface IndicatorGroup {
  section: 'A' | 'B' | 'C' | 'E';
  code: string;
  title: string;
  count: number;
  /** Redaksi resmi per butir (opsional, isi bertahap dari SIMKATMAWA). */
  items?: string[];
}

export const SECTION_TITLE = {
  A: 'Kelembagaan Kemahasiswaan',
  B: 'Sumber Daya Manusia',
  C: 'Prasarana dan Sarana',
  D: 'Pembiayaan',
  E: 'Regulasi Penghargaan Capaian Prestasi',
} as const;

export const INDICATOR_GROUPS: IndicatorGroup[] = [
  { section: 'A', code: 'A.1', title: 'Regulasi pembinaan kemahasiswaan', count: 11 },
  { section: 'A', code: 'A.2a', title: 'Pengelolaan beasiswa', count: 6 },
  { section: 'A', code: 'A.3', title: 'Layanan kesehatan', count: 6 },
  { section: 'A', code: 'A.4', title: 'Layanan konseling', count: 6 },
  { section: 'A', code: 'A.5', title: 'Pencegahan kekerasan', count: 5 },
  { section: 'A', code: 'A.6', title: 'Anti intoleransi, perundungan, dan korupsi', count: 3 },
  { section: 'A', code: 'A.7', title: 'Kewirausahaan', count: 6 },
  { section: 'A', code: 'A.8', title: 'Karakter dan bela negara', count: 3 },
  { section: 'B', code: 'B.1', title: 'Level kelembagaan (dokumen pendukung)', count: 2 },
  { section: 'B', code: 'B.2', title: 'Tugas pokok dan fungsi', count: 6 },
  { section: 'C', code: 'C.1', title: 'Prasarana dan sarana kemahasiswaan', count: 7 },
  { section: 'E', code: 'E.1', title: 'Regulasi penghargaan capaian prestasi', count: 6 },
];

export interface IndicatorMeta {
  id: string;
  section: IndicatorGroup['section'];
  group: string;
  groupTitle: string;
  index: number;
  label: string;
}

export const indicatorId = (code: string, n: number): string => `${code}.${String(n).padStart(2, '0')}`;

export const INDICATORS: IndicatorMeta[] = INDICATOR_GROUPS.flatMap((g) =>
  Array.from({ length: g.count }, (_, i) => ({
    id: indicatorId(g.code, i + 1),
    section: g.section,
    group: g.code,
    groupTitle: g.title,
    index: i + 1,
    label: g.items?.[i] ?? `Butir ${i + 1} — ${g.title}`,
  })),
);

export const LEVEL_KELEMBAGAAN_LABEL = { 1: 'Level 1', 2: 'Level 2', 3: 'Level 3' } as const;
