import React, { useState } from 'react';
import {
  InstitusiIndikator,
  InstitusiFinansial,
  UserRole,
  TenantConfig,
} from '../types';
import {
  Landmark,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  Save,
  Download,
  Check,
} from 'lucide-react';
import { R2Service } from '../services/r2Service';

interface InstitusiViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  indikatorList: InstitusiIndikator[];
  finansialData: InstitusiFinansial;
  onUpdateIndikator: (list: InstitusiIndikator[]) => void;
  onUpdateFinansial: (fin: InstitusiFinansial) => void;
  onPreviewDocument: (url: string, title: string) => void;
}

export const InstitusiView: React.FC<InstitusiViewProps> = ({
  tenant,
  activeRole,
  indikatorList,
  finansialData,
  onUpdateIndikator,
  onUpdateFinansial,
  onPreviewDocument,
}) => {
  const [activeSeksi, setActiveSeksi] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('A');
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Financial inputs state
  const [finForm, setFinForm] = useState<InstitusiFinansial>(finansialData);

  const seksiTabs: { id: 'A' | 'B' | 'C' | 'D' | 'E'; label: string; desc: string }[] = [
    { id: 'A', label: 'Seksi A: Kelembagaan', desc: 'Regulasi, Layanan Konseling, Satgas PPKS, Kewirausahaan' },
    { id: 'B', label: 'Seksi B: SDM', desc: 'Pimpinan Kemahasiswaan & Tenaga Kependidikan Bersertifikat' },
    { id: 'C', label: 'Seksi C: Sarpras', desc: 'Sekretariat Ormawa, Sarana Olahraga, dan Seni Budaya' },
    { id: 'D', label: 'Seksi D: Pembiayaan', desc: 'Total Anggaran PT, Kemahasiswaan & Beasiswa Non-APBN' },
    { id: 'E', label: 'Seksi E: Penghargaan', desc: 'Regulasi Reward Prestasi Mahasiswa & Insentif Dosen' },
  ];

  const totalIndicators = indikatorList.length;
  const checkedIndicators = indikatorList.filter((i) => i.is_checked && i.document_url).length;
  const completionPercentage = Math.round((checkedIndicators / totalIndicators) * 100);

  const currentSeksiIndicators = indikatorList.filter((i) => i.seksi === activeSeksi);

  const handleToggleCheck = (id: string) => {
    const target = indikatorList.find((i) => i.id === id);
    if (!target) return;

    if (!target.is_checked && !target.document_url) {
      const url = prompt(
        'Sesuai Pedoman Kemahasiswaan: Indikator yang dicentang WAJIB melampirkan tautan dokumen bukti valid. Masukkan Tautan Dokumen Bukti Sah:'
      );
      if (!url) return;
      const updated = indikatorList.map((i) =>
        i.id === id
          ? {
              ...i,
              is_checked: true,
              document_url: url,
              document_name: url.split('/').pop() || 'dokumen-bukti.pdf',
            }
          : i
      );
      onUpdateIndikator(updated);
      return;
    }

    const updated = indikatorList.map((i) =>
      i.id === id ? { ...i, is_checked: !i.is_checked } : i
    );
    onUpdateIndikator(updated);
  };

  const handleUploadIndikatorDoc = async (id: string, file: File) => {
    try {
      const doc = await R2Service.uploadFile(
        file,
        'institusi',
        id,
        'laporan',
        'admin',
        'admin-pt',
        'Admin Kemahasiswaan'
      );
      const updated = indikatorList.map((i) =>
        i.id === id
          ? {
              ...i,
              document_url: doc.public_url,
              document_name: doc.original_filename,
              is_checked: true,
            }
          : i
      );
      onUpdateIndikator(updated);
    } catch (e: any) {
      alert(`Gagal upload dokumen: ${e.message}`);
    }
  };

  const handleSaveFinansial = (e: React.FormEvent) => {
    e.preventDefault();
    const ratio =
      finForm.total_anggaran_pt > 0
        ? Number(((finForm.total_anggaran_kemahasiswaan / finForm.total_anggaran_pt) * 100).toFixed(2))
        : 0;
    const finalData = { ...finForm, persentase_anggaran: ratio };
    onUpdateFinansial(finalData);
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 2500);
  };

  const handleExportLaporan = () => {
    const text = `LAPORAN PENGISIAN MODUL INDIKATOR KEMAHASISWAAN INSTITUSI
Perguruan Tinggi: ${tenant.nama_pt} (Kode PT: ${tenant.kode_pt})
Tahun Pelaporan: ${tenant.tahun_aktif}
Tingkat Kelengkapan: ${completionPercentage}% (${checkedIndicators} dari ${totalIndicators} indikator tersertifikasi dokumen)

DATA PEMBIAYAAN KEMAHASISWAAN (SEKSI D):
- Total Anggaran PT: Rp ${finForm.total_anggaran_pt.toLocaleString('id-ID')}
- Total Anggaran Kemahasiswaan: Rp ${finForm.total_anggaran_kemahasiswaan.toLocaleString('id-ID')} (${finForm.persentase_anggaran}%)
- Jumlah Penerima Beasiswa Non-APBN: ${finForm.jumlah_penerima_beasiswa_non_apbn} Mahasiswa

RINGKASAN INDIKATOR PER SEKSI:
${indikatorList
  .map(
    (ind) =>
      `[${ind.is_checked ? '✓' : ' '}] ${ind.code} ${ind.nama}
     Bukti Dokumen: ${ind.document_url || 'Belum Diunggah'}
     Catatan: ${ind.notes || '-'}`
  )
  .join('\n\n')}
`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rekap-indikator-institusi-${tenant.tahun_aktif}.txt`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Standar Kinerja Perguruan Tinggi</span>
            <span>·</span>
            <span className="font-semibold text-slate-700">70 Indikator Kemahasiswaan Nasional</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Landmark className="w-5 h-5 text-teal-800" />
            Checklist Indikator Institusi Kemahasiswaan
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Menata dan memverifikasi dokumen regulasi pembinaan, tata kelola SDM, sarana prasarana, data anggaran kemahasiswaan, dan beasiswa Non-APBN secara terstruktur dan siap diaudit.
          </p>
        </div>

        <button
          onClick={handleExportLaporan}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Rekap Dokumen</span>
        </button>
      </div>

      {/* Progress & Financial Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Progress Bar */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Kelengkapan Dokumen Bukti
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-teal-850 font-mono tabular-nums">
                {completionPercentage}%
              </span>
              <span className="text-xs text-slate-500">
                ({checkedIndicators}/{totalIndicators} indikator)
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
              <div
                className="bg-teal-800 h-2 rounded-full transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-3 block">
            Setiap indikator yang dicentang wajib memiliki tautan dokumen R2 permanen.
          </span>
        </div>

        {/* Anggaran Overview */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Porsi Anggaran Kemahasiswaan
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {finForm.persentase_anggaran}%
              </span>
              <span className="text-xs text-slate-500">dari pagu PT</span>
            </div>
            <div className="text-xs text-slate-600 mt-2 font-mono">
              Rp {finForm.total_anggaran_kemahasiswaan.toLocaleString('id-ID')} / Rp{' '}
              {finForm.total_anggaran_pt.toLocaleString('id-ID')}
            </div>
          </div>
          <span className="text-[11px] text-emerald-700 font-medium mt-3 block">
            Memenuhi standar rasio alokasi kemahasiswaan PT
          </span>
        </div>

        {/* Beasiswa Non-APBN */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Penerima Beasiswa Non-APBN
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {finForm.jumlah_penerima_beasiswa_non_apbn}
              </span>
              <span className="text-xs text-slate-500 font-medium">Mahasiswa</span>
            </div>
            <div className="text-xs text-slate-600 mt-2">
              Mitra industri, yayasan, CSR bank & alumni PT
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-3 block font-mono">
            Seksi D - Field Utama Pelaporan PT
          </span>
        </div>
      </div>

      {/* Tabs per Seksi */}
      <div className="flex items-center gap-1 overflow-x-auto p-1 bg-slate-100 rounded-lg">
        {seksiTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSeksi(tab.id)}
            className={`px-4 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
              activeSeksi === tab.id
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content depending on Active Seksi */}
      {activeSeksi === 'D' ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Seksi D: Form Data Pembiayaan Kemahasiswaan & Beasiswa
            </h3>
            <p className="text-xs text-slate-500">
              Data alokasi anggaran kegiatan dan mahasiswa penerima beasiswa non-pemerintah.
            </p>
          </div>

          {saveSuccessNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Data pembiayaan berhasil diperbarui dan disimpan!</span>
            </div>
          )}

          <form onSubmit={handleSaveFinansial} className="space-y-4 max-w-xl text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Total Anggaran Operasional Perguruan Tinggi (Tahun {tenant.tahun_aktif})
              </label>
              <div className="flex items-center">
                <span className="p-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-slate-500 font-mono">
                  Rp
                </span>
                <input
                  type="number"
                  value={finForm.total_anggaran_pt}
                  onChange={(e) => setFinForm({ ...finForm, total_anggaran_pt: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-r-lg font-mono text-xs"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Total Alokasi Anggaran Kegiatan Kemahasiswaan
              </label>
              <div className="flex items-center">
                <span className="p-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-slate-500 font-mono">
                  Rp
                </span>
                <input
                  type="number"
                  value={finForm.total_anggaran_kemahasiswaan}
                  onChange={(e) =>
                    setFinForm({ ...finForm, total_anggaran_kemahasiswaan: Number(e.target.value) })
                  }
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-r-lg font-mono text-xs"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Jumlah Mahasiswa Penerima Beasiswa Non-APBN
              </label>
              <input
                type="number"
                value={finForm.jumlah_penerima_beasiswa_non_apbn}
                onChange={(e) =>
                  setFinForm({ ...finForm, jumlah_penerima_beasiswa_non_apbn: Number(e.target.value) })
                }
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                required
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Beasiswa yayasan, mitra perbankan, CSR industri, atau ikatan alumni
              </span>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Perubahan Anggaran</span>
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Daftar Indikator Kemahasiswaan ({activeSeksi})
            </span>
            <span className="text-xs text-slate-500">
              Centang jika dokumen pendukung R2 telah lengkap
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {currentSeksiIndicators.map((ind) => (
              <div
                key={ind.id}
                className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                  ind.is_checked ? 'bg-teal-50/15' : 'hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-start gap-3 max-w-2xl">
                  <input
                    type="checkbox"
                    checked={ind.is_checked}
                    onChange={() => handleToggleCheck(ind.id)}
                    className="w-4 h-4 rounded text-teal-800 mt-1 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-teal-900 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                        {ind.code}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900">{ind.nama}</h4>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{ind.deskripsi}</p>
                    {ind.notes && (
                      <p className="text-[11px] text-slate-500 mt-1 italic">
                        Catatan: {ind.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto text-xs">
                  {ind.document_url ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onPreviewDocument(ind.document_url!, ind.nama)}
                        className="px-3 py-1.5 text-xs font-medium text-teal-850 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Lihat Dokumen R2</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      <span>Belum Ada Dokumen</span>
                    </span>
                  )}

                  <label className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleUploadIndikatorDoc(ind.id, e.target.files[0]);
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
