import React, { useState } from 'react';
import {
  PrestasiMandiri,
  UserRole,
  TenantConfig,
  LevelType,
  KategoriPrestasi,
  PeringkatPrestasi,
  KelompokPrestasi,
  BentukKegiatan,
} from '../types';
import {
  Award,
  Plus,
  Send,
  CheckCircle,
  AlertCircle,
  FileText,
  Search,
  Check,
  X,
  Upload,
  Lock,
  Download,
  Trash2,
  Eye,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { SimkatmawaApiService } from '../services/simkatmawaApi';
import { R2Service } from '../services/r2Service';

interface PrestasiMandiriViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  items: PrestasiMandiri[];
  onUpdateItems: (items: PrestasiMandiri[]) => void;
  onPreviewDocument: (url: string, title: string) => void;
}

export const PrestasiMandiriView: React.FC<PrestasiMandiriViewProps> = ({
  tenant,
  activeRole,
  items,
  onUpdateItems,
  onPreviewDocument,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<PrestasiMandiri | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<PrestasiMandiri>>({
    level: 'NAS',
    kategori: 'RISNOV',
    lomba: '',
    cabang: '',
    penyelenggara: '',
    peringkat: 'JUARA1',
    jumlah_unit_peserta: '15',
    kelompok_prestasi: 'KELOMPOK',
    bentuk: 'DARING',
    url_peserta: '',
    url_sertifikat: '',
    tgl_sertifikat: new Date().toISOString().split('T')[0],
    url_foto_upp: '',
    url_dokumen_undangan: '',
    keterangan: '',
    mahasiswa: [{ nim: '', nama: '', prodi: '' }],
    dosen: [{ nuptk: '', nama: '', url_surat_tugas: '' }],
  });

  const [revisionNote, setRevisionNote] = useState('');

  const filteredItems = items.filter((item) => {
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
    const matchesSearch =
      item.lomba.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.penyelenggara.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.mahasiswa.some((m) =>
        m.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.nim.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return matchesStatus && matchesSearch;
  });

  const canVerify = ['SUPER_ADMIN', 'ADMIN_PT', 'ADMIN_KEMAHASISWAAN'].includes(activeRole);
  const canSubmitApi = ['SUPER_ADMIN', 'ADMIN_PT'].includes(activeRole);

  const handleOpenNewForm = () => {
    setFormData({
      level: 'NAS',
      kategori: 'RISNOV',
      lomba: '',
      cabang: '',
      penyelenggara: '',
      peringkat: 'JUARA1',
      jumlah_unit_peserta: '10',
      kelompok_prestasi: 'KELOMPOK',
      bentuk: 'DARING',
      url_peserta: '',
      url_sertifikat: '',
      tgl_sertifikat: new Date().toISOString().split('T')[0],
      url_foto_upp: '',
      url_dokumen_undangan: '',
      keterangan: '',
      mahasiswa: [{ nim: '', nama: '', prodi: '' }],
      dosen: [{ nuptk: '', nama: '', url_surat_tugas: '' }],
    });
    setIsFormOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.lomba || !formData.penyelenggara || !formData.url_sertifikat || !formData.url_peserta) {
      alert('Harap lengkapi semua field wajib dan tautan dokumen bukti!');
      return;
    }

    const validMahasiswa = (formData.mahasiswa || []).filter((m) => m.nim && m.nama);
    if (validMahasiswa.length === 0) {
      alert('Minimal harus mencantumkan 1 mahasiswa (NIM & Nama)!');
      return;
    }

    const newItem: PrestasiMandiri = {
      id: formData.id || `pm-${Date.now()}`,
      tenant_id: tenant.id,
      status: 'SUBMITTED_INTERNAL',
      submission_attempts: 0,
      level: formData.level as LevelType,
      kategori: formData.kategori as KategoriPrestasi,
      lomba: formData.lomba || '',
      cabang: formData.cabang || '',
      penyelenggara: formData.penyelenggara || '',
      peringkat: formData.peringkat as PeringkatPrestasi,
      jumlah_unit_peserta: String(formData.jumlah_unit_peserta || '1'),
      kelompok_prestasi: formData.kelompok_prestasi as KelompokPrestasi,
      bentuk: formData.bentuk as BentukKegiatan,
      url_peserta: formData.url_peserta || '',
      url_sertifikat: formData.url_sertifikat || '',
      tgl_sertifikat: formData.tgl_sertifikat || new Date().toISOString().split('T')[0],
      url_foto_upp: formData.url_foto_upp || '',
      url_dokumen_undangan: formData.url_dokumen_undangan || '',
      keterangan: formData.keterangan || '',
      mahasiswa: validMahasiswa,
      dosen: (formData.dosen || []).filter((d) => d.nuptk && d.nama),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: `${activeRole} (${tenant.nama_pt})`,
    };

    const exists = items.some((i) => i.id === newItem.id);
    let updated: PrestasiMandiri[];
    if (exists) {
      updated = items.map((i) => (i.id === newItem.id ? newItem : i));
    } else {
      updated = [newItem, ...items];
    }

    onUpdateItems(updated);
    setIsFormOpen(false);
  };

  const handleUploadR2 = async (
    docType: 'sertifikat' | 'peserta' | 'foto_upp' | 'undangan' | 'surat_tugas',
    file: File,
    dosenIndex?: number
  ) => {
    try {
      const uploadedDoc = await R2Service.uploadFile(
        file,
        'prestasi-mandiri',
        formData.id || `pm-temp-${Date.now()}`,
        docType,
        'mahasiswa',
        'mhs-active',
        'Pengusul Prestasi'
      );

      if (docType === 'sertifikat') {
        setFormData((prev) => ({ ...prev, url_sertifikat: uploadedDoc.public_url }));
      } else if (docType === 'peserta') {
        setFormData((prev) => ({ ...prev, url_peserta: uploadedDoc.public_url }));
      } else if (docType === 'foto_upp') {
        setFormData((prev) => ({ ...prev, url_foto_upp: uploadedDoc.public_url }));
      } else if (docType === 'undangan') {
        setFormData((prev) => ({ ...prev, url_dokumen_undangan: uploadedDoc.public_url }));
      } else if (docType === 'surat_tugas' && typeof dosenIndex === 'number') {
        setFormData((prev) => {
          const newDosen = [...(prev.dosen || [])];
          if (newDosen[dosenIndex]) {
            newDosen[dosenIndex].url_surat_tugas = uploadedDoc.public_url;
          }
          return { ...prev, dosen: newDosen };
        });
      }
    } catch (err: any) {
      alert(`Gagal upload ke R2: ${err.message}`);
    }
  };

  const handleSendToSimkatmawa = async (item: PrestasiMandiri) => {
    if (item.status === 'SENT') {
      alert('Data sudah disinkronkan ke Portal Nasional! Dilarang mengirim ulang untuk mencegah duplikasi.');
      return;
    }
    if (item.status !== 'VERIFIED') {
      alert('Data harus berstatus "VERIFIED" sebelum disinkronkan ke Portal Nasional!');
      return;
    }

    setIsSending(true);
    setSendResult(null);

    try {
      const res = await SimkatmawaApiService.submitPrestasiMandiri(
        item,
        `${activeRole} (${tenant.nama_pt})`
      );

      if (res.success) {
        setSendResult({
          success: true,
          message: `Berhasil tersinkronisasi ke Portal Nasional! ID Nasional: ${res.id}`,
        });
        const updated = items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'SENT' as const,
                simkatmawa_id: res.id,
                sent_at: new Date().toISOString(),
              }
            : i
        );
        onUpdateItems(updated);
      } else {
        setSendResult({
          success: false,
          message: res.error || 'Gagal mengirim ke Portal Nasional.',
        });
      }
    } catch (err: any) {
      setSendResult({
        success: false,
        message: err.message || 'Terjadi kesalahan komunikasi jaringan.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyItem = (item: PrestasiMandiri) => {
    const updated = items.map((i) =>
      i.id === item.id
        ? {
            ...i,
            status: 'VERIFIED' as const,
            revision_note: undefined,
            updated_at: new Date().toISOString(),
          }
        : i
    );
    onUpdateItems(updated);
    setIsVerificationModalOpen(false);
    setSelectedItem(null);
  };

  const handleRequestRevision = (item: PrestasiMandiri) => {
    if (!revisionNote.trim()) {
      alert('Harap tuliskan catatan perbaikan data/dokumen yang dibutuhkan!');
      return;
    }
    const updated = items.map((i) =>
      i.id === item.id
        ? {
            ...i,
            status: 'NEED_REVISION' as const,
            revision_note: revisionNote,
            updated_at: new Date().toISOString(),
          }
        : i
    );
    onUpdateItems(updated);
    setIsVerificationModalOpen(false);
    setSelectedItem(null);
    setRevisionNote('');
  };

  const handleExportCsv = () => {
    const headers = [
      'ID_Internal',
      'Status',
      'ID_Nasional',
      'Level',
      'Kategori',
      'Nama_Lomba',
      'Penyelenggara',
      'Peringkat',
      'Peserta_Unit',
      'Bentuk',
      'Tgl_Sertifikat',
      'Mahasiswa',
      'URL_Sertifikat_R2',
    ];
    const rows = filteredItems.map((i) => [
      i.id,
      i.status,
      i.simkatmawa_id || '-',
      i.level,
      i.kategori,
      `"${i.lomba.replace(/"/g, '""')}"`,
      `"${i.penyelenggara.replace(/"/g, '""')}"`,
      i.peringkat,
      i.jumlah_unit_peserta,
      i.bentuk,
      i.tgl_sertifikat,
      `"${i.mahasiswa.map((m) => `${m.nama} (${m.nim})`).join(', ')}"`,
      i.url_sertifikat,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap-prestasi-mandiri-${tenant.tahun_aktif}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Pelaporan Prestasi & Talenta Mahasiswa</span>
            <span>·</span>
            <span className="font-semibold text-teal-800">Standar Pelaporan Nasional</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-5 h-5 text-teal-800" />
            Prestasi Mandiri Mahasiswa
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Pencatatan prestasi lomba tingkat Kabupaten, Provinsi, Nasional, dan Internasional. Dilengkapi tautan berkas bukti sah dan validasi integritas data institusi.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleOpenNewForm}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Usulkan Prestasi</span>
          </button>
        </div>
      </div>

      {sendResult && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs ${
            sendResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {sendResult.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{sendResult.message}</span>
          </div>
          <button onClick={() => setSendResult(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'ALL', label: 'Semua Usulan' },
            { id: 'VERIFIED', label: 'Siap Kirim (Verified)' },
            { id: 'SENT', label: 'Tersinkron (Sent)' },
            { id: 'SUBMITTED_INTERNAL', label: 'Review Internal' },
            { id: 'NEED_REVISION', label: 'Perlu Revisi' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari ajang lomba, nama, NIM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-teal-600"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Nama Lomba & Kategori</th>
                <th className="py-3 px-4">Peringkat & Tingkat</th>
                <th className="py-3 px-4">Mahasiswa & Pembina</th>
                <th className="py-3 px-4">Dokumen R2</th>
                <th className="py-3 px-4">Status Portal Nasional</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                    Tidak ada data prestasi yang memenuhi kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 leading-snug line-clamp-2">
                        {item.lomba}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                        <span>{item.cabang}</span>
                        <span>·</span>
                        <span>{item.penyelenggara}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Bentuk: <strong>{item.bentuk}</strong> · Peserta: {item.jumlah_unit_peserta} unit
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-teal-800">
                        {item.peringkat === 'JUARA1'
                          ? 'Juara 1'
                          : item.peringkat === 'JUARA2'
                          ? 'Juara 2'
                          : item.peringkat === 'JUARA3'
                          ? 'Juara 3'
                          : item.peringkat}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tingkat: <strong className="font-mono text-slate-700">{item.level}</strong>
                        <span> · </span>
                        <span>{item.kategori}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5 max-w-[200px]">
                        {item.mahasiswa.map((m, idx) => (
                          <div key={idx} className="text-slate-800 font-medium truncate">
                            {m.nama} <span className="text-[11px] text-slate-500 font-mono">({m.nim})</span>
                          </div>
                        ))}
                      </div>
                      {item.dosen.length > 0 && (
                        <div className="text-[10px] text-slate-500 mt-1 truncate">
                          Pembina: {item.dosen[0].nama}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 text-[11px]">
                        <button
                          onClick={() => onPreviewDocument(item.url_sertifikat, `Sertifikat: ${item.lomba}`)}
                          className="text-teal-800 hover:underline flex items-center gap-1 cursor-pointer text-left"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Sertifikat</span>
                        </button>
                        <button
                          onClick={() => onPreviewDocument(item.url_peserta, `Bukti Peserta: ${item.lomba}`)}
                          className="text-slate-600 hover:underline flex items-center gap-1 cursor-pointer text-left"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Bukti Peserta</span>
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.status === 'SENT' ? (
                        <div>
                          <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Tersinkron (Sent)</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                            ID: {item.simkatmawa_id}
                          </div>
                          <div className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Lock className="w-2.5 h-2.5" /> Terkunci Resmi
                          </div>
                        </div>
                      ) : item.status === 'VERIFIED' ? (
                        <div>
                          <span className="text-teal-900 font-semibold text-xs flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-teal-700" /> Siap Kirim (Verified)
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            Lolos verifikasi internal
                          </span>
                        </div>
                      ) : item.status === 'NEED_REVISION' ? (
                        <div>
                          <span className="text-orange-700 font-semibold text-xs flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-orange-600" /> Perlu Perbaikan
                          </span>
                          <span className="text-[10px] text-orange-600 block mt-0.5 max-w-[140px] truncate" title={item.revision_note}>
                            {item.revision_note || 'Periksa dokumen pendukung'}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-slate-600 font-medium text-xs flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" /> Review Internal
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Usulan baru mahasiswa
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          title="Lihat Rincian"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canVerify && item.status !== 'SENT' && (
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setIsVerificationModalOpen(true);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            Kurasi
                          </button>
                        )}

                        {item.status === 'VERIFIED' && canSubmitApi && (
                          <button
                            disabled={isSending}
                            onClick={() => handleSendToSimkatmawa(item)}
                            className="px-3 py-1 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-md transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Send className="w-3 h-3" />
                            <span>Kirim API</span>
                          </button>
                        )}

                        {item.status === 'SENT' && (
                          <span
                            className="px-2 py-0.5 text-[11px] text-slate-400 flex items-center gap-1 select-none"
                            title="Data sudah tercatat di pangkalan data nasional. Koreksi hanya dapat diajukan via portal pusat."
                          >
                            <Lock className="w-3 h-3" />
                            <span>Terkunci</span>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Input Prestasi */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Form Pengajuan Prestasi Mandiri</h3>
                <p className="text-xs text-slate-500">Standar atribut pangkalan data nasional Kemdiktisaintek</p>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Level Kegiatan <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value as LevelType })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="KAB">KAB - Tingkat Kabupaten / Kota</option>
                    <option value="PROV">PROV - Tingkat Provinsi</option>
                    <option value="NAS">NAS - Tingkat Nasional</option>
                    <option value="INT">INT - Tingkat Internasional</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Kategori Lomba <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData({ ...formData, kategori: e.target.value as KategoriPrestasi })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="RISNOV">RISNOV - Riset dan Inovasi STEM</option>
                    <option value="RISNOVSSH">RISNOVSSH - Riset dan Inovasi Sosial Humaniora</option>
                    <option value="SENBUD">SENBUD - Seni dan Budaya</option>
                    <option value="OLAHRAGA">OLAHRAGA - Olahraga</option>
                    <option value="MINAT">MINAT - Minat Khusus</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Ajang / Kompetisi <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: National Medical Innovation Competition 2026"
                  value={formData.lomba}
                  onChange={(e) => setFormData({ ...formData, lomba: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Cabang Lomba <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Teknologi Biomedis"
                    value={formData.cabang}
                    onChange={(e) => setFormData({ ...formData, cabang: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Lembaga Penyelenggara <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Nama institusi / kementerian penyelenggara"
                    value={formData.penyelenggara}
                    onChange={(e) => setFormData({ ...formData, penyelenggara: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Peringkat Capaian <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.peringkat}
                    onChange={(e) => setFormData({ ...formData, peringkat: e.target.value as PeringkatPrestasi })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="JUARA1">Juara 1 / Gold Medal</option>
                    <option value="JUARA2">Juara 2 / Silver Medal</option>
                    <option value="JUARA3">Juara 3 / Bronze Medal</option>
                    <option value="HARAPAN1">Harapan 1</option>
                    <option value="HARAPAN2">Harapan 2</option>
                    <option value="HARAPAN3">Harapan 3</option>
                    <option value="APRESIASI">Apresiasi / Special Award</option>
                    <option value="PESERTA">Peserta / Finalis</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Jumlah Unit Peserta <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.jumlah_unit_peserta}
                    onChange={(e) => setFormData({ ...formData, jumlah_unit_peserta: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    PT untuk Nasional, Negara untuk Internasional
                  </span>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Bentuk Pelaksanaan <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.bentuk}
                    onChange={(e) => setFormData({ ...formData, bentuk: e.target.value as BentukKegiatan })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="LURING">LURING (Tatap Muka Langsung)</option>
                    <option value="DARING">DARING (Virtual / Online)</option>
                  </select>
                </div>
              </div>

              {/* Documents */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <span className="font-semibold text-slate-900 block text-xs">
                  Dokumen Bukti Sah (Tautan Berkas Digital)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      URL Sertifikat / Piagam <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      placeholder="https://bukti.studentconnect.id/..."
                      value={formData.url_sertifikat}
                      onChange={(e) => setFormData({ ...formData, url_sertifikat: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                      required
                    />
                    <label className="mt-1 text-[11px] text-teal-800 hover:underline cursor-pointer flex items-center gap-1 font-medium">
                      <Upload className="w-3 h-3" /> Upload File ke R2
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleUploadR2('sertifikat', e.target.files[0]);
                        }}
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      URL Bukti Peserta / SK Panitia <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      placeholder="https://bukti.studentconnect.id/..."
                      value={formData.url_peserta}
                      onChange={(e) => setFormData({ ...formData, url_peserta: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                      required
                    />
                    <label className="mt-1 text-[11px] text-teal-800 hover:underline cursor-pointer flex items-center gap-1 font-medium">
                      <Upload className="w-3 h-3" /> Upload File ke R2
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleUploadR2('peserta', e.target.files[0]);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Tanggal Sertifikat <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.tgl_sertifikat}
                      onChange={(e) => setFormData({ ...formData, tgl_sertifikat: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      URL Foto Kegiatan / Penyerahan (Opsional)
                    </label>
                    <input
                      type="url"
                      placeholder="https://bukti.studentconnect.id/..."
                      value={formData.url_foto_upp}
                      onChange={(e) => setFormData({ ...formData, url_foto_upp: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Mahasiswa list */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 text-xs">
                    Mahasiswa Peserta (Minimal 1) <span className="text-red-500">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        mahasiswa: [...(formData.mahasiswa || []), { nim: '', nama: '', prodi: '' }],
                      })
                    }
                    className="text-teal-800 hover:underline text-[11px] font-medium cursor-pointer"
                  >
                    + Tambah Mahasiswa
                  </button>
                </div>

                {(formData.mahasiswa || []).map((m, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded">
                    <input
                      type="text"
                      placeholder="NIM Mahasiswa"
                      value={m.nim}
                      onChange={(e) => {
                        const newMhs = [...(formData.mahasiswa || [])];
                        newMhs[idx].nim = e.target.value;
                        setFormData({ ...formData, mahasiswa: newMhs });
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Nama Lengkap Mahasiswa"
                      value={m.nama}
                      onChange={(e) => {
                        const newMhs = [...(formData.mahasiswa || [])];
                        newMhs[idx].nama = e.target.value;
                        setFormData({ ...formData, mahasiswa: newMhs });
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded text-xs"
                      required
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Program Studi"
                        value={m.prodi || ''}
                        onChange={(e) => {
                          const newMhs = [...(formData.mahasiswa || [])];
                          newMhs[idx].prodi = e.target.value;
                          setFormData({ ...formData, mahasiswa: newMhs });
                        }}
                        className="p-1.5 bg-white border border-slate-200 rounded text-xs flex-1"
                      />
                      {(formData.mahasiswa || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newMhs = (formData.mahasiswa || []).filter((_, i) => i !== idx);
                            setFormData({ ...formData, mahasiswa: newMhs });
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Dosen */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 text-xs">
                    Dosen Pendamping / Pembina (Opsional)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        dosen: [...(formData.dosen || []), { nuptk: '', nama: '', url_surat_tugas: '' }],
                      })
                    }
                    className="text-teal-800 hover:underline text-[11px] font-medium cursor-pointer"
                  >
                    + Tambah Dosen
                  </button>
                </div>

                {(formData.dosen || []).map((d, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded">
                    <input
                      type="text"
                      placeholder="NUPTK / NIDN"
                      value={d.nuptk}
                      onChange={(e) => {
                        const newDsn = [...(formData.dosen || [])];
                        newDsn[idx].nuptk = e.target.value;
                        setFormData({ ...formData, dosen: newDsn });
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Nama Lengkap Dosen"
                      value={d.nama}
                      onChange={(e) => {
                        const newDsn = [...(formData.dosen || [])];
                        newDsn[idx].nama = e.target.value;
                        setFormData({ ...formData, dosen: newDsn });
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded text-xs"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="url"
                        placeholder="URL Surat Tugas R2"
                        value={d.url_surat_tugas || ''}
                        onChange={(e) => {
                          const newDsn = [...(formData.dosen || [])];
                          newDsn[idx].url_surat_tugas = e.target.value;
                          setFormData({ ...formData, dosen: newDsn });
                        }}
                        className="p-1.5 bg-white border border-slate-200 rounded text-xs font-mono flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newDsn = (formData.dosen || []).filter((_, i) => i !== idx);
                          setFormData({ ...formData, dosen: newDsn });
                        }}
                        className="p-1.5 text-slate-400 hover:bg-slate-200 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Keterangan / Catatan Tambahan</label>
                <textarea
                  rows={2}
                  value={formData.keterangan}
                  onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
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
                  Simpan & Ajukan Internal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedItem && !isVerificationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Rincian Prestasi Mandiri</h3>
                <p className="text-xs text-slate-500">ID Internal: {selectedItem.id}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500 uppercase font-semibold">Nama Lomba / Ajang</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">{selectedItem.lomba}</div>
                <div className="text-slate-600 mt-1">
                  Cabang: {selectedItem.cabang} · Penyelenggara: {selectedItem.penyelenggara}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Level</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{selectedItem.level}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Kategori</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{selectedItem.kategori}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Peringkat</span>
                  <span className="font-bold text-teal-800 mt-0.5 block">{selectedItem.peringkat}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Bentuk</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{selectedItem.bentuk}</span>
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border flex items-center justify-between ${
                  selectedItem.status === 'SENT'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : selectedItem.status === 'VERIFIED'
                    ? 'bg-teal-50 border-teal-200 text-teal-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div>
                  <span className="font-bold block">Status Pelaporan: {selectedItem.status}</span>
                  {selectedItem.simkatmawa_id && (
                    <span className="font-mono text-[11px] block mt-0.5">
                      ID Nasional Terbit: {selectedItem.simkatmawa_id}
                    </span>
                  )}
                </div>
                {selectedItem.status === 'SENT' && (
                  <span className="text-[11px] font-medium bg-white px-2.5 py-1 rounded border border-emerald-300">
                    Tersinkron Resmi
                  </span>
                )}
              </div>

              <div>
                <span className="font-semibold text-slate-900 block mb-1">Daftar Mahasiswa:</span>
                <div className="space-y-1">
                  {selectedItem.mahasiswa.map((m, idx) => (
                    <div key={idx} className="p-2 bg-slate-50 rounded border border-slate-200 flex justify-between">
                      <span className="font-medium text-slate-900">{m.nama}</span>
                      <span className="font-mono text-slate-600">NIM: {m.nim}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-900 block mb-1">Dokumen Lampiran Pendukung:</span>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                    <span>Sertifikat / Piagam</span>
                    <button
                      onClick={() => onPreviewDocument(selectedItem.url_sertifikat, 'Sertifikat')}
                      className="text-teal-800 hover:underline font-mono text-[11px] flex items-center gap-1 cursor-pointer font-medium"
                    >
                      Buka Dokumen <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                    <span>Bukti Peserta</span>
                    <button
                      onClick={() => onPreviewDocument(selectedItem.url_peserta, 'Bukti Peserta')}
                      className="text-teal-800 hover:underline font-mono text-[11px] flex items-center gap-1 cursor-pointer font-medium"
                    >
                      Buka Dokumen R2 <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kurasi Modal */}
      {isVerificationModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Kurasi & Verifikasi Kelayakan Data</h3>
                <p className="text-xs text-slate-500">Pemeriksaan Internal PT Sebelum Pengiriman API Pusat</p>
              </div>
              <button
                onClick={() => {
                  setIsVerificationModalOpen(false);
                  setSelectedItem(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-900 block">{selectedItem.lomba}</span>
                <span className="text-slate-500 text-[11px] mt-0.5 block">
                  {selectedItem.mahasiswa.map((m) => m.nama).join(', ')} · Tingkat {selectedItem.level}
                </span>
              </div>

              <div className="space-y-2">
                <span className="font-semibold text-slate-800 block">Checklist Verifikator:</span>
                <div className="space-y-1.5 text-slate-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>NIM dan Mahasiswa berstatus aktif di PDDikti</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Dokumen sertifikat dan bukti peserta terbaca jelas di R2</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Jumlah PT/negara peserta sesuai kriteria level ({selectedItem.level})</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Catatan Koreksi (Jika membutuhkan revisi)
                </label>
                <textarea
                  rows={2}
                  placeholder="Jelaskan kekurangan dokumen atau kekeliruan data..."
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  onClick={() => handleRequestRevision(selectedItem)}
                  className="px-3.5 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors cursor-pointer"
                >
                  Minta Perbaikan (Revisi)
                </button>
                <button
                  onClick={() => handleVerifyItem(selectedItem)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors cursor-pointer"
                >
                  Setujui (Lolos Verifikasi)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
