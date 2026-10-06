import React, { useState } from 'react';
import { TenantConfig, EnumMapping, UserRole } from '../types';
import {
  Settings,
  Building2,
  Key,
  ListFilter,
  CheckCircle,
  AlertCircle,
  Save,
  RotateCcw,
  Check,
} from 'lucide-react';
import { SimkatmawaApiService } from '../services/simkatmawaApi';

interface SettingsConfigViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  enumMappings: EnumMapping[];
  onUpdateTenant: (tenant: TenantConfig) => void;
  onUpdateEnumMappings: (mappings: EnumMapping[]) => void;
  onResetAllData: () => void;
}

export const SettingsConfigView: React.FC<SettingsConfigViewProps> = ({
  tenant,
  activeRole,
  enumMappings,
  onUpdateTenant,
  onUpdateEnumMappings,
  onResetAllData,
}) => {
  const [formTenant, setFormTenant] = useState<TenantConfig>(tenant);
  const [passwordInput, setPasswordInput] = useState('••••••••••••');
  const [isTestingLogin, setIsTestingLogin] = useState(false);
  const [loginTestResult, setLoginTestResult] = useState<{ success: boolean; message: string } | null>(
    null
  );
  const [saveNotice, setSaveNotice] = useState(false);

  const handleSaveTenant = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateTenant(formTenant);
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2500);
  };

  const handleTestLogin = async () => {
    setIsTestingLogin(true);
    setLoginTestResult(null);

    try {
      const res = await SimkatmawaApiService.login(
        formTenant.simkatmawa_email,
        passwordInput.startsWith('•') ? 'valid_demo_password' : passwordInput
      );

      if (res.success) {
        setLoginTestResult({
          success: true,
          message: res.message || 'Koneksi ke Portal Nasional berhasil.',
        });
        setFormTenant((prev) => ({
          ...prev,
          is_simkatmawa_connected: true,
          last_token: res.raw_response?.token || prev.last_token,
        }));
      } else {
        setLoginTestResult({
          success: false,
          message: res.error || 'Gagal login ke Portal Nasional.',
        });
      }
    } catch (e: any) {
      setLoginTestResult({
        success: false,
        message: e.message || 'Kesalahan jaringan.',
      });
    } finally {
      setIsTestingLogin(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Konfigurasi Sistem Perguruan Tinggi</span>
            <span>·</span>
            <span className="font-semibold text-teal-800">Student Connect</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-teal-800" />
            Pengaturan Identitas Kampus, Akses Layanan & Standar Pelaporan
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Pengelolaan identitas perguruan tinggi, akses resmi Kemdiktisaintek, domain repositori dokumen bukti, dan tabel referensi kode standar nasional.
          </p>
        </div>

        <button
          onClick={() => {
            if (confirm('Reset seluruh data ke kondisi awal (factory seed)? Semua perubahan lokal akan dikembalikan.')) {
              onResetAllData();
            }
          }}
          className="px-3.5 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset ke Data Awal Seed</span>
        </button>
      </div>

      {saveNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Pengaturan tenant berhasil disimpan ke sistem!</span>
        </div>
      )}

      {/* Main Grid: Form Tenant & Kredensial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Data Tenant & Pelaporan */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-teal-800" />
              Profil Perguruan Tinggi (Tenant)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Informasi identitas kampus yang digunakan pada header laporan dan payload integrasi.
            </p>

            <form onSubmit={handleSaveTenant} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nama Perguruan Tinggi</label>
                <input
                  type="text"
                  value={formTenant.nama_pt}
                  onChange={(e) => setFormTenant({ ...formTenant, nama_pt: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kode PT (PDDikti/Dikti)</label>
                  <input
                    type="text"
                    value={formTenant.kode_pt}
                    onChange={(e) => setFormTenant({ ...formTenant, kode_pt: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Kode perguruan tinggi resmi kementerian
                  </span>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tahun Aktif Pelaporan</label>
                  <input
                    type="number"
                    value={formTenant.tahun_aktif}
                    onChange={(e) => setFormTenant({ ...formTenant, tahun_aktif: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Tahun periode pengiriman saat ini
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Domain Repositori Dokumen Bukti</label>
                <input
                  type="url"
                  value={formTenant.r2_bucket_domain}
                  onChange={(e) => setFormTenant({ ...formTenant, r2_bucket_domain: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Domain penyimpanan permanen untuk verifikasi dokumen bukti Kemdiktisaintek
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formTenant.allow_kab_rekognisi}
                    onChange={(e) =>
                      setFormTenant({ ...formTenant, allow_kab_rekognisi: e.target.checked })
                    }
                    className="w-4 h-4 text-teal-800 rounded"
                  />
                  <span className="font-semibold text-slate-800">
                    Aktifkan Opsi Level "Kabupaten/Kota (KAB)" pada Modul Rekognisi
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-6 leading-relaxed">
                  Default pelaporan nasional menggunakan tingkat Provinsi, Nasional, dan Internasional. Opsi ini dapat diaktifkan jika kriteria penilaian internal kampus mensyaratkan tingkat kota/kabupaten.
                </p>
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Pengaturan Tenant</span>
              </button>
            </form>
          </div>
        </div>

        {/* Card 2: Kredensial & Test Login */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
              <Key className="w-4 h-4 text-teal-800" />
              Kredensial Akses Portal Layanan Nasional Kemdiktisaintek
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Autentikasi akun perguruan tinggi untuk sinkronisasi resmi.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Alamat Layanan Portal Nasional</label>
                <input
                  type="url"
                  value={formTenant.simkatmawa_api_url}
                  onChange={(e) => setFormTenant({ ...formTenant, simkatmawa_api_url: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Email Akun Layanan Nasional</label>
                <input
                  type="email"
                  value={formTenant.simkatmawa_email}
                  onChange={(e) => setFormTenant({ ...formTenant, simkatmawa_email: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Password Akun</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Password tersimpan aman terenkripsi dan tidak pernah diekspos ke publik
                </span>
              </div>

              {loginTestResult && (
                <div
                  className={`p-3 rounded-lg border flex items-start gap-2 ${
                    loginTestResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  {loginTestResult.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <span>{loginTestResult.message}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="font-semibold text-slate-800 block">Status Token Aktif:</span>
                <div className="font-mono text-[11px] text-slate-600 truncate">
                  {formTenant.last_token || 'Belum di-generate'}
                </div>
                <div className="text-[10px] text-slate-400">
                  Worker otomatis memperbarui token saat respons 401 Unauthorized diterima.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-slate-500 text-xs">Uji Endpoint: <strong className="font-mono">/api/login</strong></span>
            <button
              disabled={isTestingLogin}
              onClick={handleTestLogin}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isTestingLogin ? 'Menghubungkan...' : 'Uji Koneksi & Login'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Enum Mappings Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-teal-800" />
              Tabel Mapping Nilai Internal ke Kode Standar Nasional
            </h3>
            <p className="text-xs text-slate-500">
              Memetakan label internal kampus ke string enum yang diterima server pangkalan data nasional.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-2.5 px-4">Kategori Mapping</th>
                <th className="py-2.5 px-4">Label Internal Kampus</th>
                <th className="py-2.5 px-4">Kode Standar Nasional</th>
                <th className="py-2.5 px-4">Keterangan Regulasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enumMappings.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-medium text-slate-500 uppercase text-[11px]">
                    {m.category}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{m.internal_label}</td>
                  <td className="py-2.5 px-4 font-mono font-bold text-teal-850 text-[11px]">
                    {m.simkatmawa_code}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 text-[11px]">{m.keterangan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
