import React, { useState } from 'react';
import {
  KejuaraanItem,
  UserRole,
  TenantConfig,
  LevelType,
  KategoriPrestasi,
} from '../types';
import {
  Trophy,
  Plus,
  FileText,
  Search,
  CheckCircle,
  ExternalLink,
  Download,
  AlertCircle,
  X,
  Upload,
} from 'lucide-react';
import { R2Service } from '../services/r2Service';

interface KejuaraanViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  items: KejuaraanItem[];
  onUpdateItems: (items: KejuaraanItem[]) => void;
  onPreviewDocument: (url: string, title: string) => void;
}

export const KejuaraanView: React.FC<KejuaraanViewProps> = ({
  tenant,
  activeRole,
  items,
  onUpdateItems,
  onPreviewDocument,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedKejuaraan, setSelectedKejuaraan] = useState<KejuaraanItem | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<KejuaraanItem>>({
    nama_ajang: '',
    jenis_penyelenggaraan: 'MANDIRI_TERVERIFIKASI',
    level: 'NAS',
    kategori: 'RISNOV',
    bentuk: 'HIBRID',
    tempat: '',
    url_ajang: '',
    tahun: tenant.tahun_aktif,
    url_laporan: '',
    total_peserta: 20,
    peserta_list: [''],
    juara_list: [''],
    is_ready_for_web_input: true,
  });

  const filteredItems = items.filter(
    (item) =>
      item.nama_ajang.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tempat.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenForm = () => {
    setFormData({
      nama_ajang: '',
      jenis_penyelenggaraan: 'MANDIRI_TERVERIFIKASI',
      level: 'NAS',
      kategori: 'RISNOV',
      bentuk: 'HIBRID',
      tempat: 'Kampus Utama / GOR',
      url_ajang: 'https://ameta.ac.id/events/',
      tahun: tenant.tahun_aktif,
      url_laporan: '',
      total_peserta: 25,
      peserta_list: ['Universitas A', 'Universitas B'],
      juara_list: ['Juara 1: Tim X', 'Juara 2: Tim Y'],
      is_ready_for_web_input: true,
    });
    setIsFormOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama_ajang || !formData.url_laporan) {
      alert('Nama ajang dan URL laporan kegiatan wajib diisi!');
      return;
    }

    const newItem: KejuaraanItem = {
      id: formData.id || `kj-${Date.now()}`,
      tenant_id: tenant.id,
      nama_ajang: formData.nama_ajang || '',
      jenis_penyelenggaraan: formData.jenis_penyelenggaraan || 'MANDIRI',
      level: formData.level as LevelType,
      kategori: formData.kategori as KategoriPrestasi,
      bentuk: formData.bentuk || 'LURING',
      tempat: formData.tempat || '',
      url_ajang: formData.url_ajang || '',
      tahun: Number(formData.tahun || tenant.tahun_aktif),
      url_laporan: formData.url_laporan || '',
      total_peserta: Number(formData.total_peserta || 0),
      peserta_list: (formData.peserta_list || []).filter((p) => p.trim() !== ''),
      juara_list: (formData.juara_list || []).filter((j) => j.trim() !== ''),
      is_ready_for_web_input: Boolean(formData.url_laporan && formData.url_ajang),
      created_at: new Date().toISOString(),
    };

    const exists = items.some((i) => i.id === newItem.id);
    const updated = exists ? items.map((i) => (i.id === newItem.id ? newItem : i)) : [newItem, ...items];
    onUpdateItems(updated);
    setIsFormOpen(false);
  };

  const handleUploadR2Laporan = async (file: File) => {
    try {
      const doc = await R2Service.uploadFile(
        file,
        'kejuaraan',
        formData.id || `kj-temp-${Date.now()}`,
        'laporan',
        'admin',
        'operator-pt',
        'Panitia Kejuaraan'
      );
      setFormData((prev) => ({ ...prev, url_laporan: doc.public_url }));
    } catch (e: any) {
      alert(`Gagal upload laporan ke R2: ${e.message}`);
    }
  };

  const handleExportRekap = () => {
    const textContent = items
      .map(
        (i, idx) =>
          `KEJUARAAN KAMPUS #${idx + 1}
Nama Ajang: ${i.nama_ajang}
Jenis Penyelenggaraan: ${i.jenis_penyelenggaraan}
Level: ${i.level} | Kategori: ${i.kategori} | Bentuk: ${i.bentuk}
Tempat: ${i.tempat} | Tahun: ${i.tahun}
Website Ajang: ${i.url_ajang}
URL Laporan R2: ${i.url_laporan}
Total Peserta: ${i.total_peserta}
Daftar Perguruan Tinggi Peserta:
${i.peserta_list.map((p) => ` - ${p}`).join('\n')}
Daftar Pemenang:
${i.juara_list.map((j) => ` - ${j}`).join('\n')}
------------------------------------------------------------\n`
      )
      .join('\n');

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rekap-kejuaraan-kampus-${tenant.tahun_aktif}.txt`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Repositori Kompetisi Kampus</span>
            <span>·</span>
            <span className="font-semibold text-slate-700">Persiapan Rekapitulasi Pelaporan</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Trophy className="w-5 h-5 text-teal-800" />
            Kejuaraan yang Diselenggarakan Perguruan Tinggi
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Menyiapkan dan merekap ajang kompetisi yang diinisiasi kampus, daftar delegasi perguruan tinggi peserta, daftar juara, dan dokumen laporan pertanggungjawaban tahunan.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportRekap}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Rekap</span>
          </button>
          <button
            onClick={handleOpenForm}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Kejuaraan</span>
          </button>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500 font-medium">
          Menampilkan <strong className="text-slate-800 font-mono">{filteredItems.length}</strong> ajang yang diselenggarakan PT
        </span>
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari ajang kejuaraan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-teal-600"
          />
        </div>
      </div>

      {/* Grid of Kejuaraan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-colors flex flex-col justify-between shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-teal-850 font-mono">
                  {item.jenis_penyelenggaraan === 'MANDIRI_TERVERIFIKASI'
                    ? 'Mandiri Terverifikasi'
                    : 'Mandiri'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Tahun {item.tahun}</span>
              </div>

              <h3 className="font-bold text-slate-900 text-sm leading-snug">{item.nama_ajang}</h3>

              <div className="mt-2 text-xs text-slate-600 space-y-1">
                <div>
                  Level: <strong className="text-slate-800 font-mono">{item.level}</strong> · Kategori:{' '}
                  <strong>{item.kategori}</strong> · Bentuk: <strong>{item.bentuk}</strong>
                </div>
                <div>Tempat: {item.tempat}</div>
                <div>Jumlah Peserta: <strong className="font-mono">{item.total_peserta}</strong> tim/peserta</div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Website Resmi Ajang:</span>
                  <a
                    href={item.url_ajang}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-800 hover:underline flex items-center gap-1 font-mono text-[11px] font-medium"
                  >
                    Buka Tautan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Laporan Kegiatan (R2):</span>
                  <button
                    onClick={() => onPreviewDocument(item.url_laporan, `Laporan: ${item.nama_ajang}`)}
                    className="text-teal-800 hover:underline flex items-center gap-1 font-mono text-[11px] cursor-pointer font-medium"
                  >
                    Lihat Dokumen R2 <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              {item.is_ready_for_web_input ? (
                <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Dokumen Lengkap & Terverifikasi
                </span>
              ) : (
                <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Lengkapi Dokumen Laporan
                </span>
              )}
              <button
                onClick={() => setSelectedKejuaraan(item)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Lihat Checklist
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL: Input Kejuaraan */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tambah Data Kejuaraan Penyelenggara PT</h3>
                <p className="text-xs text-slate-500">Persiapan kelengkapan data pelaporan institusi</p>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Jenis Penyelenggaraan <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.jenis_penyelenggaraan}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        jenis_penyelenggaraan: e.target.value as 'MANDIRI' | 'MANDIRI_TERVERIFIKASI',
                      })
                    }
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="MANDIRI_TERVERIFIKASI">Mandiri Terverifikasi</option>
                    <option value="MANDIRI">Mandiri</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Level Kejuaraan <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value as LevelType })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="KAB">Kabupaten / Kota</option>
                    <option value="PROV">Provinsi</option>
                    <option value="NAS">Nasional</option>
                    <option value="INT">Internasional</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Ajang Kejuaraan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Advaita Healthcare Innovation Cup 2026"
                  value={formData.nama_ajang}
                  onChange={(e) => setFormData({ ...formData, nama_ajang: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kategori</label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData({ ...formData, kategori: e.target.value as KategoriPrestasi })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="RISNOV">Risnov STEM</option>
                    <option value="RISNOVSSH">Risnov SSH</option>
                    <option value="SENBUD">Seni Budaya</option>
                    <option value="OLAHRAGA">Olahraga</option>
                    <option value="MINAT">Minat Khusus</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Bentuk</label>
                  <select
                    value={formData.bentuk}
                    onChange={(e) => setFormData({ ...formData, bentuk: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="HIBRID">Hibrid</option>
                    <option value="LURING">Luring</option>
                    <option value="DARING">Daring</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Total Peserta</label>
                  <input
                    type="number"
                    value={formData.total_peserta}
                    onChange={(e) => setFormData({ ...formData, total_peserta: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Tempat / Lokasi</label>
                <input
                  type="text"
                  placeholder="Lokasi aula atau gedung kegiatan"
                  value={formData.tempat}
                  onChange={(e) => setFormData({ ...formData, tempat: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">URL Website Resmi Ajang</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formData.url_ajang}
                    onChange={(e) => setFormData({ ...formData, url_ajang: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    URL Laporan Kegiatan (R2) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://bukti.studentconnect.id/..."
                    value={formData.url_laporan}
                    onChange={(e) => setFormData({ ...formData, url_laporan: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    required
                  />
                  <label className="mt-1 text-[11px] text-teal-800 hover:underline cursor-pointer flex items-center gap-1 font-medium">
                    <Upload className="w-3 h-3" /> Upload PDF Laporan ke R2
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleUploadR2Laporan(e.target.files[0]);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-lg font-semibold cursor-pointer"
                >
                  Simpan Data Kejuaraan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedKejuaraan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Checklist Pelaporan Kejuaraan</h3>
                <p className="text-xs text-slate-500">{selectedKejuaraan.nama_ajang}</p>
              </div>
              <button onClick={() => setSelectedKejuaraan(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="space-y-2">
                <span className="font-semibold text-slate-800 block">Daftar Perguruan Tinggi Peserta:</span>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  {selectedKejuaraan.peserta_list.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-slate-700">
                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] flex items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-semibold text-slate-800 block">Daftar Juara & Pemenang:</span>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  {selectedKejuaraan.juara_list.map((j, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-teal-900 font-medium">
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      <span>{j}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                <span>Dokumen Laporan Kegiatan R2</span>
                <button
                  onClick={() => onPreviewDocument(selectedKejuaraan.url_laporan, 'Laporan Kejuaraan')}
                  className="text-teal-800 hover:underline font-mono text-[11px] flex items-center gap-1 cursor-pointer font-medium"
                >
                  Buka Laporan R2 <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setSelectedKejuaraan(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
