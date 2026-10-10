import React from 'react';
import { UserRole, TenantConfig } from '../types';
import {
  ShieldCheck,
  Building2,
  ChevronDown,
  Layers,
  Award,
  FileCheck2,
  BookmarkCheck,
  Trophy,
  Landmark,
  HardDrive,
  FileText,
  Settings,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  tenant: TenantConfig;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  onOpenTestApi: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  tenant,
  activeRole,
  setActiveRole,
  onOpenTestApi,
}) => {
  const [roleDropdownOpen, setRoleDropdownOpen] = React.useState(false);

  const roles: { value: UserRole; label: string; desc: string }[] = [
    { value: 'ADMIN_PT', label: 'Pimpinan & Admin PT', desc: 'Otoritas verifikasi final & sinkronisasi pusat' },
    { value: 'ADMIN_KEMAHASISWAAN', label: 'Direktorat Kemahasiswaan', desc: 'Validasi, kurasi & review data' },
    { value: 'ADMIN_PRODI', label: 'Pengelola Program Studi', desc: 'Verifikasi usulan mahasiswa tingkat prodi' },
    { value: 'MAHASISWA', label: 'Mahasiswa Berprestasi', desc: 'Pengajuan capaian & repositori bukti' },
    { value: 'DOSEN_PEMBINA', label: 'Dosen Pembina & Pendamping', desc: 'Pengesahan surat tugas & bimbingan lomba' },
    { value: 'AUDITOR', label: 'Auditor Mutu Internal', desc: 'Pemeriksaan kepatuhan & audit trail' },
    { value: 'SUPER_ADMIN', label: 'Super Admin Sistem', desc: 'Tata kelola tenant & konfigurasi global' },
  ];

  const currentRoleObj = roles.find((r) => r.value === activeRole) || roles[0];

  const navLinks = [
    { id: 'dashboard', label: 'Dashboard', icon: Layers },
    { id: 'prestasi-mandiri', label: 'Prestasi Mandiri', icon: Award },
    { id: 'sertifikasi', label: 'Sertifikasi', icon: FileCheck2 },
    { id: 'rekognisi', label: 'Rekognisi', icon: BookmarkCheck },
    { id: 'kejuaraan', label: 'Kejuaraan Kampus', icon: Trophy },
    { id: 'institusi', label: 'Indikator Institusi', icon: Landmark },
    { id: 'dokumen-r2', label: 'Repositori R2', icon: HardDrive },
    { id: 'logs', label: 'Log Integrasi', icon: FileText },
    { id: 'settings', label: 'Konfigurasi', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Top Institutional Header */}
      <div className="bg-slate-950 text-slate-300 text-xs px-4 sm:px-8 py-1.5 flex items-center justify-between border-b border-slate-850">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-medium text-white tracking-wide">
            <Building2 className="w-3.5 h-3.5 text-teal-400" />
            {tenant.nama_pt}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Kode PT: <strong className="text-slate-200 font-mono">{tenant.kode_pt}</strong></span>
          <span className="hidden md:inline text-slate-600">·</span>
          <span className="hidden md:inline text-slate-400">Tahun Pelaporan: <strong className="text-teal-400 font-mono">{tenant.tahun_aktif}</strong></span>
        </div>

        <div className="flex items-center gap-3">
          {/* National Portal Connection Status */}
          <button
            onClick={onOpenTestApi}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Klik untuk uji koneksi API Portal Nasional"
          >
            <span className={`w-2 h-2 rounded-full ${tenant.is_simkatmawa_connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400'}`} />
            <span>Portal Nasional: <span className="text-emerald-400 font-medium">Terhubung</span></span>
          </button>
          <span className="text-slate-750">|</span>
          <span className="text-slate-400 hidden sm:inline">R2 Vault: <strong className="text-slate-200">Non-Expired</strong></span>
        </div>
      </div>

      {/* Main Bar: Clean 3-Zone Contract */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand title single element */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold text-sm shadow-xs border border-teal-700/60">
            SC
          </div>
          <div>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setCurrentTab('dashboard');
              }}
              className="text-base font-bold tracking-tight text-slate-900 block leading-tight hover:text-teal-800 transition-colors"
            >
              Student Connect
            </a>
            <span className="text-[11px] text-slate-500 block">Portal Repositori & Pelaporan Kemahasiswaan</span>
          </div>
        </div>

        {/* Zone 2: Navigation Links (single-line, clean unboxed hover states) */}
        <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1">
          {navLinks.map((link) => {
            const isActive = currentTab === link.id;
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                onClick={() => setCurrentTab(link.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'text-teal-900 bg-teal-50/90 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-700' : 'text-slate-400'}`} />
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Actions & Role Switcher */}
        <div className="flex items-center gap-2.5 shrink-0 relative">
          <div className="relative">
            <button
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              <div className="text-left">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold leading-none">Akses Peran</span>
                <span className="font-semibold text-slate-900 leading-tight">{currentRoleObj.label}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {roleDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setRoleDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 z-50 py-1.5 text-xs">
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <span className="font-semibold text-slate-800 block">Pilih Simulasi Role</span>
                    <span className="text-[11px] text-slate-500">Melihat antarmuka sesuai wewenang</span>
                  </div>
                  {roles.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => {
                        setActiveRole(r.value);
                        setRoleDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex flex-col hover:bg-slate-50 cursor-pointer ${
                        activeRole === r.value ? 'bg-teal-50/70 border-l-2 border-teal-700' : ''
                      }`}
                    >
                      <span className={`font-medium ${activeRole === r.value ? 'text-teal-900 font-semibold' : 'text-slate-800'}`}>
                        {r.label}
                      </span>
                      <span className="text-[11px] text-slate-500 leading-tight">{r.desc}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav bar */}
      <div className="lg:hidden border-t border-slate-100 bg-slate-50/90 px-4 py-1.5 overflow-x-auto flex items-center gap-1">
        {navLinks.map((link) => {
          const isActive = currentTab === link.id;
          return (
            <button
              key={link.id}
              onClick={() => setCurrentTab(link.id)}
              className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-teal-800 text-white font-medium'
                  : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
              }`}
            >
              {link.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
