import React, { useState, useRef, useEffect } from 'react';
import { UserRole, TenantConfig } from '../types';
import {
  Menu,
  ShieldCheck,
  ChevronDown,
  Calendar,
  Building2,
  HardDrive,
  Check,
  CheckCircle2,
  Lock,
  Search,
  Bell,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface TopHeaderProps {
  currentTab: string;
  tenant: TenantConfig;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  onOpenTestApi: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  setIsMobileOpen: (open: boolean) => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentTab,
  tenant,
  activeRole,
  setActiveRole,
  onOpenTestApi,
  isCollapsed,
  setIsCollapsed,
  setIsMobileOpen,
}) => {
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setRoleDropdownOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const roles: { value: UserRole; label: string; desc: string; badge: string }[] = [
    {
      value: 'ADMIN_PT',
      label: 'Pimpinan & Admin PT',
      desc: 'Otoritas verifikasi final & sinkronisasi pusat',
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    {
      value: 'ADMIN_KEMAHASISWAAN',
      label: 'Direktorat Kemahasiswaan',
      desc: 'Validasi, kurasi & review data berjenjang',
      badge: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    {
      value: 'ADMIN_PRODI',
      label: 'Pengelola Program Studi',
      desc: 'Verifikasi usulan mahasiswa tingkat prodi',
      badge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    },
    {
      value: 'MAHASISWA',
      label: 'Mahasiswa Berprestasi',
      desc: 'Pengajuan capaian prestasi & repositori berkas',
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      value: 'DOSEN_PEMBINA',
      label: 'Dosen Pembina & Pendamping',
      desc: 'Pengesahan surat tugas & bimbingan lomba',
      badge: 'bg-purple-50 text-purple-800 border-purple-200',
    },
    {
      value: 'AUDITOR',
      label: 'Auditor Mutu Internal',
      desc: 'Pemeriksaan kepatuhan & audit trail',
      badge: 'bg-rose-50 text-rose-800 border-rose-200',
    },
    {
      value: 'SUPER_ADMIN',
      label: 'Super Admin Sistem',
      desc: 'Tata kelola tenant & konfigurasi global',
      badge: 'bg-teal-50 text-teal-800 border-teal-200',
    },
  ];

  const currentRoleObj = roles.find((r) => r.value === activeRole) || roles[0];

  const tabLabels: Record<string, { title: string; section: string }> = {
    dashboard: { title: 'Dashboard Eksekutif', section: 'Ringkasan & Metrik Kemahasiswaan' },
    'prestasi-mandiri': { title: 'Prestasi Mandiri', section: 'Kompetisi, Lomba & Rekognisi Mahasiswa' },
    sertifikasi: { title: 'Sertifikasi Kompetensi', section: 'Uji Kompetensi & Sertifikasi Profesi' },
    rekognisi: { title: 'Rekognisi & Penghargaan', section: '14 Kategori Rekognisi Kemahasiswaan' },
    kejuaraan: { title: 'Kejuaraan Kampus', section: 'Event & Kejuaraan Diselenggarakan PT' },
    belmawa: { title: 'Program Belmawa', section: 'Pusat Prestasi & Rekam Jejak Nasional' },
    institusi: { title: 'Indikator Tata Kelola', section: '70 Standar Tata Kelola Institusi' },
    'dokumen-r2': { title: 'Repositori Dokumen', section: 'Arsip Dokumen & Sertifikat Digital' },
    logs: { title: 'Log Transaksi & Integrasi', section: 'Riwayat Sinkronisasi Layanan Nasional' },
    settings: { title: 'Pengaturan Sistem', section: 'Konfigurasi Tenant & Parameter Sistem' },
  };

  const currentMeta = tabLabels[currentTab] || { title: 'Portal SIAKAD', section: 'Student Connect' };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      {/* Topmost Institutional Thin Bar */}
      <div className="bg-slate-900 text-slate-300 text-[11px] px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <span className="flex items-center gap-1.5 font-semibold text-white tracking-wide truncate">
            <Building2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            {tenant.nama_pt}
          </span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-slate-400 hidden sm:inline">
            Kode PT: <strong className="text-slate-200 font-mono">{tenant.kode_pt}</strong>
          </span>
          <span className="text-slate-600 hidden md:inline">|</span>
          <span className="text-slate-400 hidden md:flex items-center gap-1">
            <Calendar className="w-3 h-3 text-teal-400" />
            Tahun Pelaporan: <strong className="text-teal-400 font-mono">{tenant.tahun_aktif}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Status Portal Nasional Button */}
          <button
            onClick={onOpenTestApi}
            className="flex items-center gap-1.5 text-[11px] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Klik untuk uji koneksi Layanan Nasional"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                tenant.is_simkatmawa_connected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-amber-400'
              }`}
            />
            <span className="hidden sm:inline">Layanan Nasional:</span>
            <span className="text-emerald-400 font-medium">Terhubung</span>
          </button>
          <span className="text-slate-700">|</span>
          <span className="text-slate-400 text-[11px] flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-teal-400" />
            <span className="hidden sm:inline">Dokumen Bukti:</span>
            <strong className="text-slate-200 font-medium">Sah</strong>
          </span>
        </div>
      </div>

      {/* Main Bar: Clean Breadcrumbs & Executive Profile Action Zone */}
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Mobile Toggle & Page Title Breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger menu button */}
          <button
            onClick={() => setIsMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Buka Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>SIAKAD Kemahasiswaan</span>
              <span>/</span>
              <span className="text-teal-800 font-semibold">{currentMeta.section}</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
              {currentMeta.title}
            </h1>
          </div>
        </div>

        {/* Right: Academic Semester Pill, Notification & Executive Role Switcher */}
        <div className="flex items-center gap-2 sm:gap-3" ref={dropdownRef}>
          {/* Semester Badge */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/90 text-slate-700 rounded-lg text-xs font-medium border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-teal-700" />
            <span>Semester Ganjil 2025/2026</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>

          {/* Quick Role Switcher (Sevima Modern Style) */}
          <div className="relative">
            <button
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 transition-all shadow-2xs cursor-pointer"
            >
              <div className="w-6 h-6 rounded-md bg-teal-800 text-white flex items-center justify-center font-bold text-[10px]">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold leading-none">
                  Akses Peran
                </div>
                <div className="font-bold text-slate-900 leading-tight">
                  {currentRoleObj.label}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Role Dropdown Menu */}
            {roleDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-xs font-bold text-slate-900">Pilih Mode Hak Akses (RBAC)</div>
                  <div className="text-[11px] text-slate-500">
                    Sistem multi-peran dengan pembatasan hak review, verifikasi & kirim.
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto py-1 space-y-1">
                  {roles.map((r) => {
                    const isSelected = activeRole === r.value;
                    return (
                      <button
                        key={r.value}
                        onClick={() => {
                          setActiveRole(r.value);
                          setRoleDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50/80 text-teal-950 font-medium border border-teal-200/80'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div
                          className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-teal-700 text-white'
                              : 'border border-slate-300 text-transparent'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 flex items-center justify-between">
                            <span>{r.label}</span>
                            {isSelected && (
                              <span className="text-[10px] text-teal-800 font-semibold bg-teal-100/60 px-1.5 py-0.5 rounded">
                                Aktif
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                            {r.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
