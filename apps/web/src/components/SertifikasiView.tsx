import React, { useState } from 'react';
import {
  Sertifikasi,
  UserRole,
  TenantConfig,
  LevelType,
} from '../types';
import {
  FileCheck2,
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

interface SertifikasiViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  items: Sertifikasi[];
  onUpdateItems: (items: Sertifikasi[]) => void;
  onPreviewDocument: (url: string, title: string) => void;
}

export const SertifikasiView: React.FC<SertifikasiViewProps> = ({
  tenant,
  activeRole,
  items,
  onUpdateItems,
  onPreviewDocument,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<Sertifikasi | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Sertifikasi>>({
    level: 'NAS',
    nama: '',
    penyelenggara: '',
    url_peserta: '',
    url_sertifikat: '',
    tgl_sertifikat: new Date().toISOString().split('T')[0],
    url_foto_upp: '',
    url_dokumen_undangan: '',
    keterangan: '',
    mahasiswa: [{ nim: '', nama: '', prodi: '' }],
    dosen: [],
  });

  const canVerify = ['SUPER_ADMIN', 'ADMIN_PT', 'ADMIN_KEMAHASISWAAN'].includes(activeRole);
  const canSubmitApi = ['SUPER_ADMIN', 'ADMIN_PT'].includes(activeRole);

  const filteredItems = items.filter((item) => {
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
    const matchesSearch =
      item.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.penyelenggara.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.mahasiswa.some(
        (m) =>
          m.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.nim.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return matchesStatus && matchesSearch;
  });

  const handleOpenNewForm = () => {
    setFormData({
      level: 'NAS',
      nama: '',
      penyelenggara: '',
      url_peserta: '',
      url_sertifikat: '',
      tgl_sertifikat: new Date().toISOString().split('T')[0],
      url_foto_upp: '',
      url_dokumen_undangan: '',
      keterangan: '',
      mahasiswa: [{ nim: '', nama: '', prodi: '' }],
      dosen: [],
    });
    setIsFormOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nama || !formData.penyelenggara || !formData.url_sertifikat || !formData.url_peserta) {
      alert('Harap lengkapi semua field wajib dan URL dokumen bukti!');
      return;
    }

    const validMahasiswa = (formData.mahasiswa || []).filter((m) => m.nim && m.nama);
    if (validMahasiswa.length === 0) {
      alert('Minimal harus mencantumkan 1 mahasiswa (NIM & Nama)!');
      return;
    }

    const newItem: Sertifikasi = {
      id: formData.id || `cert-${Date.now()}`,
      tenant_id: tenant.id,
      status: 'SUBMITTED_INTERNAL',
      submission_attempts: 0,
      level: formData.level as LevelType,
      nama: formData.nama || '',
      penyelenggara: formData.penyelenggara || '',
      url_peserta: formData.url_peserta || '',
      url_sertifikat: formData.url_sertifikat || '',
      tgl_sertifikat: formData.tgl_sertifikat || new Date().toISOString().split('T')[0],
      url_foto_upp: formData.url_foto_upp || '',
      url_dokumen_undangan: formData.url_dokumen_undangan || '',
      keterangan: formData.keterangan || '',
      mahasiswa: validMahasiswa,
      dosen: formData.dosen || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: `${activeRole} (${tenant.nama_pt})`,
    };

    const exists = items.some((i) => i.id === newItem.id);
    let updated: Sertifikasi[];
    if (exists) {
      updated = items.map((i) => (i.id === newItem.id ? newItem : i));
    } else {
      updated = [newItem, ...items];
    }

    onUpdateItems(updated);
    setIsFormOpen(false);
  };

  const handleUploadR2 = async (
    docType: 'sertifikat' | 'peserta' | 'foto_upp',
    file: File
  ) => {
    try {
      const uploadedDoc = await R2Service.uploadFile(
        file,
        'sertifikasi',
        formData.id || `cert-temp-${Date.now()}`,
        docType,
        'mahasiswa',
        'mhs-active',
        'Pengusul Sertifikasi'
      );

      if (docType === 'sertifikat') {
        setFormData((prev) => ({ ...prev, url_sertifikat: uploadedDoc.public_url }));
      } else if (docType === 'peserta') {
        setFormData((prev) => ({ ...prev, url_peserta: uploadedDoc.public_url }));
      } else if (docType === 'foto_upp') {
        setFormData((prev) => ({ ...prev, url_foto_upp: uploadedDoc.public_url }));
      }
    } catch (err: any) {
      alert(`Gagal upload ke R2: ${err.message}`);
    }
  };

  const handleSendToSimkatmawa = async (item: Sertifikasi) => {
    if (item.status === 'SENT') {
      alert('Data sertifikasi sudah terkirim ke Portal Nasional!');
      return;
    }
    if (item.status !== 'VERIFIED') {
      alert('Data harus berstatus "VERIFIED" sebelum dikirim ke Portal Nasional!');
      return;
    }

    setIsSending(true);
    setSendResult(null);

    try {
      const res = await SimkatmawaApiService.submitSertifikasi(
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
        message: err.message || 'Terjadi kesalahan sistem.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleVerify = (item: Sertifikasi) => {
    const updated = items.map((i) =>
      i.id === item.id ? { ...i, status: 'VERIFIED' as const } : i
    );
    onUpdateItems(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Pelaporan Kompetensi & Profesi Mahasiswa</span>
            <span>·</span>
            <span className="font-semibold text-teal-800">Standar Pelaporan Nasional</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-teal-800" />
            Sertifikasi Kompetensi Mahasiswa
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Pencatatan sertifikat keahlian profesi (BNSP, LSP, Asosiasi Internasional) dengan bukti asesmen terverifikasi untuk pengakuan Surat Keterangan Pendamping Ijazah (SKPI).
          </p>
        </div>

        <button
          onClick={handleOpenNewForm}
          className="px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Usulkan Sertifikasi</span>
        </button>
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

      {/* Filter Tabs & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'ALL', label: 'Semua' },
            { id: 'VERIFIED', label: 'Siap Kirim (Verified)' },
            { id: 'SENT', label: 'Tersinkron (Sent)' },
            { id: 'SUBMITTED_INTERNAL', label: 'Review Internal' },
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
            placeholder="Cari sertifikasi, nama, NIM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-teal-600"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Nama Sertifikasi & Penyelenggara</th>
                <th className="py-3 px-4">Tingkat & Tanggal</th>
                <th className="py-3 px-4">Mahasiswa Penerima</th>
                <th className="py-3 px-4">Dokumen R2</th>
                <th className="py-3 px-4">Status Portal Nasional</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                    Tidak ada data sertifikasi yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 leading-snug line-clamp-2">
                        {item.nama}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Lembaga: {item.penyelenggara}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-teal-800 font-mono">
                        Level: {item.level}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        {item.tgl_sertifikat}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {item.mahasiswa.map((m, idx) => (
                        <div key={idx} className="text-slate-800 font-medium">
                          {m.nama} <span className="text-[11px] text-slate-500 font-mono">({m.nim})</span>
                        </div>
                      ))}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 text-[11px]">
                        <button
                          onClick={() => onPreviewDocument(item.url_sertifikat, `Sertifikat: ${item.nama}`)}
                          className="text-teal-800 hover:underline flex items-center gap-1 cursor-pointer text-left"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Sertifikat</span>
                        </button>
                        <button
                          onClick={() => onPreviewDocument(item.url_peserta, `Bukti Asesmen: ${item.nama}`)}
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
                        </div>
                      ) : item.status === 'VERIFIED' ? (
                        <span className="text-teal-900 font-semibold text-xs flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-teal-700" /> Siap Kirim (Verified)
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium text-xs flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" /> Review Internal
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {canVerify && item.status === 'SUBMITTED_INTERNAL' && (
                          <button
                            onClick={() => handleVerify(item)}
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
                          <span className="px-2 py-0.5 text-[11px] text-slate-400 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Terkunci
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

      {/* MODAL: Input Sertifikasi */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ajukan Data Sertifikasi Mahasiswa</h3>
                <p className="text-xs text-slate-500">Pendaftaran sertifikat profesi resmi</p>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Level Sertifikasi <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value as LevelType })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="KAB">KAB - Kabupaten / Kota</option>
                    <option value="PROV">PROV - Provinsi</option>
                    <option value="NAS">NAS - Nasional (BNSP / LSP Terlisensi)</option>
                    <option value="INT">INT - Internasional</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tanggal Sertifikat <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.tgl_sertifikat}
                    onChange={(e) => setFormData({ ...formData, tgl_sertifikat: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Sertifikasi / Kompetensi <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Sertifikasi Asisten Apoteker Klinis BNSP"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Lembaga / Asosiasi Penerbit <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Badan Nasional Sertifikasi Profesi (BNSP)"
                  value={formData.penyelenggara}
                  onChange={(e) => setFormData({ ...formData, penyelenggara: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  required
                />
              </div>

              {/* R2 Documents */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <span className="font-semibold text-slate-900 block text-xs">
                  Dokumen Bukti R2 Vault (Non-Expired Public URL)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      URL Sertifikat / E-Certificate <span className="text-red-500">*</span>
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
                      <Upload className="w-3 h-3" /> Upload Sertifikat ke R2
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
                      URL Bukti Asesmen / Peserta <span className="text-red-500">*</span>
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
                      <Upload className="w-3 h-3" /> Upload Bukti ke R2
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
              </div>

              {/* Mahasiswa */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <span className="font-semibold text-slate-900 block text-xs">
                  Mahasiswa Pemilik Sertifikasi <span className="text-red-500">*</span>
                </span>
                {(formData.mahasiswa || []).map((m, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded">
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
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  value={formData.keterangan}
                  onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                  placeholder="Keterangan uji kompetensi atau masa berlaku sertifikat"
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
    </div>
  );
};
