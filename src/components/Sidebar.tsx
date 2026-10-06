import React from 'react';
import { UserRole, TenantConfig } from '../types';
import {
  LayoutDashboard,
  Award,
  FileCheck2,
  BookmarkCheck,
  Trophy,
  GraduationCap,
  Landmark,
  HardDrive,
  FileText,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Wifi,
  ExternalLink,
  User,
  School,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  tenant: TenantConfig;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  onOpenTestApi: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  counts?: {
    prestasi: number;
    sertifikasi: number;
    rekognisi: number;
    kejuaraan: number;
    belmawa: number;
    institusi: number;
    documents: number;
  };
}

interface MenuItem {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  count?: number;
  badgeText?: string;
  statusDot?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  tenant,
  activeRole,
  setActiveRole,
  onOpenTestApi,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  counts = {
    prestasi: 0,
    sertifikasi: 0,
    rekognisi: 0,
    kejuaraan: 0,
    belmawa: 0,
    institusi: 70,
    documents: 0,
  },
}) => {
  const roles: { value: UserRole; label: string; short: string; badge: string }[] = [
    { value: 'ADMIN_PT', label: 'Pimpinan & Admin PT', short: 'Admin PT', badge: 'bg-emerald-500/20 text-emerald-300' },
    { value: 'ADMIN_KEMAHASISWAAN', label: 'Direktorat Kemahasiswaan', short: 'Biro Mawa', badge: 'bg-blue-500/20 text-blue-300' },
    { value: 'ADMIN_PRODI', label: 'Pengelola Program Studi', short: 'Prodi', badge: 'bg-indigo-500/20 text-indigo-300' },
    { value: 'MAHASISWA', label: 'Mahasiswa Berprestasi', short: 'Mahasiswa', badge: 'bg-amber-500/20 text-amber-300' },
    { value: 'DOSEN_PEMBINA', label: 'Dosen Pembina & Pendamping', short: 'Dosen', badge: 'bg-purple-500/20 text-purple-300' },
    { value: 'AUDITOR', label: 'Auditor Mutu Internal', short: 'Auditor', badge: 'bg-rose-500/20 text-rose-300' },
    { value: 'SUPER_ADMIN', label: 'Super Admin Sistem', short: 'Super Admin', badge: 'bg-teal-500/20 text-teal-300' },
  ];

  const currentRoleObj = roles.find((r) => r.value === activeRole) || roles[0];

  const menuSections: MenuSection[] = [
    {
      title: 'MENU UTAMA',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard Eksekutif',
          shortLabel: 'Dashboard',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: 'PRESTASI & AKTIVITAS',
      items: [
        {
          id: 'prestasi-mandiri',
          label: 'Prestasi Mandiri',
          shortLabel: 'Prestasi',
          icon: Award,
          count: counts.prestasi,
        },
        {
          id: 'sertifikasi',
          label: 'Sertifikasi Mahasiswa',
          shortLabel: 'Sertifikasi',
          icon: FileCheck2,
          count: counts.sertifikasi,
        },
        {
          id: 'rekognisi',
          label: 'Rekognisi & Capaian',
          shortLabel: 'Rekognisi',
          icon: BookmarkCheck,
          count: counts.rekognisi,
        },
        {
          id: 'kejuaraan',
          label: 'Kejuaraan Kampus',
          shortLabel: 'Kejuaraan',
          icon: Trophy,
          count: counts.kejuaraan,
        },
        {
          id: 'belmawa',
          label: 'Program Belmawa',
          shortLabel: 'Belmawa',
          icon: GraduationCap,
          badgeText: 'Nasional',
          count: counts.belmawa,
        },
      ],
    },
    {
      title: 'TATA KELOLA INSTITUSI',
      items: [
        {
          id: 'institusi',
          label: 'Indikator Institusi',
          shortLabel: 'Institusi',
          icon: Landmark,
          badgeText: '70 Ind.',
        },
        {
          id: 'dokumen-r2',
          label: 'Repositori Dokumen',
          shortLabel: 'Dokumen',
          icon: HardDrive,
          count: counts.documents,
        },
      ],
    },
    {
      title: 'SISTEM & INTEGRASI',
      items: [
        {
          id: 'logs',
          label: 'Log Transaksi Integrasi',
          shortLabel: 'Log Integrasi',
          icon: FileText,
          statusDot: tenant.is_simkatmawa_connected ? 'bg-emerald-400' : 'bg-amber-400',
        },
        {
          id: 'settings',
          label: 'Pengaturan Sistem',
          shortLabel: 'Pengaturan',
          icon: Settings,
        },
      ],
    },
  ];

  const handleSelectTab = (tabId: string) => {
    setCurrentTab(tabId);
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0c182c] text-slate-300 border-r border-[#1e2a44] select-none">
      {/* Institutional Top Brand Header */}
      <div className="p-4 border-b border-[#1b2b48] bg-[#091322] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* SEVIMA Modern Style Crest Shield Logo */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-700 via-teal-600 to-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0 border border-teal-400/40 relative">
            <School className="w-5 h-5 text-white" />
            <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#091322]" />
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-white tracking-wider uppercase">STUDENT CONNECT</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  SIAKAD
                </span>
              </div>
              <div className="text-[11px] text-teal-200/90 font-medium truncate" title={tenant.nama_pt}>
                {tenant.nama_pt}
              </div>
              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                <span>Kode: {tenant.kode_pt}</span>
                <span>•</span>
                <span className="text-teal-400 font-semibold">{tenant.tahun_aktif}</span>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title={isCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
        {menuSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                {section.title}
              </div>
            )}

            {section.items.map((item) => {
              const isActive = currentTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group relative cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-teal-700 to-teal-800 text-white font-semibold shadow-sm border border-teal-500/40'
                      : 'text-slate-300 hover:text-white hover:bg-white/6'
                  } ${isCollapsed ? 'justify-center px-2' : 'justify-between'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-teal-200' : 'text-slate-400 group-hover:text-teal-300'
                      }`}
                    />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {!isCollapsed && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.count !== undefined && item.count > 0 && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-teal-900/80 text-teal-200 border border-teal-600'
                              : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}

                      {item.badgeText && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {item.badgeText}
                        </span>
                      )}

                      {item.statusDot && (
                        <span className={`w-2 h-2 rounded-full ${item.statusDot} shadow-xs`} />
                      )}
                    </div>
                  )}

                  {/* Active Indicator Bar on Left */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal-300 rounded-r-md" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Institutional Status Card */}
      {!isCollapsed && (
        <div className="p-3 mx-3 mb-3 bg-[#081220] rounded-xl border border-[#1b2b48] space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Wifi className="w-3 h-3 text-teal-400" />
              Layanan Nasional:
            </span>
            <button
              onClick={onOpenTestApi}
              className="font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span>Terhubung</span>
            </button>
          </div>
          <div className="text-[10px] text-slate-400 flex justify-between pt-1 border-t border-slate-800">
            <span>Arsip Dokumen</span>
            <span className="text-slate-300 font-medium">Terverifikasi</span>
          </div>
        </div>
      )}

      {/* User Session & Role Profile Footer */}
      <div className="p-3 border-t border-[#1b2b48] bg-[#091322]">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-2`}>
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-teal-400 flex items-center justify-center font-bold text-xs border border-slate-700 shrink-0">
              <User className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate leading-tight">
                  Dr. Hendra Wijaya
                </div>
                <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                  <span className={`px-1 rounded text-[9px] font-semibold ${currentRoleObj.badge}`}>
                    {currentRoleObj.short}
                  </span>
                </div>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <div className="shrink-0">
              <button
                onClick={() => {
                  const roleKeys = roles.map((r) => r.value);
                  const currentIdx = roleKeys.indexOf(activeRole);
                  const nextIdx = (currentIdx + 1) % roleKeys.length;
                  setActiveRole(roleKeys[nextIdx]);
                }}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Ganti Peran Cepat (Simulasi Multi-Role SIAKAD)"
              >
                <ShieldCheck className="w-4 h-4 text-teal-400" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Left Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-300 z-30 h-screen sticky top-0 ${
          isCollapsed ? 'w-20' : 'w-64 xl:w-72'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Mobile Drawer Sidebar */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};
