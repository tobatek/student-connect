import React from 'react';
import {
  PrestasiMandiri,
  Sertifikasi,
  Rekognisi,
  DocumentR2,
  SimkatmawaSubmissionLog,
  TenantConfig,
  UserRole,
} from '../types';
import {
  Award,
  FileCheck2,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  FileText,
  ChevronRight,
  TrendingUp,
  Building2,
  Calendar,
  Layers,
  GraduationCap,
  ShieldCheck,
  Check,
  ExternalLink,
} from 'lucide-react';

interface DashboardViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  prestasiList: PrestasiMandiri[];
  sertifikasiList: Sertifikasi[];
  rekognisiList: Rekognisi[];
  documents: DocumentR2[];
  logs: SimkatmawaSubmissionLog[];
  onNavigate: (tab: string) => void;
  onOpenTestApi: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  tenant,
  activeRole,
  prestasiList,
  sertifikasiList,
  rekognisiList,
  documents,
  logs,
  onNavigate,
  onOpenTestApi,
}) => {
  // Combine all student achievements
  const allSubmissions = [
    ...prestasiList.map((p) => ({
      id: p.id,
      title: `${p.lomba}${p.cabang ? ` (${p.cabang})` : ''}`,
      category: 'Prestasi Mandiri',
      level: p.level,
      status: p.status,
      date: p.tgl_sertifikat || p.created_at,
      student: p.mahasiswa[0]?.nama || 'Mahasiswa',
      prodi: p.mahasiswa[0]?.prodi || 'Program Studi',
      tab: 'prestasi-mandiri',
    })),
    ...sertifikasiList.map((s) => ({
      id: s.id,
      title: s.nama,
      category: 'Sertifikasi Keahlian',
      level: s.level,
      status: s.status,
      date: s.tgl_sertifikat || s.created_at,
      student: s.mahasiswa[0]?.nama || 'Mahasiswa',
      prodi: s.mahasiswa[0]?.prodi || 'Program Studi',
      tab: 'sertifikasi',
    })),
    ...rekognisiList.map((r) => ({
      id: r.id,
      title: r.nama,
      category: 'Rekognisi & Capaian',
      level: r.level,
      status: r.status,
      date: r.tgl_sertifikat || r.created_at,
      student: r.mahasiswa[0]?.nama || 'Mahasiswa',
      prodi: r.mahasiswa[0]?.prodi || 'Program Studi',
      tab: 'rekognisi',
    })),
  ];

  const totalAll = allSubmissions.length;
  const totalSent = allSubmissions.filter((item) => item.status === 'SENT').length;
  const totalVerified = allSubmissions.filter((item) => item.status === 'VERIFIED').length;
  const totalPending = allSubmissions.filter((item) => item.status === 'SUBMITTED_INTERNAL').length;
  const totalNeedRevision = allSubmissions.filter((item) => item.status === 'NEED_REVISION').length;

  // Breakdown by Level
  const levelCounts = {
    INT: allSubmissions.filter((i) => i.level === 'INT').length,
    NAS: allSubmissions.filter((i) => i.level === 'NAS').length,
    PROV: allSubmissions.filter((i) => i.level === 'PROV').length,
    KAB: allSubmissions.filter((i) => i.level === 'KAB').length,
  };

  // Recent Submissions (Sorted descending)
  const recentSubmissions = [...allSubmissions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Terkirim ke Nasional
          </span>
        );
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Check className="w-3 h-3 text-blue-600" />
            Disetujui Internal
          </span>
        );
      case 'SUBMITTED_INTERNAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Menunggu Verifikasi
          </span>
        );
      case 'NEED_REVISION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Perlu Perbaikan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            Draf
          </span>
        );
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'INT':
        return 'Internasional';
      case 'NAS':
        return 'Nasional';
      case 'PROV':
        return 'Provinsi';
      case 'KAB':
        return 'Kabupaten / Kota';
      default:
        return level;
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Welcome & Key Summary Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 tracking-wide uppercase">
              <Building2 className="w-4 h-4" />
              <span>{tenant.nama_pt}</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500 font-normal">Tahun Akademik {tenant.tahun_aktif}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Ringkasan Capaian Prestasi & Kemahasiswaan
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              Ikhtisar pelaporan resmi capaian mahasiswa, status verifikasi institusi, dan integrasi pangkalan data nasional untuk pimpinan dan pengelola perguruan tinggi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('prestasi-mandiri')}
              className="px-4 py-2.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Tinjau Usulan ({totalPending})</span>
            </button>
            <button
              onClick={() => onNavigate('institusi')}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer border border-slate-200"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>Laporan Institusi</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Clean High-Level KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Usulan Capaian</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 font-mono tracking-tight">{totalAll}</span>
            <span className="text-xs text-slate-500 font-medium">berkas</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
            <span className="font-semibold text-teal-800">{prestasiList.length}</span> lomba,{' '}
            <span className="font-semibold text-teal-800">{sertifikasiList.length}</span> sertifikasi,{' '}
            <span className="font-semibold text-teal-800">{rekognisiList.length}</span> rekognisi
          </div>
        </div>

        {/* Sent to National Database */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Terkirim ke Nasional</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-700 font-mono tracking-tight">{totalSent}</span>
            <span className="text-xs text-slate-500 font-medium">tercatat</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>Telah diakui di Pangkalan Data Nasional</span>
          </div>
        </div>

        {/* Pending Verification */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Menunggu Verifikasi</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-amber-700 font-mono tracking-tight">{totalPending}</span>
            <span className="text-xs text-slate-500 font-medium">menunggu</span>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            <span>Usulan mahasiswa & prodi yang perlu diperiksa</span>
          </div>
        </div>

        {/* Verified Internal */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Siap Dilaporkan</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-blue-700 font-mono tracking-tight">{totalVerified}</span>
            <span className="text-xs text-slate-500 font-medium">disetujui</span>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            <span>Lolos kurasi dan siap dikirim ke pusat</span>
          </div>
        </div>
      </div>

      {/* 2-Column Clean Breakdown: Level Scale & Category Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Level Distribution Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Sebaran Capaian Berdasarkan Tingkat
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Klasifikasi skala prestasi dari tingkat internasional hingga wilayah
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              {totalAll} Kegiatan
            </span>
          </div>

          <div className="space-y-4 pt-2">
            {/* Internasional */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  Tingkat Internasional
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {levelCounts.INT} <span className="text-slate-400 font-normal">({totalAll > 0 ? Math.round((levelCounts.INT / totalAll) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                  style={{ width: `${totalAll > 0 ? (levelCounts.INT / totalAll) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Nasional */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
                  Tingkat Nasional
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {levelCounts.NAS} <span className="text-slate-400 font-normal">({totalAll > 0 ? Math.round((levelCounts.NAS / totalAll) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all duration-500"
                  style={{ width: `${totalAll > 0 ? (levelCounts.NAS / totalAll) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Provinsi */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  Tingkat Provinsi
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {levelCounts.PROV} <span className="text-slate-400 font-normal">({totalAll > 0 ? Math.round((levelCounts.PROV / totalAll) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-500"
                  style={{ width: `${totalAll > 0 ? (levelCounts.PROV / totalAll) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Kabupaten / Kota */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Tingkat Kabupaten / Kota
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {levelCounts.KAB} <span className="text-slate-400 font-normal">({totalAll > 0 ? Math.round((levelCounts.KAB / totalAll) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${totalAll > 0 ? (levelCounts.KAB / totalAll) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modules & Category Overview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Status Ringkas Per Modul
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rekapitulasi per bidang kegiatan kemahasiswaan
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Prestasi Mandiri Card */}
              <div
                onClick={() => onNavigate('prestasi-mandiri')}
                className="p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <Award className="w-5 h-5 text-teal-800" />
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-800 transition-colors" />
                </div>
                <div className="text-lg font-bold text-slate-900 font-mono">{prestasiList.length}</div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">Prestasi Mandiri</div>
                <div className="text-[11px] text-slate-500 mt-1">Lomba sains, olahraga & seni</div>
              </div>

              {/* Sertifikasi Card */}
              <div
                onClick={() => onNavigate('sertifikasi')}
                className="p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <FileCheck2 className="w-5 h-5 text-teal-800" />
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-800 transition-colors" />
                </div>
                <div className="text-lg font-bold text-slate-900 font-mono">{sertifikasiList.length}</div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">Sertifikasi Keahlian</div>
                <div className="text-[11px] text-slate-500 mt-1">Kompetensi profesi & LSP</div>
              </div>

              {/* Rekognisi Card */}
              <div
                onClick={() => onNavigate('rekognisi')}
                className="p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <BookmarkCheck className="w-5 h-5 text-teal-800" />
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-800 transition-colors" />
                </div>
                <div className="text-lg font-bold text-slate-900 font-mono">{rekognisiList.length}</div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">Rekognisi Capaian</div>
                <div className="text-[11px] text-slate-500 mt-1">Paten, jurnal, duta, juri</div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verifikasi Berjenjang Aktif</span>
            </span>
            <span className="text-slate-400 font-mono">{documents.length} Berkas Bukti Sah Tersimpan</span>
          </div>
        </div>
      </div>

      {/* Recent Submissions Table for Executive Attention */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Aktivitas Usulan Capaian Terkini
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar usulan capaian mahasiswa terbaru yang membutuhkan peninjauan atau telah disahkan
            </p>
          </div>
          <button
            onClick={() => onNavigate('prestasi-mandiri')}
            className="text-xs font-semibold text-teal-800 hover:text-teal-950 flex items-center gap-1 cursor-pointer"
          >
            <span>Lihat Semua Usulan</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-5">Nama Kegiatan / Capaian</th>
                <th className="py-3 px-4">Mahasiswa & Program Studi</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Tingkat</th>
                <th className="py-3 px-4">Status Pengajuan</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentSubmissions.map((item) => (
                <tr key={`${item.tab}-${item.id}`} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-slate-900 max-w-xs truncate">
                    {item.title}
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">
                    <div className="font-medium text-slate-900">{item.student}</div>
                    <div className="text-[11px] text-slate-500">{item.prodi}</div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700 font-medium">
                    {getLevelLabel(item.level)}
                  </td>
                  <td className="py-3.5 px-4">
                    {getStatusBadge(item.status)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => onNavigate(item.tab)}
                      className="px-3 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300 text-slate-700 rounded-lg font-medium transition-colors border border-slate-200 cursor-pointer"
                    >
                      Buka
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
