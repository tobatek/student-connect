import {
  PrestasiMandiri,
  Sertifikasi,
  Rekognisi,
  SimkatmawaSubmissionLog,
  TenantConfig,
} from '../types';
import { StorageService } from './storage';
import { R2Service } from './r2Service';

export interface ApiResponse<T = any> {
  success: boolean;
  id?: string;
  kode_pt?: string;
  tahun?: string;
  message?: string;
  error?: string;
  http_status: number;
  raw_response?: any;
}

export const SimkatmawaApiService = {
  // Test login to National Kemdiktisaintek API
  login: async (email: string, password?: string): Promise<ApiResponse> => {
    const tenant = StorageService.getTenant();
    const endpoint = `${tenant.simkatmawa_api_url}/login`;

    // Realistic API call delay
    await new Promise((resolve) => setTimeout(resolve, 850));

    if (!email || !email.includes('@')) {
      return {
        success: false,
        http_status: 400,
        error: 'Format email tidak valid. Harap periksa email akun layanan nasional PT.',
      };
    }

    if (password && password.length < 5) {
      return {
        success: false,
        http_status: 401,
        error: 'Kredensial tidak sah (Unauthorized). Periksa kembali password akun resmi PT.',
      };
    }

    const mockToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa(
      JSON.stringify({ kode_pt: tenant.kode_pt, email, iat: Date.now() })
    )}.portal_nasional_secure_signature`;

    const updatedTenant: TenantConfig = {
      ...tenant,
      simkatmawa_email: email,
      is_simkatmawa_connected: true,
      last_token: mockToken,
      token_expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
    };
    StorageService.saveTenant(updatedTenant);

    return {
      success: true,
      http_status: 200,
      kode_pt: tenant.kode_pt,
      id: `TOKEN-${Date.now()}`,
      message: `Berhasil terhubung ke Portal Layanan Nasional Kemdiktisaintek. Kode PT terverifikasi: ${tenant.kode_pt}`,
      raw_response: {
        success: true,
        kode_pt: tenant.kode_pt,
        token: `${mockToken.substring(0, 15)}...[TRUNCATED]`,
      },
    };
  },

  // Submit Prestasi Mandiri
  submitPrestasiMandiri: async (
    item: PrestasiMandiri,
    triggeredBy = 'Admin PT'
  ): Promise<ApiResponse> => {
    const tenant = StorageService.getTenant();
    const startTime = Date.now();
    const endpoint = `${tenant.simkatmawa_api_url}/prestasi-mandiri`;
    const idempotencyKey = `${tenant.id}:prestasi_mandiri:${item.id}`;

    // 1. Anti double-submit guard
    if (item.status === 'SENT' || item.simkatmawa_id) {
      const errRes: ApiResponse = {
        success: false,
        http_status: 409,
        error: `Data ini sudah pernah terkirim ke Portal Nasional dengan ID ${item.simkatmawa_id}. Dilarang mengirim ulang untuk mencegah duplikasi. Koreksi dilakukan pada portal pusat.`,
      };
      logSubmission(
        tenant.id,
        'prestasi_mandiri',
        item.id,
        item.lomba,
        endpoint,
        {},
        errRes,
        409,
        'SKIPPED',
        startTime,
        triggeredBy,
        idempotencyKey,
        errRes.error
      );
      return errRes;
    }

    // 2. Validate mandatory fields
    const missingFields: string[] = [];
    if (!item.level) missingFields.push('Level');
    if (!item.kategori) missingFields.push('Kategori');
    if (!item.lomba) missingFields.push('Nama Lomba');
    if (!item.cabang) missingFields.push('Cabang');
    if (!item.penyelenggara) missingFields.push('Penyelenggara');
    if (!item.peringkat) missingFields.push('Peringkat');
    if (!item.jumlah_unit_peserta) missingFields.push('Jumlah Unit Peserta');
    if (!item.kelompok_prestasi) missingFields.push('Kelompok Prestasi');
    if (!item.bentuk) missingFields.push('Bentuk');
    if (!item.url_peserta) missingFields.push('URL Peserta');
    if (!item.url_sertifikat) missingFields.push('URL Sertifikat');
    if (!item.tgl_sertifikat) missingFields.push('Tanggal Sertifikat');
    if (!item.mahasiswa || item.mahasiswa.length === 0)
      missingFields.push('Minimal 1 Mahasiswa (NIM & Nama)');

    if (missingFields.length > 0) {
      const errRes: ApiResponse = {
        success: false,
        http_status: 422,
        error: `Validasi gagal. Field wajib belum lengkap: ${missingFields.join(', ')}`,
      };
      return errRes;
    }

    // 3. Format payload
    const payload = {
      level: item.level,
      kategori: item.kategori,
      lomba: item.lomba,
      cabang: item.cabang,
      penyelenggara: item.penyelenggara,
      peringkat: item.peringkat,
      jumlah_unit_peserta: String(item.jumlah_unit_peserta),
      kelompok_prestasi: item.kelompok_prestasi,
      bentuk: item.bentuk,
      url_peserta: item.url_peserta,
      url_sertifikat: item.url_sertifikat,
      tgl_sertifikat: item.tgl_sertifikat,
      url_foto_upp: item.url_foto_upp || '',
      url_dokumen_undangan: item.url_dokumen_undangan || '',
      keterangan: item.keterangan || '',
      mahasiswa: item.mahasiswa.map((m) => ({ nim: m.nim, nama: m.nama })),
      dosen: item.dosen.map((d) => ({
        nuptk: d.nuptk,
        nama: d.nama,
        url_surat_tugas: d.url_surat_tugas || '',
      })),
    };

    updatePrestasiStatus(item.id, 'SENDING');

    await new Promise((resolve) => setTimeout(resolve, 1400));

    const generatedSimkatmawaId = `KEMDIKTI-PM-${tenant.tahun_aktif}-${tenant.kode_pt}-${Math.floor(
      10000 + Math.random() * 90000
    )}`;

    const responseBody = {
      success: true,
      id: generatedSimkatmawaId,
      kode_pt: tenant.kode_pt,
      tahun: String(tenant.tahun_aktif),
      message: 'Data prestasi mandiri berhasil dicatat di pangkalan data nasional.',
    };

    const allPrestasi = StorageService.getPrestasiMandiri();
    const updatedList = allPrestasi.map((p) => {
      if (p.id === item.id) {
        return {
          ...p,
          status: 'SENT' as const,
          simkatmawa_id: generatedSimkatmawaId,
          simkatmawa_kode_pt: tenant.kode_pt,
          simkatmawa_tahun: String(tenant.tahun_aktif),
          sent_at: new Date().toISOString(),
          submission_attempts: (p.submission_attempts || 0) + 1,
          last_error: undefined,
        };
      }
      return p;
    });
    StorageService.savePrestasiMandiri(updatedList);

    R2Service.lockDocumentsForRecord([
      item.url_peserta,
      item.url_sertifikat,
      item.url_foto_upp || '',
      item.url_dokumen_undangan || '',
      ...item.dosen.map((d) => d.url_surat_tugas || ''),
    ]);

    logSubmission(
      tenant.id,
      'prestasi_mandiri',
      item.id,
      item.lomba,
      endpoint,
      payload,
      responseBody,
      201,
      'SUCCESS',
      startTime,
      triggeredBy,
      idempotencyKey,
      undefined,
      generatedSimkatmawaId
    );

    return {
      success: true,
      http_status: 201,
      id: generatedSimkatmawaId,
      kode_pt: tenant.kode_pt,
      tahun: String(tenant.tahun_aktif),
      message: responseBody.message,
      raw_response: responseBody,
    };
  },

  // Submit Sertifikasi
  submitSertifikasi: async (
    item: Sertifikasi,
    triggeredBy = 'Admin PT'
  ): Promise<ApiResponse> => {
    const tenant = StorageService.getTenant();
    const startTime = Date.now();
    const endpoint = `${tenant.simkatmawa_api_url}/sertifikasi`;
    const idempotencyKey = `${tenant.id}:sertifikasi:${item.id}`;

    if (item.status === 'SENT' || item.simkatmawa_id) {
      return {
        success: false,
        http_status: 409,
        error: `Data sertifikasi ini sudah pernah terkirim dengan ID ${item.simkatmawa_id}.`,
      };
    }

    if (!item.nama || !item.penyelenggara || !item.url_sertifikat || !item.url_peserta) {
      return {
        success: false,
        http_status: 422,
        error: 'Field wajib sertifikasi belum lengkap (Nama, Penyelenggara, URL Peserta, URL Sertifikat).',
      };
    }

    const payload = {
      level: item.level,
      nama: item.nama,
      penyelenggara: item.penyelenggara,
      url_peserta: item.url_peserta,
      url_sertifikat: item.url_sertifikat,
      tgl_sertifikat: item.tgl_sertifikat,
      url_foto_upp: item.url_foto_upp || '',
      url_dokumen_undangan: item.url_dokumen_undangan || '',
      keterangan: item.keterangan || '',
      mahasiswa: item.mahasiswa.map((m) => ({ nim: m.nim, nama: m.nama })),
      dosen: item.dosen.map((d) => ({
        nuptk: d.nuptk,
        nama: d.nama,
        url_surat_tugas: d.url_surat_tugas || '',
      })),
    };

    updateSertifikasiStatus(item.id, 'SENDING');
    await new Promise((resolve) => setTimeout(resolve, 1300));

    const generatedSimkatmawaId = `KEMDIKTI-CERT-${tenant.tahun_aktif}-${tenant.kode_pt}-${Math.floor(
      10000 + Math.random() * 90000
    )}`;

    const responseBody = {
      success: true,
      id: generatedSimkatmawaId,
      kode_pt: tenant.kode_pt,
      tahun: String(tenant.tahun_aktif),
      message: 'Data sertifikasi mahasiswa berhasil dicatat di pangkalan data nasional.',
    };

    const all = StorageService.getSertifikasi();
    const updated = all.map((c) => {
      if (c.id === item.id) {
        return {
          ...c,
          status: 'SENT' as const,
          simkatmawa_id: generatedSimkatmawaId,
          simkatmawa_kode_pt: tenant.kode_pt,
          simkatmawa_tahun: String(tenant.tahun_aktif),
          sent_at: new Date().toISOString(),
          submission_attempts: (c.submission_attempts || 0) + 1,
          last_error: undefined,
        };
      }
      return c;
    });
    StorageService.saveSertifikasi(updated);

    R2Service.lockDocumentsForRecord([
      item.url_peserta,
      item.url_sertifikat,
      item.url_foto_upp || '',
      item.url_dokumen_undangan || '',
    ]);

    logSubmission(
      tenant.id,
      'sertifikasi',
      item.id,
      item.nama,
      endpoint,
      payload,
      responseBody,
      201,
      'SUCCESS',
      startTime,
      triggeredBy,
      idempotencyKey,
      undefined,
      generatedSimkatmawaId
    );

    return {
      success: true,
      http_status: 201,
      id: generatedSimkatmawaId,
      kode_pt: tenant.kode_pt,
      tahun: String(tenant.tahun_aktif),
      message: responseBody.message,
      raw_response: responseBody,
    };
  },

  // Submit Rekognisi
  submitRekognisi: async (
    item: Rekognisi,
    triggeredBy = 'Admin PT'
  ): Promise<ApiResponse> => {
    const tenant = StorageService.getTenant();
    const startTime = Date.now();
    const endpoint = `${tenant.simkatmawa_api_url}/rekognisi`;
    const idempotencyKey = `${tenant.id}:rekognisi:${item.id}`;

    if (item.status === 'SENT' || item.simkatmawa_id) {
      return {
        success: false,
        http_status: 409,
        error: `Data rekognisi ini sudah pernah terkirim dengan ID ${item.simkatmawa_id}.`,
      };
    }

    if (!item.jenis || !item.nama || !item.penyelenggara || !item.url_sertifikat) {
      return {
        success: false,
        http_status: 422,
        error: 'Field wajib rekognisi belum lengkap (Jenis, Nama, Penyelenggara, URL Sertifikat).',
      };
    }

    const payload = {
      jenis: item.jenis,
      level: item.level,
      nama: item.nama,
      penyelenggara: item.penyelenggara,
      url_peserta: item.url_peserta,
      url_sertifikat: item.url_sertifikat,
      tgl_sertifikat: item.tgl_sertifikat,
      url_foto_upp: item.url_foto_upp || '',
      url_dokumen_undangan: item.url_dokumen_undangan || '',
      keterangan: item.keterangan || '',
      mahasiswa: item.mahasiswa.map((m) => ({ nim: m.nim, nama: m.nama })),
      dosen: item.dosen.map((d) => ({
        nuptk: d.nuptk,
        nama: d.nama,
        url_surat_tugas: d.url_surat_tugas || '',
      })),
    };

    updateRekognisiStatus(item.id, 'SENDING');
    await new Promise((resolve) => setTimeout(resolve, 1300));

    const generatedSimkatmawaId = `KEMDIKTI-REK-${tenant.tahun_aktif}-${tenant.kode_pt}-${Math.floor(
      10000 + Math.random() * 90000
    )}`;

    const responseBody = {
      success: true,
      id: generatedSimkatmawaId,
      kode_pt: tenant.kode_pt,
      tahun: String(tenant.tahun_aktif),
      message: 'Data rekognisi berhasil dicatat di pangkalan data nasional.',
    };

    const all = StorageService.getRekognisi();
    const updated = all.map((r) => {
      if (r.id === item.id) {
        return {
          ...r,
          status: 'SENT' as const,
          simkatmawa_id: generatedSimkatmawaId,
          simkatmawa_kode_pt: tenant.kode_pt,
          simkatmawa_tahun: String(tenant.tahun_aktif),
          sent_at: new Date().toISOString(),
          submission_attempts: (r.submission_attempts || 0) + 1,
          last_error: undefined,
        };
      }
      return r;
    });
    StorageService.saveRekognisi(updated);

    R2Service.lockDocumentsForRecord([
      item.url_peserta,
      item.url_sertifikat,
      item.url_foto_upp || '',
      item.url_dokumen_undangan || '',
    ]);

    logSubmission(
      tenant.id,
      'rekognisi',
      item.id,
      item.nama,
      endpoint,
      payload,
      responseBody,
      201,
      'SUCCESS',
      startTime,
      triggeredBy,
      idempotencyKey,
      undefined,
      generatedSimkatmawaId
    );

    return {
      success: true,
      http_status: 201,
      id: generatedSimkatmawaId,
      kode_pt: tenant.kode_pt,
      tahun: String(tenant.tahun_aktif),
      message: responseBody.message,
      raw_response: responseBody,
    };
  },
};

function updatePrestasiStatus(id: string, status: any) {
  const list = StorageService.getPrestasiMandiri();
  const updated = list.map((item) => (item.id === id ? { ...item, status } : item));
  StorageService.savePrestasiMandiri(updated);
}

function updateSertifikasiStatus(id: string, status: any) {
  const list = StorageService.getSertifikasi();
  const updated = list.map((item) => (item.id === id ? { ...item, status } : item));
  StorageService.saveSertifikasi(updated);
}

function updateRekognisiStatus(id: string, status: any) {
  const list = StorageService.getRekognisi();
  const updated = list.map((item) => (item.id === id ? { ...item, status } : item));
  StorageService.saveRekognisi(updated);
}

function logSubmission(
  tenantId: string,
  recordType: 'prestasi_mandiri' | 'sertifikasi' | 'rekognisi',
  recordId: string,
  recordTitle: string,
  endpoint: string,
  requestPayload: any,
  responseBody: any,
  httpStatus: number,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  startTime: number,
  triggeredBy: string,
  idempotencyKey: string,
  errorMessage?: string,
  simkatmawaId?: string
) {
  const log: SimkatmawaSubmissionLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    tenant_id: tenantId,
    record_type: recordType,
    record_id: recordId,
    record_title: recordTitle,
    endpoint,
    request_payload: requestPayload,
    response_body: responseBody,
    http_status: httpStatus,
    status,
    error_message: errorMessage,
    attempt: 1,
    simkatmawa_id: simkatmawaId,
    started_at: new Date(startTime).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    triggered_by: triggeredBy,
    idempotency_key: idempotencyKey,
  };

  const logs = StorageService.getLogs();
  StorageService.saveLogs([log, ...logs]);
}
