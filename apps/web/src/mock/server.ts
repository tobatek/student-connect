/**
 * Server tiruan untuk MODE DEMO (frontend saja). Semua data adalah contoh fiktif yang disimpan di
 * localStorage browser. Tidak ada jaringan, tidak ada kredensial nyata. Tidak ikut ter-bundle di
 * build produksi (diimpor dinamis hanya bila VITE_MOCK=true).
 */
import {
  BENTUK_LABEL,
  JENIS_REKOGNISI_LABEL,
  KATEGORI_LABEL,
  KELOMPOK_LABEL,
  LEVEL_LABEL,
  PERINGKAT_LABEL,
  type AuditEntry,
  type CredentialStatus,
  type DocumentItem,
  type InstitusiReport,
  type Kejuaraan,
  type Mapping,
  type Me,
  type Permission,
  type RecordBase,
  type RecordStatus,
  type Role,
  type SubmissionLog,
  type UserView,
} from '@students-connect/contracts';

export interface MockResult {
  status: number;
  body: unknown;
}
interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  body: any;
  csrf: string | null;
}

export const DEMO_PASSWORD = 'Demo-Sandi-2026!';
export const DEMO_ACCOUNTS: { email: string; role: Role; name: string }[] = [
  { email: 'admin@demo.ac.id', role: 'ADMIN_PT', name: 'Admin Demo' },
  { email: 'mhs@demo.ac.id', role: 'MAHASISWA', name: 'Mahasiswa Demo' },
  { email: 'auditor@demo.ac.id', role: 'AUDITOR', name: 'Auditor Demo' },
];

const ALL: Permission[] = ['record.read', 'record.write', 'record.verify', 'record.submit', 'record.delete', 'event.write', 'institusi.write', 'document.upload', 'document.delete', 'credential.manage', 'tenant.manage', 'user.manage', 'settings.manage', 'logs.read', 'audit.read', 'export'];
const PERMS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN_PT: ALL,
  ADMIN_KEMAHASISWAAN: ALL.filter((p) => !['credential.manage', 'tenant.manage', 'user.manage'].includes(p)),
  ADMIN_PRODI: ['record.read', 'record.write', 'event.write', 'document.upload', 'export'],
  DOSEN_PEMBINA: ['record.read', 'record.write', 'document.upload'],
  MAHASISWA: ['record.read', 'record.write', 'document.upload'],
  AUDITOR: ['record.read', 'logs.read', 'audit.read', 'export'],
};

type Rec = RecordBase & { owner: string };
interface Store {
  session: { email: string; csrf: string } | null;
  mustChange: Record<string, boolean>;
  tenant: Me['tenant'];
  records: Rec[];
  kejuaraan: Kejuaraan[];
  institusi: Record<number, InstitusiReport>;
  documents: DocumentItem[];
  users: UserView[];
  logs: SubmissionLog[];
  audit: AuditEntry[];
  credential: CredentialStatus;
  overrides: Record<string, string>;
  seq: number;
}

const KEY = 'sc-mock-v1';
const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const uid = () => crypto.randomUUID();
const date = (daysAgo: number) => iso(daysAgo).slice(0, 10);

const rec = (kind: RecordBase['kind'], status: RecordStatus, nama: string, extra: Partial<RecordBase>, owner = 'admin@demo.ac.id', days = 3): Rec => ({
  id: uid(),
  kind,
  status,
  nama,
  level: 'NAS',
  penyelenggara: 'Penyelenggara Contoh',
  url_peserta: 'https://example.com/peserta',
  url_sertifikat: 'https://example.com/sertifikat',
  tgl_sertifikat: date(days + 20),
  url_foto_upp: null,
  url_dokumen_undangan: null,
  keterangan: null,
  mahasiswa: [{ nim: '51422001', nama: 'Budi Contoh' }],
  dosen: [],
  simkatmawa_id: null,
  simkatmawa_kode_pt: null,
  simkatmawa_tahun: null,
  sent_at: null,
  last_error: null,
  submission_attempts: 0,
  revision_note: null,
  version: 1,
  created_at: iso(days),
  updated_at: iso(days),
  owner,
  ...extra,
});

const seed = (): Store => {
  const records: Rec[] = [
    rec('PRESTASI_MANDIRI', 'SENT', 'Lomba Pemrograman Nasional (contoh)', { kategori: 'RISNOV', cabang: 'Algoritma', peringkat: 'JUARA1', jumlah_unit_peserta: '120', kelompok_prestasi: 'KELOMPOK', bentuk: 'DARING', simkatmawa_id: '518023', simkatmawa_kode_pt: '999999', simkatmawa_tahun: '2026', sent_at: iso(2), mahasiswa: [{ nim: '51422001', nama: 'Budi Contoh' }, { nim: '51422002', nama: 'Siti Contoh' }], dosen: [{ nuptk: '511111422001', nama: 'Dr. Dosen Contoh', url_surat_tugas: null }] }, 'admin@demo.ac.id', 6),
    rec('PRESTASI_MANDIRI', 'VERIFIED', 'Kompetisi Debat Mahasiswa (contoh)', { kategori: 'SENBUD', cabang: 'Debat', peringkat: 'JUARA2', jumlah_unit_peserta: '40', kelompok_prestasi: 'KELOMPOK', bentuk: 'LURING', level: 'PROV' }, 'mhs@demo.ac.id', 4),
    rec('PRESTASI_MANDIRI', 'FAILED', 'Kejuaraan Panahan (contoh)', { kategori: 'OLAHRAGA', cabang: 'Panahan', peringkat: 'HARAPAN1', jumlah_unit_peserta: '25', kelompok_prestasi: 'INDIVIDU', bentuk: 'LURING', last_error: 'SIMKATMAWA menolak data (HTTP 422): contoh pesan galat.', submission_attempts: 2 }, 'admin@demo.ac.id', 3),
    rec('PRESTASI_MANDIRI', 'DRAFT', 'Olimpiade Sains Mahasiswa (contoh)', { kategori: 'RISNOV', cabang: 'Fisika', peringkat: 'PESERTA', jumlah_unit_peserta: '60', kelompok_prestasi: 'INDIVIDU', bentuk: 'DARING' }, 'mhs@demo.ac.id', 1),
    rec('SERTIFIKASI', 'SUBMITTED_INTERNAL', 'Sertifikat Kompetensi Jaringan (contoh)', { level: 'NAS' }, 'mhs@demo.ac.id', 2),
    rec('SERTIFIKASI', 'SENT', 'Sertifikasi Analis Data (contoh)', { simkatmawa_id: '518101', simkatmawa_kode_pt: '999999', simkatmawa_tahun: '2026', sent_at: iso(5) }, 'admin@demo.ac.id', 8),
    rec('REKOGNISI', 'NEED_REVISION', 'Publikasi Artikel Ilmiah (contoh)', { jenis: 'PUB', level: 'INT', revision_note: 'Mohon lengkapi tautan bukti publikasi.' }, 'mhs@demo.ac.id', 5),
  ];
  return {
    session: null,
    mustChange: {},
    tenant: { id: uid(), slug: 'demo', nama_pt: 'Perguruan Tinggi Demo', kode_pt: '999999', tahun_aktif: new Date().getFullYear(), allow_kab_rekognisi: false },
    records,
    kejuaraan: [
      { id: uid(), nama_ajang: 'Festival Inovasi Kampus (contoh)', jenis_penyelenggaraan: 'MANDIRI', level: 'NAS', kategori: 'RISNOV', bentuk: 'HIBRID', tempat: 'Auditorium Utama', url_ajang: 'https://example.com/festival', tahun: new Date().getFullYear(), laporan: [], created_at: iso(10) },
    ],
    institusi: {},
    documents: [
      { id: uid(), record_type: 'umum', record_ref: 'umum', document_type: 'bukti', tahun: new Date().getFullYear(), original_filename: 'contoh-sertifikat.pdf', public_url: 'https://example.com/contoh-sertifikat.pdf', mime_type: 'application/pdf', size_bytes: 482_113, checksum_sha256: 'a'.repeat(64), is_locked: true, created_at: iso(6) },
    ],
    users: DEMO_ACCOUNTS.map((a) => ({ id: uid(), email: a.email, name: a.name, role: a.role, is_active: true, must_change_password: false, last_login_at: iso(1), created_at: iso(30) })),
    logs: [
      { id: uid(), record_id: 1, kind: 'PRESTASI_MANDIRI', attempt: 1, outcome: 'SUCCESS', http_status: 200, request_summary: {}, response_summary: { id: '518023' }, error: null, created_at: iso(2) },
      { id: uid(), record_id: 3, kind: 'PRESTASI_MANDIRI', attempt: 2, outcome: 'FAILED', http_status: 422, request_summary: {}, response_summary: {}, error: 'SIMKATMAWA menolak data (HTTP 422): contoh pesan galat.', created_at: iso(3) },
    ],
    audit: [
      { id: 2, actor_email: 'admin@demo.ac.id', actor_role: 'ADMIN_PT', action: 'record.verify', entity: 'record', entity_ref: 'a1b2c3d4', outcome: 'SUCCESS', ip: '127.0.0.1', request_id: null, detail: {}, hash: 'b'.repeat(64), created_at: iso(1) },
      { id: 1, actor_email: 'admin@demo.ac.id', actor_role: 'ADMIN_PT', action: 'auth.login', entity: 'session', entity_ref: null, outcome: 'SUCCESS', ip: '127.0.0.1', request_id: null, detail: {}, hash: 'c'.repeat(64), created_at: iso(1) },
    ],
    credential: { configured: true, api_url: 'https://simkatmawa.kemdiktisaintek.go.id', email: 'akun-demo@demo.ac.id', is_connected: true, last_checked_at: iso(0), last_error: null, token_expires_at: new Date(Date.now() + 3_000_000).toISOString() },
    overrides: {},
    seq: 3,
  };
};

let store: Store | null = null;
const load = (): Store => {
  if (store) return store;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      store = JSON.parse(raw) as Store;
      return store;
    }
  } catch {
    /* abaikan: pakai seed */
  }
  store = seed();
  return store;
};
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* penyimpanan penuh/diblokir: data tetap di memori */
  }
};
export const resetMock = (): void => {
  store = seed();
  save();
};

const ok = (body: unknown = {}, status = 200): MockResult => ({ status, body });
const fail = (status: number, description: string, errors?: Record<string, string>, error = 'error'): MockResult => ({ status, body: { error, description, errors } });
const page = <T,>(items: T[], q: URLSearchParams): MockResult => {
  const size = Math.min(100, Number(q.get('page_size') ?? 20));
  const p = Math.max(1, Number(q.get('page') ?? 1));
  return ok({ items: items.slice((p - 1) * size, p * size), page: p, page_size: size, total_items: items.length, total_pages: Math.max(1, Math.ceil(items.length / size)) });
};

const current = (s: Store) => {
  if (!s.session) return null;
  const acc = DEMO_ACCOUNTS.find((a) => a.email === s.session?.email);
  const user = s.users.find((u) => u.email === s.session?.email);
  return acc && user ? { acc, user: { ...user, must_change_password: s.mustChange[user.email] ?? false } } : null;
};
const meOf = (s: Store): Me | null => {
  const c = current(s);
  if (!c || !s.session) return null;
  const student = c.acc.role === 'MAHASISWA' ? { nim: DEMO_STUDENTS[0]!.nim, nama: DEMO_STUDENTS[0]!.nama } : null;
  return { user: c.user, tenant: s.tenant, csrf_token: s.session.csrf, permissions: PERMS[c.acc.role], student };
};

/** Data master tiruan (di produksi berasal dari Portal lewat sinkronisasi). */
let mockSync: { kind: string; startedAt: number } | null = null;
const DEMO_STUDENTS = [
  { nim: '51422001', nama: 'Mahasiswa Demo', prodi: 'Keperawatan', angkatan: 2022 },
  { nim: '51422002', nama: 'Budi Santoso', prodi: 'Kebidanan', angkatan: 2022 },
  { nim: '51423010', nama: 'Siti Aminah', prodi: 'Farmasi', angkatan: 2023 },
];
const DEMO_LECTURERS = [
  { nuptk: '1234567890123456', nama: 'Dr. Ratna Dewi, M.Kep.', unit: 'Prodi Keperawatan' },
  { nuptk: '6543210987654321', nama: 'Agus Prasetyo, M.Farm.', unit: 'Prodi Farmasi' },
];

const audit = (s: Store, action: string, entity: string, ref: string | null = null) => {
  const c = current(s);
  s.audit.unshift({ id: (s.audit[0]?.id ?? 0) + 1, actor_email: c?.user.email ?? null, actor_role: c?.acc.role ?? null, action, entity, entity_ref: ref?.slice(0, 8) ?? null, outcome: 'SUCCESS', ip: '127.0.0.1', request_id: null, detail: {}, hash: uid().replaceAll('-', '').padEnd(64, '0'), created_at: iso(0) });
};

const KIND_BY_SLUG = { 'prestasi-mandiri': 'PRESTASI_MANDIRI', sertifikasi: 'SERTIFIKASI', rekognisi: 'REKOGNISI' } as const;
const catalog = (): Mapping[] => {
  const g = (group: string, labels: Record<string, string>) => Object.entries(labels).map(([v, l]) => ({ group_name: group, internal_value: v, simkatmawa_code: store?.overrides[`${group}:${v}`] ?? v, label: l, is_override: Boolean(store?.overrides[`${group}:${v}`]) }));
  return [...g('level', LEVEL_LABEL), ...g('kategori', KATEGORI_LABEL), ...g('peringkat', PERINGKAT_LABEL), ...g('kelompok_prestasi', KELOMPOK_LABEL), ...g('bentuk', BENTUK_LABEL), ...g('jenis', JENIS_REKOGNISI_LABEL)];
};

function validateRecord(body: any, kind: RecordBase['kind']): Record<string, string> {
  const e: Record<string, string> = {};
  const need = (k: string, label = 'Wajib diisi.') => {
    if (!String(body[k] ?? '').trim()) e[k] = label;
  };
  ['nama', 'level', 'penyelenggara', 'tgl_sertifikat'].forEach((k) => need(k));
  for (const k of ['url_peserta', 'url_sertifikat']) {
    if (!/^https?:\/\/\S+$/i.test(String(body[k] ?? '').trim())) e[k] = 'URL harus diawali http:// atau https://.';
  }
  if (!Array.isArray(body.mahasiswa) || body.mahasiswa.length === 0) e.mahasiswa = 'Minimal 1 mahasiswa.';
  else body.mahasiswa.forEach((m: any, i: number) => {
    if (!/^[A-Za-z0-9./-]{3,30}$/.test(String(m.nim ?? ''))) e[`mahasiswa[${i}].nim`] = 'NIM 3-30 karakter.';
    if (String(m.nama ?? '').trim().length < 2) e[`mahasiswa[${i}].nama`] = 'Nama 2-120 karakter.';
  });
  if (kind === 'PRESTASI_MANDIRI') ['kategori', 'cabang', 'peringkat', 'jumlah_unit_peserta', 'kelompok_prestasi', 'bentuk'].forEach((k) => need(k));
  if (kind === 'REKOGNISI') need('jenis');
  return e;
}

const simulateSend = (id: string) => {
  window.setTimeout(() => {
    const s = load();
    const r = s.records.find((x) => x.id === id);
    if (!r || r.status !== 'QUEUED') return;
    r.status = 'SENDING';
    r.submission_attempts += 1;
    save();
    window.setTimeout(() => {
      const s2 = load();
      const r2 = s2.records.find((x) => x.id === id);
      if (!r2 || r2.status !== 'SENDING') return;
      r2.status = 'SENT';
      r2.simkatmawa_id = String(518_200 + (s2.seq += 1));
      r2.simkatmawa_kode_pt = s2.tenant.kode_pt;
      r2.simkatmawa_tahun = String(s2.tenant.tahun_aktif);
      r2.sent_at = iso(0);
      r2.last_error = null;
      s2.logs.unshift({ id: uid(), record_id: s2.seq, kind: r2.kind, attempt: r2.submission_attempts, outcome: 'SUCCESS', http_status: 200, request_summary: {}, response_summary: { id: r2.simkatmawa_id }, error: null, created_at: iso(0) });
      audit(s2, 'simkatmawa.submit', 'record', r2.id);
      save();
    }, 2500);
  }, 1500);
};

export async function mockRequest(method: string, rawPath: string, body: unknown, csrf: string | null): Promise<MockResult> {
  await new Promise((r) => setTimeout(r, 120)); // rasa jaringan
  const s = load();
  const url = new URL(rawPath, 'http://mock.local');
  const req: Req = { method, path: url.pathname, query: url.searchParams, body: body ?? {}, csrf };
  const result = route(s, req);
  save();
  return result;
}

function route(s: Store, r: Req): MockResult {
  const { method, path, body } = r;

  if (path === '/api/auth/login' && method === 'POST') {
    const acc = DEMO_ACCOUNTS.find((a) => a.email === String(body.email ?? '').trim().toLowerCase());
    if (!acc || body.password !== DEMO_PASSWORD) return fail(401, 'Email atau kata sandi salah.', undefined, 'unauthorized');
    s.session = { email: acc.email, csrf: uid().replaceAll('-', '') };
    audit(s, 'auth.login', 'session');
    return ok(meOf(s));
  }
  if (path === '/api/auth/me') {
    const me = meOf(s);
    return me ? ok(me) : fail(401, 'Sesi tidak valid atau telah berakhir.', undefined, 'unauthorized');
  }
  const c = current(s);
  if (!c) return fail(401, 'Sesi tidak valid atau telah berakhir.', undefined, 'unauthorized');
  if (method !== 'GET' && r.csrf !== s.session?.csrf) return fail(403, 'Token CSRF tidak valid.', undefined, 'forbidden');
  const can = (p: Permission) => PERMS[c.acc.role].includes(p);
  const deny = () => fail(403, 'Anda tidak memiliki izin untuk aksi ini.', undefined, 'forbidden');

  if (path === '/api/auth/logout') {
    audit(s, 'auth.logout', 'session');
    s.session = null;
    return ok();
  }
  if (path === '/api/auth/change-password') {
    if (body.current_password !== DEMO_PASSWORD) return fail(400, 'Data tidak valid.', { current_password: 'Kata sandi saat ini salah.' }, 'validation');
    s.mustChange[c.user.email] = false;
    return ok(meOf(s));
  }

  if (path === '/api/lookups/mahasiswa' && method === 'GET') {
    const q = (r.query.get('q') ?? '').trim().toLowerCase();
    if (q.length < 2) return ok([]);
    return ok(DEMO_STUDENTS.filter((x) => x.nim.includes(q) || x.nama.toLowerCase().includes(q)));
  }
  if (path === '/api/lookups/dosen' && method === 'GET') {
    const q = (r.query.get('q') ?? '').trim().toLowerCase();
    return ok(DEMO_LECTURERS.filter((x) => !q || x.nuptk.includes(q) || x.nama.toLowerCase().includes(q)));
  }

  const own = (list: Rec[]) => (c.acc.role === 'MAHASISWA' ? list.filter((x) => x.owner === c.user.email) : list);

  if (path === '/api/dashboard') {
    const counts = new Map<string, number>();
    own(s.records).forEach((x) => counts.set(`${x.kind}|${x.status}`, (counts.get(`${x.kind}|${x.status}`) ?? 0) + 1));
    return ok({
      counts: [...counts].map(([k, total]) => ({ kind: k.split('|')[0], status: k.split('|')[1], total })),
      kejuaraan_total: s.kejuaraan.length,
      documents_total: s.documents.length,
      simkatmawa: s.credential,
      recent: own(s.records).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6).map(strip),
    });
  }

  if (path === '/api/tenant' && method === 'PUT') {
    if (!can('tenant.manage')) return deny();
    Object.assign(s.tenant, { nama_pt: body.nama_pt, kode_pt: body.kode_pt, tahun_aktif: body.tahun_aktif, allow_kab_rekognisi: body.allow_kab_rekognisi });
    return ok(s.tenant);
  }

  let m = path.match(/^\/api\/records\/([a-z-]+)(?:\/([^/]+))?(?:\/([a-z-]+))?$/);
  if (m) return records(s, r, m, c, can, own, deny);

  m = path.match(/^\/api\/kejuaraan(?:\/([^/]+))?$/);
  if (m) {
    const id = m[1];
    if (method === 'GET' && !id) return page(s.kejuaraan, r.query);
    if (!can('event.write')) return deny();
    if (method === 'POST' && !id) {
      const k: Kejuaraan = { ...body, id: uid(), created_at: iso(0) };
      s.kejuaraan.unshift(k);
      return ok(k, 201);
    }
    const i = s.kejuaraan.findIndex((x) => x.id === id);
    if (i < 0) return fail(404, 'Data tidak ditemukan.');
    if (method === 'PUT') s.kejuaraan[i] = { ...s.kejuaraan[i]!, ...body, id: id! };
    if (method === 'DELETE') s.kejuaraan.splice(i, 1);
    return ok(method === 'PUT' ? s.kejuaraan[i] : {});
  }

  m = path.match(/^\/api\/institusi\/(\d{4})$/);
  if (m) {
    const y = Number(m[1]);
    if (method === 'GET') return ok(s.institusi[y] ?? { tahun: y, status: 'DRAFT', indikator: [], jumlah_penerima_beasiswa_non_apbn: 0, level_kelembagaan: null, total_anggaran_pt: 0, total_anggaran_kemahasiswaan: 0, updated_at: null });
    if (!can('institusi.write')) return deny();
    if (s.institusi[y]?.status === 'SUBMITTED') return fail(409, 'Laporan yang sudah disimpan final tidak dapat diubah.', undefined, 'conflict');
    const errors: Record<string, string> = {};
    for (const i of body.indikator ?? []) if (i.checked && !String(i.url ?? '').trim()) errors[`indikator.${i.id}`] = 'Indikator yang dicentang wajib memiliki tautan dokumen.';
    if (body.total_anggaran_kemahasiswaan > body.total_anggaran_pt) errors.total_anggaran_kemahasiswaan = 'Anggaran kemahasiswaan tidak boleh melebihi total anggaran PT.';
    if (Object.keys(errors).length) return fail(400, 'Data tidak valid.', errors, 'validation');
    const rep: InstitusiReport = { tahun: y, status: body.finalize ? 'SUBMITTED' : 'DRAFT', indikator: body.indikator, jumlah_penerima_beasiswa_non_apbn: body.jumlah_penerima_beasiswa_non_apbn, level_kelembagaan: body.level_kelembagaan, total_anggaran_pt: body.total_anggaran_pt, total_anggaran_kemahasiswaan: body.total_anggaran_kemahasiswaan, updated_at: iso(0) };
    s.institusi[y] = rep;
    return ok(rep);
  }

  if (path === '/api/documents' && method === 'GET') {
    const t = r.query.get('record_type');
    return page(s.documents.filter((d) => !t || d.record_type === t), r.query);
  }
  if (path === '/api/documents' && method === 'POST') {
    if (!can('document.upload')) return deny();
    return fail(501, 'Unggah berkas tidak tersedia di mode demo (frontend saja).', undefined, 'demo');
  }
  m = path.match(/^\/api\/documents\/([^/]+)$/);
  if (m && method === 'DELETE') {
    if (!can('document.delete')) return deny();
    const d = s.documents.find((x) => x.id === m![1]);
    if (!d) return fail(404, 'Data tidak ditemukan.');
    if (d.is_locked) return fail(409, 'Dokumen sudah terkirim ke SIMKATMAWA dan terkunci permanen.', undefined, 'conflict');
    s.documents = s.documents.filter((x) => x.id !== d.id);
    return ok();
  }

  if (path === '/api/simkatmawa/status') return ok(s.credential);
  if (path === '/api/simkatmawa/credentials/test' && method === 'POST') return can('credential.manage') ? ok({ ok: true, kode_pt: s.tenant.kode_pt }) : deny();
  if (path === '/api/simkatmawa/credentials' && method === 'PUT') {
    if (!can('credential.manage')) return deny();
    s.credential = { ...s.credential, configured: true, email: body.email, is_connected: true, last_checked_at: iso(0), last_error: null };
    return ok(s.credential);
  }
  if (path === '/api/simkatmawa/credentials' && method === 'DELETE') {
    if (!can('credential.manage')) return deny();
    s.credential = { configured: false, api_url: null, email: null, is_connected: false, last_checked_at: null, last_error: null, token_expires_at: null };
    return ok(s.credential);
  }
  if (path === '/api/simkatmawa/refresh-token') return can('credential.manage') ? ok({ ...s.credential, last_checked_at: iso(0) }) : deny();

  if (path === '/api/settings/enum-mappings') {
    if (method === 'PUT') {
      if (!can('settings.manage')) return deny();
      for (const x of body.mappings ?? []) s.overrides[`${x.group_name}:${x.internal_value}`] = x.simkatmawa_code;
    }
    return ok(catalog());
  }

  if (path === '/api/master-sync' && method === 'GET') {
    if (!can('settings.manage')) return deny();
    const elapsed = mockSync ? Date.now() - mockSync.startedAt : 0;
    const running = mockSync && elapsed < 8000;
    if (mockSync && !running) mockSync = null;
    const total = 1311;
    const runs = [
      ...(running ? [{ id: 'r-live', kind: mockSync!.kind, triggered_by: 'manual', status: 'RUNNING', fetched: Math.min(total, Math.round((elapsed / 8000) * total)), created: 0, updated: 0, unchanged: 0, deactivated: 0, failed: 0, progress_total: total, note: null, started_at: iso(0), finished_at: null }] : []),
      { id: 'r-1', kind: 'students', triggered_by: 'schedule', status: 'SUCCESS', fetched: total, created: 0, updated: 12, unchanged: total - 12, deactivated: 0, failed: 0, progress_total: total, note: null, started_at: iso(20), finished_at: iso(20) },
      { id: 'r-2', kind: 'employees', triggered_by: 'schedule', status: 'SUCCESS', fetched: 148, created: 0, updated: 1, unchanged: 147, deactivated: 0, failed: 0, progress_total: 148, note: null, started_at: iso(20), finished_at: iso(20) },
    ];
    return ok({ enabled: true, counts: { students: { active: total, inactive: 24 }, employees: { active: 148, inactive: 6 } }, runs });
  }
  if (path === '/api/master-sync/run' && method === 'POST') {
    if (!can('settings.manage')) return deny();
    if (mockSync) return fail(409, 'Sinkronisasi yang diminta sedang berjalan.', undefined, 'conflict');
    mockSync = { kind: body.kind === 'employees' ? 'employees' : 'students', startedAt: Date.now() };
    return ok({ queued: [mockSync.kind] }, 202);
  }
  if ((path === '/api/master-sync/students' || path === '/api/master-sync/employees') && method === 'GET') {
    if (!can('settings.manage')) return deny();
    const q = (r.query.get('q') ?? '').trim().toLowerCase();
    const page = Number(r.query.get('page') ?? 1);
    const size = Number(r.query.get('page_size') ?? 15);
    const rows =
      path.endsWith('/students')
        ? DEMO_STUDENTS.map((x) => ({ nim: x.nim, nama: x.nama, email: `${x.nim}@kampus.ac.id`, prodi: x.prodi, angkatan: x.angkatan, is_active: true, last_seen_at: iso(1) }))
        : DEMO_LECTURERS.map((x) => ({ nip: `19${x.nuptk.slice(0, 8)}`, nuptk: x.nuptk, nama: x.nama, email: null, unit: x.unit, jabatan: 'Dosen', is_active: true, last_seen_at: iso(1) }));
    const filtered = rows.filter((x) => !q || JSON.stringify(x).toLowerCase().includes(q));
    return ok({ items: filtered.slice((page - 1) * size, page * size), page, page_size: size, total_items: filtered.length, total_pages: Math.max(1, Math.ceil(filtered.length / size)) });
  }

  if (path === '/api/users' && method === 'GET') return can('user.manage') ? ok(s.users) : deny();
  if (path === '/api/users' && method === 'POST') {
    if (!can('user.manage')) return deny();
    return fail(501, 'Tambah pengguna tidak tersedia di mode demo.', undefined, 'demo');
  }
  m = path.match(/^\/api\/users\/([^/]+)(?:\/reset-password)?$/);
  if (m) {
    if (!can('user.manage')) return deny();
    const u = s.users.find((x) => x.id === m![1]);
    if (!u) return fail(404, 'Data tidak ditemukan.');
    if (method === 'PATCH') Object.assign(u, body);
    return ok(u);
  }

  if (path === '/api/submission-logs') return can('logs.read') ? page(s.logs, r.query) : deny();
  if (path === '/api/audit-logs/verify') return can('audit.read') ? ok({ checked: s.audit.length, intact: true, first_broken_id: null }) : deny();
  if (path === '/api/audit-logs') return can('audit.read') ? page(s.audit, r.query) : deny();

  return fail(404, 'Data tidak ditemukan.');
}

const strip = ({ owner: _o, ...rest }: Rec): RecordBase => rest;

function records(s: Store, r: Req, m: RegExpMatchArray, c: NonNullable<ReturnType<typeof current>>, can: (p: Permission) => boolean, own: (l: Rec[]) => Rec[], deny: () => MockResult): MockResult {
  const kind = KIND_BY_SLUG[m[1] as keyof typeof KIND_BY_SLUG];
  if (!kind) return fail(404, 'Data tidak ditemukan.');
  const [, , id, action] = m;
  const { method, body } = r;
  const mine = own(s.records).filter((x) => x.kind === kind);

  if (!id) {
    if (method === 'GET') {
      if (!can('record.read')) return deny();
      const st = r.query.get('status');
      const q = (r.query.get('q') ?? '').toLowerCase();
      const rows = mine
        .filter((x) => !st || x.status === st)
        .filter((x) => !q || x.nama.toLowerCase().includes(q) || x.penyelenggara.toLowerCase().includes(q))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return page(rows.map(strip), r.query);
    }
    if (method === 'POST') {
      if (!can('record.write')) return deny();
      const errors = validateRecord(body, kind);
      if (Object.keys(errors).length) return fail(400, 'Data tidak valid.', errors, 'validation');
      const { version: _v, ...rest } = body;
      const row: Rec = rec(kind, 'DRAFT', rest.nama, { ...rest, dosen: rest.dosen ?? [] }, c.user.email, 0);
      s.records.unshift(row);
      audit(s, 'record.create', 'record', row.id);
      return ok(strip(row), 201);
    }
  }
  if (id === 'export') return can('export') ? ok({}) : deny();

  const row = mine.find((x) => x.id === id);
  if (!row) return fail(404, 'Data tidak ditemukan.');
  const move = (from: RecordStatus[], to: RecordStatus, perm: Permission, note?: string): MockResult => {
    if (!can(perm)) return deny();
    if (!from.includes(row.status)) return fail(409, `Status ${row.status} tidak dapat dipindah ke ${to}.`, undefined, 'conflict');
    row.status = to;
    row.revision_note = note ?? null;
    row.updated_at = iso(0);
    row.version += 1;
    audit(s, `record.${action ?? 'update'}`, 'record', row.id);
    return ok(strip(row));
  };

  if (!action) {
    if (method === 'GET') return ok(strip(row));
    if (method === 'DELETE') {
      if (!can('record.write')) return deny();
      if (!['DRAFT', 'NEED_REVISION', 'SUBMITTED_INTERNAL', 'CANCELLED'].includes(row.status)) return fail(409, 'Data yang sudah diproses/terkirim tidak dapat dihapus.', undefined, 'conflict');
      s.records = s.records.filter((x) => x.id !== row.id);
      return ok();
    }
    if (method === 'PUT') {
      if (!can('record.write')) return deny();
      if (!['DRAFT', 'NEED_REVISION', 'SUBMITTED_INTERNAL'].includes(row.status)) return fail(409, 'Data berstatus ini tidak dapat diubah.', undefined, 'conflict');
      if (body.version !== row.version) return fail(409, 'Data telah diubah pengguna lain. Muat ulang.', undefined, 'conflict');
      const errors = validateRecord(body, kind);
      if (Object.keys(errors).length) return fail(400, 'Data tidak valid.', errors, 'validation');
      const { version: _v, ...rest } = body;
      Object.assign(row, rest, { version: row.version + 1, updated_at: iso(0) });
      return ok(strip(row));
    }
  }
  if (method !== 'POST') return fail(404, 'Data tidak ditemukan.');
  switch (action) {
    case 'submit-internal':
      return move(['DRAFT', 'NEED_REVISION'], 'SUBMITTED_INTERNAL', 'record.write');
    case 'verify':
      return move(['DRAFT', 'SUBMITTED_INTERNAL', 'NEED_REVISION'], 'VERIFIED', 'record.verify');
    case 'request-revision':
      if (!String(body.note ?? '').trim()) return fail(400, 'Data tidak valid.', { note: 'Catatan revisi 1-500 karakter.' }, 'validation');
      return move(['SUBMITTED_INTERNAL', 'VERIFIED'], 'NEED_REVISION', 'record.verify', String(body.note).trim());
    case 'cancel':
      return move(['DRAFT', 'SUBMITTED_INTERNAL', 'NEED_REVISION', 'VERIFIED', 'FAILED'], 'CANCELLED', 'record.verify');
    case 'queue': {
      if (!s.credential.is_connected) return fail(409, 'Hubungkan akun SIMKATMAWA terlebih dahulu di Pengaturan.', undefined, 'conflict');
      const res = move(['VERIFIED', 'FAILED'], 'QUEUED', 'record.submit');
      if (res.status === 200) {
        row.last_error = null;
        simulateSend(row.id);
      }
      return res;
    }
    default:
      return fail(404, 'Data tidak ditemukan.');
  }
}
