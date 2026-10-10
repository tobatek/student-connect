import {
  TenantConfig,
  PrestasiMandiri,
  Sertifikasi,
  Rekognisi,
  KejuaraanItem,
  InstitusiIndikator,
  InstitusiFinansial,
  PrestasiBelmawaItem,
  DocumentR2,
  SimkatmawaSubmissionLog,
  EnumMapping,
  UserRole,
} from '../types';
import {
  initialTenant,
  initialPrestasiMandiri,
  initialSertifikasi,
  initialRekognisi,
  initialKejuaraan,
  initialInstitusiIndikator,
  initialInstitusiFinansial,
  initialPrestasiBelmawa,
  initialDocuments,
  initialSubmissionLogs,
  initialEnumMappings,
} from '../data/mockData';

const STORAGE_KEYS = {
  TENANT: 'sc_tenant_v1',
  PRESTASI_MANDIRI: 'sc_prestasi_mandiri_v1',
  SERTIFIKASI: 'sc_sertifikasi_v1',
  REKOGNISI: 'sc_rekognisi_v1',
  KEJUARAAN: 'sc_kejuaraan_v1',
  INSTITUSI_INDIKATOR: 'sc_institusi_indikator_v1',
  INSTITUSI_FINANSIAL: 'sc_institusi_finansial_v1',
  PRESTASI_BELMAWA: 'sc_prestasi_belmawa_v1',
  DOCUMENTS: 'sc_documents_v1',
  LOGS: 'sc_submission_logs_v1',
  ENUM_MAPPINGS: 'sc_enum_mappings_v1',
  ACTIVE_ROLE: 'sc_active_role_v1',
};

function loadItem<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item) as T;
  } catch (e) {
    console.error(`Error loading key ${key}:`, e);
    return fallback;
  }
}

function saveItem<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving key ${key}:`, e);
  }
}

export const StorageService = {
  getTenant: (): TenantConfig => loadItem(STORAGE_KEYS.TENANT, initialTenant),
  saveTenant: (t: TenantConfig) => saveItem(STORAGE_KEYS.TENANT, t),

  getActiveRole: (): UserRole => loadItem(STORAGE_KEYS.ACTIVE_ROLE, 'ADMIN_PT'),
  saveActiveRole: (role: UserRole) => saveItem(STORAGE_KEYS.ACTIVE_ROLE, role),

  getPrestasiMandiri: (): PrestasiMandiri[] =>
    loadItem(STORAGE_KEYS.PRESTASI_MANDIRI, initialPrestasiMandiri),
  savePrestasiMandiri: (list: PrestasiMandiri[]) =>
    saveItem(STORAGE_KEYS.PRESTASI_MANDIRI, list),

  getSertifikasi: (): Sertifikasi[] =>
    loadItem(STORAGE_KEYS.SERTIFIKASI, initialSertifikasi),
  saveSertifikasi: (list: Sertifikasi[]) =>
    saveItem(STORAGE_KEYS.SERTIFIKASI, list),

  getRekognisi: (): Rekognisi[] =>
    loadItem(STORAGE_KEYS.REKOGNISI, initialRekognisi),
  saveRekognisi: (list: Rekognisi[]) =>
    saveItem(STORAGE_KEYS.REKOGNISI, list),

  getKejuaraan: (): KejuaraanItem[] =>
    loadItem(STORAGE_KEYS.KEJUARAAN, initialKejuaraan),
  saveKejuaraan: (list: KejuaraanItem[]) =>
    saveItem(STORAGE_KEYS.KEJUARAAN, list),

  getInstitusiIndikator: (): InstitusiIndikator[] =>
    loadItem(STORAGE_KEYS.INSTITUSI_INDIKATOR, initialInstitusiIndikator),
  saveInstitusiIndikator: (list: InstitusiIndikator[]) =>
    saveItem(STORAGE_KEYS.INSTITUSI_INDIKATOR, list),

  getInstitusiFinansial: (): InstitusiFinansial =>
    loadItem(STORAGE_KEYS.INSTITUSI_FINANSIAL, initialInstitusiFinansial),
  saveInstitusiFinansial: (fin: InstitusiFinansial) =>
    saveItem(STORAGE_KEYS.INSTITUSI_FINANSIAL, fin),

  getPrestasiBelmawa: (): PrestasiBelmawaItem[] =>
    loadItem(STORAGE_KEYS.PRESTASI_BELMAWA, initialPrestasiBelmawa),
  savePrestasiBelmawa: (list: PrestasiBelmawaItem[]) =>
    saveItem(STORAGE_KEYS.PRESTASI_BELMAWA, list),

  getDocuments: (): DocumentR2[] =>
    loadItem(STORAGE_KEYS.DOCUMENTS, initialDocuments),
  saveDocuments: (list: DocumentR2[]) =>
    saveItem(STORAGE_KEYS.DOCUMENTS, list),

  getLogs: (): SimkatmawaSubmissionLog[] =>
    loadItem(STORAGE_KEYS.LOGS, initialSubmissionLogs),
  saveLogs: (list: SimkatmawaSubmissionLog[]) =>
    saveItem(STORAGE_KEYS.LOGS, list),

  getEnumMappings: (): EnumMapping[] =>
    loadItem(STORAGE_KEYS.ENUM_MAPPINGS, initialEnumMappings),
  saveEnumMappings: (list: EnumMapping[]) =>
    saveItem(STORAGE_KEYS.ENUM_MAPPINGS, list),

  resetAll: () => {
    localStorage.removeItem(STORAGE_KEYS.TENANT);
    localStorage.removeItem(STORAGE_KEYS.PRESTASI_MANDIRI);
    localStorage.removeItem(STORAGE_KEYS.SERTIFIKASI);
    localStorage.removeItem(STORAGE_KEYS.REKOGNISI);
    localStorage.removeItem(STORAGE_KEYS.KEJUARAAN);
    localStorage.removeItem(STORAGE_KEYS.INSTITUSI_INDIKATOR);
    localStorage.removeItem(STORAGE_KEYS.INSTITUSI_FINANSIAL);
    localStorage.removeItem(STORAGE_KEYS.PRESTASI_BELMAWA);
    localStorage.removeItem(STORAGE_KEYS.DOCUMENTS);
    localStorage.removeItem(STORAGE_KEYS.LOGS);
    localStorage.removeItem(STORAGE_KEYS.ENUM_MAPPINGS);
  },
};
