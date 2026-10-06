import React, { useState, useEffect } from 'react';
import {
  TenantConfig,
  UserRole,
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
} from './types';
import { StorageService } from './services/storage';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DashboardView } from './components/DashboardView';
import { PrestasiMandiriView } from './components/PrestasiMandiriView';
import { SertifikasiView } from './components/SertifikasiView';
import { RekognisiView } from './components/RekognisiView';
import { KejuaraanView } from './components/KejuaraanView';
import { InstitusiView } from './components/InstitusiView';
import { DocumentVaultView } from './components/DocumentVaultView';
import { SimkatmawaQueueLogsView } from './components/SimkatmawaQueueLogsView';
import { PrestasiBelmawaView } from './components/PrestasiBelmawaView';
import { SettingsConfigView } from './components/SettingsConfigView';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { SimkatmawaApiService } from './services/simkatmawaApi';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [activeRole, setActiveRole] = useState<UserRole>('ADMIN_PT');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  const [tenant, setTenant] = useState<TenantConfig>(StorageService.getTenant());
  const [prestasiList, setPrestasiList] = useState<PrestasiMandiri[]>(
    StorageService.getPrestasiMandiri()
  );
  const [sertifikasiList, setSertifikasiList] = useState<Sertifikasi[]>(
    StorageService.getSertifikasi()
  );
  const [rekognisiList, setRekognisiList] = useState<Rekognisi[]>(
    StorageService.getRekognisi()
  );
  const [kejuaraanList, setKejuaraanList] = useState<KejuaraanItem[]>(
    StorageService.getKejuaraan()
  );
  const [institusiList, setInstitusiList] = useState<InstitusiIndikator[]>(
    StorageService.getInstitusiIndikator()
  );
  const [institusiFin, setInstitusiFin] = useState<InstitusiFinansial>(
    StorageService.getInstitusiFinansial()
  );
  const [belmawaList, setBelmawaList] = useState<PrestasiBelmawaItem[]>(
    StorageService.getPrestasiBelmawa()
  );
  const [documents, setDocuments] = useState<DocumentR2[]>(StorageService.getDocuments());
  const [logs, setLogs] = useState<SimkatmawaSubmissionLog[]>(StorageService.getLogs());
  const [enumMappings, setEnumMappings] = useState<EnumMapping[]>(
    StorageService.getEnumMappings()
  );

  const [previewDoc, setPreviewDoc] = useState<{
    url: string;
    title: string;
    meta?: Partial<DocumentR2>;
  } | null>(null);

  const [isTestApiOpen, setIsTestApiOpen] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [testApiResult, setTestApiResult] = useState<{ success: boolean; message: string } | null>(
    null
  );

  useEffect(() => {
    StorageService.saveActiveRole(activeRole);
  }, [activeRole]);

  const handleUpdateTenant = (newTenant: TenantConfig) => {
    setTenant(newTenant);
    StorageService.saveTenant(newTenant);
  };

  const handleUpdatePrestasi = (items: PrestasiMandiri[]) => {
    setPrestasiList(items);
    StorageService.savePrestasiMandiri(items);
    setLogs(StorageService.getLogs());
    setDocuments(StorageService.getDocuments());
  };

  const handleUpdateSertifikasi = (items: Sertifikasi[]) => {
    setSertifikasiList(items);
    StorageService.saveSertifikasi(items);
    setLogs(StorageService.getLogs());
    setDocuments(StorageService.getDocuments());
  };

  const handleUpdateRekognisi = (items: Rekognisi[]) => {
    setRekognisiList(items);
    StorageService.saveRekognisi(items);
    setLogs(StorageService.getLogs());
    setDocuments(StorageService.getDocuments());
  };

  const handleUpdateKejuaraan = (items: KejuaraanItem[]) => {
    setKejuaraanList(items);
    StorageService.saveKejuaraan(items);
  };

  const handleUpdateInstitusiIndikator = (items: InstitusiIndikator[]) => {
    setInstitusiList(items);
    StorageService.saveInstitusiIndikator(items);
  };

  const handleUpdateInstitusiFin = (fin: InstitusiFinansial) => {
    setInstitusiFin(fin);
    StorageService.saveInstitusiFinansial(fin);
  };

  const handleUpdateBelmawa = (items: PrestasiBelmawaItem[]) => {
    setBelmawaList(items);
    StorageService.savePrestasiBelmawa(items);
  };

  const handleUpdateDocuments = (docs: DocumentR2[]) => {
    setDocuments(docs);
    StorageService.saveDocuments(docs);
  };

  const handleResetAllData = () => {
    StorageService.resetAll();
    setTenant(StorageService.getTenant());
    setPrestasiList(StorageService.getPrestasiMandiri());
    setSertifikasiList(StorageService.getSertifikasi());
    setRekognisiList(StorageService.getRekognisi());
    setKejuaraanList(StorageService.getKejuaraan());
    setInstitusiList(StorageService.getInstitusiIndikator());
    setInstitusiFin(StorageService.getInstitusiFinansial());
    setBelmawaList(StorageService.getPrestasiBelmawa());
    setDocuments(StorageService.getDocuments());
    setLogs(StorageService.getLogs());
    setEnumMappings(StorageService.getEnumMappings());
    alert('Seluruh data berhasil di-reset ke kondisi awal!');
  };

  const handleQuickTestApi = async () => {
    setIsTestingApi(true);
    setTestApiResult(null);
    try {
      const res = await SimkatmawaApiService.login(tenant.simkatmawa_email, 'valid_demo_password');
      setTestApiResult({
        success: res.success,
        message: res.message || res.error || 'Uji koneksi selesai.',
      });
      if (res.success) {
        setTenant((prev) => ({ ...prev, is_simkatmawa_connected: true }));
      }
    } catch (e: any) {
      setTestApiResult({ success: false, message: e.message || 'Gagal terhubung.' });
    } finally {
      setIsTestingApi(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans selection:bg-teal-700 selection:text-white text-slate-800">
      {/* SEVIMA Modern Style Executive Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        tenant={tenant}
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        onOpenTestApi={() => setIsTestApiOpen(true)}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        counts={{
          prestasi: prestasiList.length,
          sertifikasi: sertifikasiList.length,
          rekognisi: rekognisiList.length,
          kejuaraan: kejuaraanList.length,
          belmawa: belmawaList.length,
          institusi: institusiList.length,
          documents: documents.length,
        }}
      />

      {/* Main View Area with Top Header */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-slate-50">
        <TopHeader
          currentTab={currentTab}
          tenant={tenant}
          activeRole={activeRole}
          setActiveRole={setActiveRole}
          onOpenTestApi={() => setIsTestApiOpen(true)}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          setIsMobileOpen={setIsMobileOpen}
        />

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {currentTab === 'dashboard' && (
            <DashboardView
              tenant={tenant}
              activeRole={activeRole}
              prestasiList={prestasiList}
              sertifikasiList={sertifikasiList}
              rekognisiList={rekognisiList}
              documents={documents}
              logs={logs}
              onNavigate={(tab) => setCurrentTab(tab)}
              onOpenTestApi={() => setIsTestApiOpen(true)}
            />
          )}

          {currentTab === 'prestasi-mandiri' && (
            <PrestasiMandiriView
              tenant={tenant}
              activeRole={activeRole}
              items={prestasiList}
              onUpdateItems={handleUpdatePrestasi}
              onPreviewDocument={(url, title) => setPreviewDoc({ url, title })}
            />
          )}

          {currentTab === 'sertifikasi' && (
            <SertifikasiView
              tenant={tenant}
              activeRole={activeRole}
              items={sertifikasiList}
              onUpdateItems={handleUpdateSertifikasi}
              onPreviewDocument={(url, title) => setPreviewDoc({ url, title })}
            />
          )}

          {currentTab === 'rekognisi' && (
            <RekognisiView
              tenant={tenant}
              activeRole={activeRole}
              items={rekognisiList}
              onUpdateItems={handleUpdateRekognisi}
              onPreviewDocument={(url, title) => setPreviewDoc({ url, title })}
            />
          )}

          {currentTab === 'kejuaraan' && (
            <KejuaraanView
              tenant={tenant}
              activeRole={activeRole}
              items={kejuaraanList}
              onUpdateItems={handleUpdateKejuaraan}
              onPreviewDocument={(url, title) => setPreviewDoc({ url, title })}
            />
          )}

          {currentTab === 'belmawa' && (
            <PrestasiBelmawaView
              tenant={tenant}
              activeRole={activeRole}
              items={belmawaList}
              onUpdateItems={handleUpdateBelmawa}
            />
          )}

          {currentTab === 'institusi' && (
            <InstitusiView
              tenant={tenant}
              activeRole={activeRole}
              indikatorList={institusiList}
              finansialData={institusiFin}
              onUpdateIndikator={handleUpdateInstitusiIndikator}
              onUpdateFinansial={handleUpdateInstitusiFin}
              onPreviewDocument={(url, title) => setPreviewDoc({ url, title })}
            />
          )}

          {currentTab === 'dokumen-r2' && (
            <DocumentVaultView
              tenant={tenant}
              activeRole={activeRole}
              documents={documents}
              onUpdateDocuments={handleUpdateDocuments}
              onPreviewDocument={(url, title, meta) => setPreviewDoc({ url, title, meta })}
            />
          )}

          {currentTab === 'logs' && (
            <SimkatmawaQueueLogsView
              tenant={tenant}
              activeRole={activeRole}
              logs={logs}
              onRefreshLogs={() => setLogs(StorageService.getLogs())}
            />
          )}

          {currentTab === 'settings' && (
            <div className="space-y-8">
              <SettingsConfigView
                tenant={tenant}
                activeRole={activeRole}
                enumMappings={enumMappings}
                onUpdateTenant={handleUpdateTenant}
                onUpdateEnumMappings={(mappings) => {
                  setEnumMappings(mappings);
                  StorageService.saveEnumMappings(mappings);
                }}
                onResetAllData={handleResetAllData}
              />

              <div className="pt-6 border-t border-slate-200">
                <PrestasiBelmawaView
                  tenant={tenant}
                  activeRole={activeRole}
                  items={belmawaList}
                  onUpdateItems={handleUpdateBelmawa}
                />
              </div>
            </div>
          )}
        </main>

        {/* Clean quiet footer */}
        <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-500 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="font-semibold text-slate-800">Student Connect</span>
              <span> — Portal Eksekutif SIAKAD Manajemen Prestasi & Kemahasiswaan</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>Standar Layanan Kemdiktisaintek RI</span>
              <span>·</span>
              <span>Repositori Dokumen Digital Terverifikasi</span>
              <span>·</span>
              <span>Sistem Manajemen Kemahasiswaan Terpadu</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          documentUrl={previewDoc.url}
          documentTitle={previewDoc.title}
          documentMeta={previewDoc.meta}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Quick Test Connection Modal */}
      {isTestApiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Uji Koneksi Layanan Nasional</h3>
                <p className="text-xs text-slate-500">Validasi Akses & Kredensial Perguruan Tinggi</p>
              </div>
              <button
                onClick={() => {
                  setIsTestApiOpen(false);
                  setTestApiResult(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Perguruan Tinggi:</span>
                  <span className="font-bold text-slate-800">{tenant.nama_pt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kode PT:</span>
                  <span className="font-mono text-slate-800">{tenant.kode_pt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email Akun:</span>
                  <span className="font-mono text-slate-800 truncate max-w-[200px]">{tenant.simkatmawa_email}</span>
                </div>
              </div>

              {testApiResult && (
                <div
                  className={`p-3 rounded-lg border flex items-start gap-2 ${
                    testApiResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  {testApiResult.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <span>{testApiResult.message}</span>
                </div>
              )}

              <p className="text-slate-500 text-[11px] leading-relaxed">
                Uji koneksi mensimulasikan login ke server Kemdiktisaintek untuk memvalidasi token bearer aktif dan izin kode PT.
              </p>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsTestApiOpen(false);
                    setTestApiResult(null);
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={isTestingApi}
                  onClick={handleQuickTestApi}
                  className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{isTestingApi ? 'Menghubungkan...' : 'Jalankan Tes Login'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
