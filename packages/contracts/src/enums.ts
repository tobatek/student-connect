/** Nilai enum SIMKATMAWA (docs/simkatmawa-api-panduan.md §3.2-3.4) beserta label Bahasa Indonesia. */

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

const opts = <T extends string>(entries: Record<T, string>): Option<T>[] =>
  (Object.entries(entries) as [T, string][]).map(([value, label]) => ({ value, label }));

export const LEVEL_LABEL = {
  KAB: 'Kabupaten/Kota',
  PROV: 'Provinsi',
  NAS: 'Nasional',
  INT: 'Internasional',
} as const;
export type Level = keyof typeof LEVEL_LABEL;
export const LEVEL_OPTIONS = opts<Level>(LEVEL_LABEL);

export const KATEGORI_LABEL = {
  RISNOV: 'Riset dan Inovasi STEM',
  RISNOVSSH: 'Riset dan Inovasi SSH',
  SENBUD: 'Seni dan Budaya',
  OLAHRAGA: 'Olahraga',
  MINAT: 'Minat Khusus',
} as const;
export type Kategori = keyof typeof KATEGORI_LABEL;
export const KATEGORI_OPTIONS = opts<Kategori>(KATEGORI_LABEL);

export const PERINGKAT_LABEL = {
  JUARA1: 'Juara 1',
  JUARA2: 'Juara 2',
  JUARA3: 'Juara 3',
  HARAPAN1: 'Harapan 1',
  HARAPAN2: 'Harapan 2',
  HARAPAN3: 'Harapan 3',
  APRESIASI: 'Apresiasi / Penghargaan Tambahan / Juara Umum',
  PESERTA: 'Peserta',
} as const;
export type Peringkat = keyof typeof PERINGKAT_LABEL;
export const PERINGKAT_OPTIONS = opts<Peringkat>(PERINGKAT_LABEL);

export const KELOMPOK_LABEL = { INDIVIDU: 'Individu', KELOMPOK: 'Kelompok' } as const;
export type Kelompok = keyof typeof KELOMPOK_LABEL;
export const KELOMPOK_OPTIONS = opts<Kelompok>(KELOMPOK_LABEL);

export const BENTUK_LABEL = { LURING: 'Luring', DARING: 'Daring' } as const;
export type Bentuk = keyof typeof BENTUK_LABEL;
export const BENTUK_OPTIONS = opts<Bentuk>(BENTUK_LABEL);

export const BENTUK_EVENT_LABEL = { LURING: 'Luring', DARING: 'Daring', HIBRID: 'Hibrid' } as const;
export type BentukEvent = keyof typeof BENTUK_EVENT_LABEL;
export const BENTUK_EVENT_OPTIONS = opts<BentukEvent>(BENTUK_EVENT_LABEL);

export const JENIS_REKOGNISI_LABEL = {
  SERKOM: 'Sertifikat Kompetensi',
  JURIOR: 'Juri/Pelatih/Wasit Olahraga',
  JURINOR: 'Juri/Pelatih/Wasit Non Olahraga',
  KEYCONF: 'Keynote speaker conference',
  KEYWORK: 'Keynote speaker workshop/pelatihan/bimtek',
  PAMERAN: 'Pameran karya seni',
  KARYA: 'Karya cipta lagu dan/atau seni tari',
  BUKU: 'Penulis buku',
  PATEN: 'Paten/Paten Sederhana',
  PUB: 'Publikasi artikel ilmiah',
  DUTA: 'Duta (Brand Ambassador)',
  PTG: 'Produk Teknologi Tepat Guna',
  PSB: 'Produk Seni dan Budaya',
  PKD: 'Produk Kreatif Dunia Usaha dan Industri',
} as const;
export type JenisRekognisi = keyof typeof JENIS_REKOGNISI_LABEL;
export const JENIS_REKOGNISI_OPTIONS = opts<JenisRekognisi>(JENIS_REKOGNISI_LABEL);

export const JENIS_PENYELENGGARAAN_LABEL = {
  MANDIRI: 'Mandiri',
  MANDIRI_TERVERIFIKASI: 'Mandiri Terverifikasi (3 tahun berurutan)',
} as const;
export type JenisPenyelenggaraan = keyof typeof JENIS_PENYELENGGARAAN_LABEL;
export const JENIS_PENYELENGGARAAN_OPTIONS = opts<JenisPenyelenggaraan>(JENIS_PENYELENGGARAAN_LABEL);

export const STATUS_LABEL = {
  DRAFT: 'Draf',
  SUBMITTED_INTERNAL: 'Menunggu verifikasi',
  NEED_REVISION: 'Perlu revisi',
  VERIFIED: 'Terverifikasi',
  QUEUED: 'Dalam antrean',
  SENDING: 'Sedang dikirim',
  SENT: 'Terkirim',
  FAILED: 'Gagal kirim',
  CANCELLED: 'Dibatalkan',
} as const;
export type RecordStatus = keyof typeof STATUS_LABEL;
export const STATUS_OPTIONS = opts<RecordStatus>(STATUS_LABEL);

export const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_PT: 'Admin PT',
  ADMIN_KEMAHASISWAAN: 'Admin Kemahasiswaan',
  ADMIN_PRODI: 'Admin Prodi',
  MAHASISWA: 'Mahasiswa',
  DOSEN_PEMBINA: 'Dosen Pembina',
  AUDITOR: 'Auditor',
} as const;
export type Role = keyof typeof ROLE_LABEL;
export const ROLE_OPTIONS = opts<Role>(ROLE_LABEL);

export const DOCUMENT_TYPE_LABEL = {
  sertifikat: 'Sertifikat',
  peserta: 'Daftar peserta',
  'foto-upp': 'Foto UPP',
  undangan: 'Dokumen undangan',
  'surat-tugas': 'Surat tugas',
  laporan: 'Laporan',
  bukti: 'Dokumen bukti',
  lainnya: 'Lainnya',
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPE_LABEL;
export const DOCUMENT_TYPE_OPTIONS = opts<DocumentType>(DOCUMENT_TYPE_LABEL);

export const RECORD_TYPE_LABEL = {
  'prestasi-mandiri': 'Prestasi Mandiri',
  sertifikasi: 'Sertifikasi',
  rekognisi: 'Rekognisi',
  kejuaraan: 'Kejuaraan',
  institusi: 'Institusi',
  umum: 'Umum',
} as const;
export type DocumentRecordType = keyof typeof RECORD_TYPE_LABEL;
export const RECORD_TYPE_OPTIONS = opts<DocumentRecordType>(RECORD_TYPE_LABEL);

export const SUBMISSION_OUTCOME_LABEL = { SUCCESS: 'Berhasil', FAILED: 'Gagal', RETRY: 'Diulang' } as const;
