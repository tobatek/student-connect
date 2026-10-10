export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN_PT'
  | 'ADMIN_KEMAHASISWAAN'
  | 'ADMIN_PRODI'
  | 'MAHASISWA'
  | 'DOSEN_PEMBINA'
  | 'AUDITOR';

export type SubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED_INTERNAL'
  | 'NEED_REVISION'
  | 'VERIFIED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export type LevelType = 'KAB' | 'PROV' | 'NAS' | 'INT';

export type KategoriPrestasi =
  | 'RISNOV'
  | 'RISNOVSSH'
  | 'SENBUD'
  | 'OLAHRAGA'
  | 'MINAT';

export type PeringkatPrestasi =
  | 'JUARA1'
  | 'JUARA2'
  | 'JUARA3'
  | 'HARAPAN1'
  | 'HARAPAN2'
  | 'HARAPAN3'
  | 'APRESIASI'
  | 'PESERTA';

export type KelompokPrestasi = 'INDIVIDU' | 'KELOMPOK';
export type BentukKegiatan = 'LURING' | 'DARING';

export type JenisRekognisi =
  | 'SERKOM'
  | 'JURIOR'
  | 'JURINOR'
  | 'KEYCONF'
  | 'KEYWORK'
  | 'PAMERAN'
  | 'KARYA'
  | 'BUKU'
  | 'PATEN'
  | 'PUB'
  | 'DUTA'
  | 'PTG'
  | 'PSB'
  | 'PKD';

export interface MahasiswaParticipant {
  nim: string;
  nama: string;
  prodi?: string;
}

export interface DosenSupervisor {
  nuptk: string;
  nama: string;
  url_surat_tugas?: string;
}

export interface TenantConfig {
  id: string;
  slug: string;
  nama_pt: string;
  kode_pt: string;
  logo_url: string;
  warna_tema: string;
  tahun_aktif: number;
  r2_bucket_domain: string;
  r2_prefix: string;
  simkatmawa_email: string;
  simkatmawa_api_url: string;
  is_simkatmawa_connected: boolean;
  last_token?: string;
  token_expires_at?: string;
  allow_kab_rekognisi: boolean;
}

export interface PrestasiMandiri {
  id: string;
  tenant_id: string;
  status: SubmissionStatus;
  simkatmawa_id?: string;
  simkatmawa_kode_pt?: string;
  simkatmawa_tahun?: string;
  sent_at?: string;
  last_error?: string;
  submission_attempts: number;

  level: LevelType;
  kategori: KategoriPrestasi;
  lomba: string;
  cabang: string;
  penyelenggara: string;
  peringkat: PeringkatPrestasi;
  jumlah_unit_peserta: string;
  kelompok_prestasi: KelompokPrestasi;
  bentuk: BentukKegiatan;

  url_peserta: string;
  url_sertifikat: string;
  tgl_sertifikat: string;
  url_foto_upp?: string;
  url_dokumen_undangan?: string;
  keterangan?: string;

  mahasiswa: MahasiswaParticipant[];
  dosen: DosenSupervisor[];

  created_at: string;
  updated_at: string;
  created_by: string;
  revision_note?: string;
}

export interface Sertifikasi {
  id: string;
  tenant_id: string;
  status: SubmissionStatus;
  simkatmawa_id?: string;
  simkatmawa_kode_pt?: string;
  simkatmawa_tahun?: string;
  sent_at?: string;
  last_error?: string;
  submission_attempts: number;

  level: LevelType;
  nama: string;
  penyelenggara: string;

  url_peserta: string;
  url_sertifikat: string;
  tgl_sertifikat: string;
  url_foto_upp?: string;
  url_dokumen_undangan?: string;
  keterangan?: string;

  mahasiswa: MahasiswaParticipant[];
  dosen: DosenSupervisor[];

  created_at: string;
  updated_at: string;
  created_by: string;
  revision_note?: string;
}

export interface Rekognisi {
  id: string;
  tenant_id: string;
  status: SubmissionStatus;
  simkatmawa_id?: string;
  simkatmawa_kode_pt?: string;
  simkatmawa_tahun?: string;
  sent_at?: string;
  last_error?: string;
  submission_attempts: number;

  jenis: JenisRekognisi;
  level: LevelType;
  nama: string;
  penyelenggara: string;

  url_peserta: string;
  url_sertifikat: string;
  tgl_sertifikat: string;
  url_foto_upp?: string;
  url_dokumen_undangan?: string;
  keterangan?: string;

  mahasiswa: MahasiswaParticipant[];
  dosen: DosenSupervisor[];

  created_at: string;
  updated_at: string;
  created_by: string;
  revision_note?: string;
}

export interface KejuaraanItem {
  id: string;
  tenant_id: string;
  nama_ajang: string;
  jenis_penyelenggaraan: 'MANDIRI' | 'MANDIRI_TERVERIFIKASI';
  level: LevelType;
  kategori: KategoriPrestasi;
  bentuk: 'LURING' | 'DARING' | 'HIBRID';
  tempat: string;
  url_ajang: string;
  tahun: number;
  url_laporan: string;
  total_peserta: number;
  peserta_list: string[];
  juara_list: string[];
  is_ready_for_web_input: boolean;
  created_at: string;
}

export interface InstitusiIndikator {
  id: string;
  code: string;
  seksi: 'A' | 'B' | 'C' | 'D' | 'E';
  seksi_name: string;
  nama: string;
  deskripsi: string;
  is_checked: boolean;
  document_url?: string;
  document_name?: string;
  notes?: string;
}

export interface InstitusiFinansial {
  total_anggaran_pt: number;
  total_anggaran_kemahasiswaan: number;
  jumlah_penerima_beasiswa_non_apbn: number;
  persentase_anggaran: number;
}

export interface PrestasiBelmawaItem {
  id: string;
  belmawa_id: string;
  lomba: string;
  prestasi: string;
  tahun: number;
  perguruan_tinggi: string;
  keterangan: string;
  mahasiswa_tagged: { nim: string; nama: string }[];
}

export interface DocumentR2 {
  id: string;
  tenant_id: string;
  owner_type: 'mahasiswa' | 'dosen' | 'admin';
  owner_id: string;
  owner_name: string;
  document_type: 'sertifikat' | 'peserta' | 'undangan' | 'foto_upp' | 'surat_tugas' | 'laporan';
  original_filename: string;
  storage_key: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  is_locked: boolean;
  created_at: string;
}

export interface SimkatmawaSubmissionLog {
  id: string;
  tenant_id: string;
  record_type: 'prestasi_mandiri' | 'sertifikasi' | 'rekognisi';
  record_id: string;
  record_title: string;
  endpoint: string;
  request_payload: Record<string, any>;
  response_body?: Record<string, any>;
  http_status: number;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  error_message?: string;
  attempt: number;
  simkatmawa_id?: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  triggered_by: string;
  idempotency_key: string;
}

export interface EnumMapping {
  category: 'level' | 'kategori' | 'peringkat' | 'jenis_rekognisi' | 'bentuk';
  internal_code: string;
  internal_label: string;
  simkatmawa_code: string;
  keterangan: string;
}
