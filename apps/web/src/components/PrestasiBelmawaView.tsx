import React, { useState } from 'react';
import { PrestasiBelmawaItem, TenantConfig, UserRole } from '../types';
import {
  Bookmark,
  Plus,
  Download,
  Search,
  Users,
  Info,
  X,
} from 'lucide-react';

interface PrestasiBelmawaViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  items: PrestasiBelmawaItem[];
  onUpdateItems: (items: PrestasiBelmawaItem[]) => void;
}

export const PrestasiBelmawaView: React.FC<PrestasiBelmawaViewProps> = ({
  tenant,
  activeRole,
  items,
  onUpdateItems,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<PrestasiBelmawaItem>>({
    belmawa_id: '',
    lomba: '',
    prestasi: '',
    tahun: tenant.tahun_aktif,
    perguruan_tinggi: tenant.nama_pt,
    keterangan: '',
    mahasiswa_tagged: [{ nim: '', nama: '' }],
  });

  const filteredItems = items.filter(
    (i) =>
      i.lomba.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.prestasi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.belmawa_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.mahasiswa_tagged.some((m) => m.nama.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleOpenForm = () => {
    setFormData({
      belmawa_id: `BELMAWA-${tenant.tahun_aktif}-PKM-${Math.floor(1000 + Math.random() * 9000)}`,
      lomba: 'Program Kreativitas Mahasiswa (PKM) Kemdiktisaintek',
      prestasi: 'Pendanaan Nasional Belmawa',
      tahun: tenant.tahun_aktif,
      perguruan_tinggi: tenant.nama_pt,
      keterangan: 'Lolos seleksi review proposal tingkat nasional',
      mahasiswa_tagged: [{ nim: '', nama: '' }],
    });
    setIsFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lomba || !formData.prestasi) return;

    const newItem: PrestasiBelmawaItem = {
      id: `bel-${Date.now()}`,
      belmawa_id: formData.belmawa_id || `BEL-${Date.now()}`,
      lomba: formData.lomba || '',
      prestasi: formData.prestasi || '',
      tahun: Number(formData.tahun || tenant.tahun_aktif),
      perguruan_tinggi: formData.perguruan_tinggi || tenant.nama_pt,
      keterangan: formData.keterangan || '',
      mahasiswa_tagged: (formData.mahasiswa_tagged || []).filter((m) => m.nim && m.nama),
    };

    onUpdateItems([newItem, ...items]);
    setIsFormOpen(false);
  };

  const handleExport = () => {
    const text = items
      .map(
        (i) =>
          `[${i.belmawa_id}] ${i.lomba} (${i.tahun})\nPrestasi: ${i.prestasi}\nPT: ${i.perguruan_tinggi}\nMahasiswa: ${i.mahasiswa_tagged.map((m) => `${m.nama} (${m.nim})`).join(', ')}\nKeterangan: ${i.keterangan}\n---`
      )
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `referensi-prestasi-belmawa-${tenant.tahun_aktif}.txt`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Referensi Program Kemdiktisaintek</span>
            <span>·</span>
            <span className="font-semibold text-slate-700">PKM, P2MW, LIDM, Satria Data, dsb.</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-teal-800" />
            Prestasi Program Nasional Belmawa (Koleksi & Tagging Mahasiswa)
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Menghubungkan capaian kompetisi resmi Direktorat Belmawa/Puspresnas dengan profil akademik mahasiswa dan penerbitan Surat Keterangan Pendamping Ijazah (SKPI).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExport}
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
            <span>+ Tambah Referensi Belmawa</span>
          </button>
        </div>
      </div>

      {/* Info notice */}
      <div className="p-3 bg-slate-100/90 rounded-lg border border-slate-200 flex items-start gap-2.5 text-xs text-slate-700">
        <Info className="w-4 h-4 text-teal-800 shrink-0 mt-0.5" />
        <div>
          Data ajang resmi Belmawa (seperti PKM, KNMIPA, LIDM, PILMAPRES) secara otomatis terdata di database kementerian. Modul ini digunakan kampus untuk sinkronisasi internal dan pencatatan mahasiswa penerima apresiasi.
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          Tercatat <strong className="text-slate-800 font-mono">{filteredItems.length}</strong> capaian program Belmawa
        </span>
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari ajang, mahasiswa, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-teal-600"
          />
        </div>
      </div>

      {/* List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-colors shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {item.belmawa_id}
                </span>
                <span className="text-xs font-mono text-slate-500">Tahun {item.tahun}</span>
              </div>

              <h3 className="font-bold text-slate-900 text-sm leading-snug mt-2">{item.lomba}</h3>
              <div className="text-xs font-semibold text-teal-700 mt-1">{item.prestasi}</div>

              {item.keterangan && (
                <p className="text-xs text-slate-600 mt-2 italic bg-slate-50 p-2.5 rounded border border-slate-100">
                  "{item.keterangan}"
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Mahasiswa Ter-Tag:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {item.mahasiswa_tagged.map((m, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md font-medium flex items-center gap-1"
                  >
                    <Users className="w-3 h-3 text-slate-500" />
                    <span>{m.nama}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({m.nim})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal New Belmawa item */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Catat Referensi Prestasi Belmawa</h3>
                <p className="text-xs text-slate-500">Dokumentasi internal program kementerian</p>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">ID Resmi Belmawa</label>
                <input
                  type="text"
                  value={formData.belmawa_id}
                  onChange={(e) => setFormData({ ...formData, belmawa_id: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Nama Lomba / Program</label>
                <input
                  type="text"
                  value={formData.lomba}
                  onChange={(e) => setFormData({ ...formData, lomba: e.target.value })}
                  placeholder="Contoh: Program Kreativitas Mahasiswa (PKM-RE)"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Capaian Prestasi</label>
                <input
                  type="text"
                  value={formData.prestasi}
                  onChange={(e) => setFormData({ ...formData, prestasi: e.target.value })}
                  placeholder="Contoh: Lolos Pendanaan Nasional Belmawa / Medali Emas PIMNAS"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Mahasiswa Terlibat (NIM & Nama)</label>
                {(formData.mahasiswa_tagged || []).map((m, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="NIM"
                      value={m.nim}
                      onChange={(e) => {
                        const newTag = [...(formData.mahasiswa_tagged || [])];
                        newTag[idx].nim = e.target.value;
                        setFormData({ ...formData, mahasiswa_tagged: newTag });
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Nama Mahasiswa"
                      value={m.nama}
                      onChange={(e) => {
                        const newTag = [...(formData.mahasiswa_tagged || [])];
                        newTag[idx].nama = e.target.value;
                        setFormData({ ...formData, mahasiswa_tagged: newTag });
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded text-xs"
                      required
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Keterangan / Judul Proposal</label>
                <textarea
                  rows={2}
                  value={formData.keterangan}
                  onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
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
                  Simpan Referensi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
