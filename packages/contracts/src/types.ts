/** Bentuk respons API backend (apps/server/src/views). */
import type {
  Bentuk,
  BentukEvent,
  DocumentRecordType,
  DocumentType,
  JenisPenyelenggaraan,
  JenisRekognisi,
  Kategori,
  Kelompok,
  Level,
  Peringkat,
  RecordStatus,
  Role,
} from './enums';

export type RecordKind = 'prestasi-mandiri' | 'sertifikasi' | 'rekognisi';

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export interface ApiErrorBody {
  error?: string;
  description?: string;
  errors?: Record<string, string>;
}

export interface UserView {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface TenantView {
  id: string;
  slug: string;
  nama_pt: string;
  kode_pt: string;
  tahun_aktif: number;
  allow_kab_rekognisi: boolean;
}

export type Permission =
  | 'record.read'
  | 'record.write'
  | 'record.verify'
  | 'record.submit'
  | 'record.delete'
  | 'event.write'
  | 'institusi.write'
  | 'document.upload'
  | 'document.delete'
  | 'credential.manage'
  | 'tenant.manage'
  | 'user.manage'
  | 'settings.manage'
  | 'logs.read'
  | 'audit.read'
  | 'export';

/** Identitas mahasiswa dari Portal (NIM dan nama kanonik) untuk pengisian otomatis formulir. */
export interface StudentIdentity {
  nim: string;
  nama: string;
}

export interface Me {
  user: UserView;
  tenant: TenantView;
  csrf_token: string;
  permissions: Permission[];
  /** Hanya terisi untuk akun MAHASISWA yang NIM-nya sudah diterima dari Portal. */
  student?: StudentIdentity | null;
}

/** Hasil /api/lookups/mahasiswa (data master dari Portal). */
export interface StudentOption {
  nim: string;
  nama: string;
  prodi: string | null;
  angkatan: number | null;
}

/** Hasil /api/lookups/dosen (data master dari Portal; hanya pegawai ber-NUPTK). */
export interface LecturerOption {
  nuptk: string;
  nama: string;
  unit: string | null;
}

export interface Mahasiswa {
  nim: string;
  nama: string;
}

export interface Dosen {
  nuptk: string;
  nama: string;
  url_surat_tugas?: string | null;
}

export interface RecordBase {
  id: string;
  kind: 'PRESTASI_MANDIRI' | 'SERTIFIKASI' | 'REKOGNISI';
  status: RecordStatus;
  nama: string;
  level: Level;
  penyelenggara: string;
  url_peserta: string;
  url_sertifikat: string;
  tgl_sertifikat: string;
  url_foto_upp: string | null;
  url_dokumen_undangan: string | null;
  keterangan: string | null;
  mahasiswa: Mahasiswa[];
  dosen: Dosen[];
  simkatmawa_id: string | null;
  simkatmawa_kode_pt: string | null;
  simkatmawa_tahun: string | null;
  sent_at: string | null;
  last_error: string | null;
  submission_attempts: number;
  revision_note: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  // field khusus jenis (diratakan oleh backend)
  kategori?: Kategori;
  cabang?: string;
  peringkat?: Peringkat;
  jumlah_unit_peserta?: string;
  kelompok_prestasi?: Kelompok;
  bentuk?: Bentuk;
  jenis?: JenisRekognisi;
}

/** Body create/update record. Backend menolak field di luar daftar ini. */
export interface RecordInput {
  nama: string;
  level: Level;
  penyelenggara: string;
  url_peserta: string;
  url_sertifikat: string;
  tgl_sertifikat: string;
  url_foto_upp?: string | null;
  url_dokumen_undangan?: string | null;
  keterangan?: string | null;
  mahasiswa: Mahasiswa[];
  dosen: Dosen[];
  kategori?: Kategori;
  cabang?: string;
  peringkat?: Peringkat;
  jumlah_unit_peserta?: string;
  kelompok_prestasi?: Kelompok;
  bentuk?: Bentuk;
  jenis?: JenisRekognisi;
  version?: number;
  /** UUID dari klien saat membuat, agar berkas bisa diunggah sebelum draf tersimpan. */
  client_ref?: string;
}

export interface LaporanTahunan {
  tahun: number;
  url_ajang: string;
  url_laporan: string;
}

export interface Kejuaraan {
  id: string;
  nama_ajang: string;
  jenis_penyelenggaraan: JenisPenyelenggaraan;
  level: Level;
  kategori: Kategori;
  bentuk: BentukEvent;
  tempat: string;
  url_ajang: string;
  tahun: number;
  laporan: LaporanTahunan[];
  created_at: string;
}

export type KejuaraanInput = Omit<Kejuaraan, 'id' | 'created_at'>;

export interface IndicatorState {
  id: string;
  checked: boolean;
  url: string | null;
}

export interface InstitusiReport {
  tahun: number;
  status: 'DRAFT' | 'SUBMITTED';
  indikator: IndicatorState[];
  jumlah_penerima_beasiswa_non_apbn: number;
  level_kelembagaan: 1 | 2 | 3 | null;
  total_anggaran_pt: number;
  total_anggaran_kemahasiswaan: number;
  updated_at: string | null;
}

export interface InstitusiInput {
  indikator: { id: string; checked: boolean; url?: string | null }[];
  jumlah_penerima_beasiswa_non_apbn: number;
  level_kelembagaan: 1 | 2 | 3 | null;
  total_anggaran_pt: number;
  total_anggaran_kemahasiswaan: number;
  finalize: boolean;
}

export interface DocumentItem {
  id: string;
  record_type: DocumentRecordType;
  record_ref: string;
  document_type: DocumentType;
  tahun: number;
  original_filename: string;
  public_url: string;
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png';
  size_bytes: number;
  checksum_sha256: string;
  is_locked: boolean;
  created_at: string;
}

export interface CredentialStatus {
  configured: boolean;
  api_url: string | null;
  email: string | null;
  is_connected: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  token_expires_at: string | null;
}

export interface SubmissionLog {
  id: string;
  record_id: number;
  kind: string;
  attempt: number;
  outcome: 'SUCCESS' | 'FAILED' | 'RETRY';
  http_status: number | null;
  request_summary: Record<string, unknown>;
  response_summary: Record<string, unknown>;
  error: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_ref: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  ip: string | null;
  request_id: string | null;
  detail: Record<string, unknown>;
  hash: string;
  created_at: string;
}

export interface ChainReport {
  checked: number;
  intact: boolean;
  first_broken_id: number | null;
}

export interface Mapping {
  group_name: string;
  internal_value: string;
  simkatmawa_code: string;
  label: string;
  is_override: boolean;
}

export interface DashboardData {
  counts: { kind: string; status: RecordStatus; total: number }[];
  kejuaraan_total: number;
  documents_total: number;
  simkatmawa: CredentialStatus;
  recent: RecordBase[];
}
