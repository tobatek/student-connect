import React, { useState } from 'react';
import { DocumentR2, TenantConfig, UserRole } from '../types';
import {
  HardDrive,
  Upload,
  Lock,
  Copy,
  Check,
  Trash2,
  Search,
  AlertTriangle,
  X,
} from 'lucide-react';
import { R2Service } from '../services/r2Service';

interface DocumentVaultViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  documents: DocumentR2[];
  onUpdateDocuments: (docs: DocumentR2[]) => void;
  onPreviewDocument: (url: string, title: string, meta?: Partial<DocumentR2>) => void;
}

export const DocumentVaultView: React.FC<DocumentVaultViewProps> = ({
  tenant,
  activeRole,
  documents,
  onUpdateDocuments,
  onPreviewDocument,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const filteredDocs = documents.filter(
    (d) =>
      d.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.owner_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.document_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const doc = await R2Service.uploadFile(
        file,
        'prestasi-mandiri',
        `vault-${Date.now()}`,
        'sertifikat',
        'admin',
        'operator-vault',
        `${activeRole} (${tenant.nama_pt})`
      );
      onUpdateDocuments([doc, ...documents]);
    } catch (err: any) {
      setUploadError(err.message || 'Gagal mengunggah file.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = (doc: DocumentR2) => {
    if (doc.is_locked) {
      alert('Dokumen ini terkunci karena sudah menjadi bukti resmi data terkirim ke pangkalan data nasional!');
      return;
    }
    if (confirm(`Yakin ingin menghapus dokumen "${doc.original_filename}" dari repositori?`)) {
      const res = R2Service.deleteDocument(doc.id);
      if (res.success) {
        onUpdateDocuments(documents.filter((d) => d.id !== doc.id));
      } else {
        alert(res.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Repositori Dokumen Digital</span>
            <span>·</span>
            <span className="font-semibold text-teal-800">Arsip Permanen Terverifikasi</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-teal-800" />
            Repositori Dokumen Bukti & Sertifikat Mahasiswa
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Penyimpanan digital terpusat untuk seluruh dokumen sertifikat, daftar peserta lomba, surat tugas pembina, dan dokumen legalitas institusi.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Mengunggah...' : 'Upload Dokumen Baru'}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              disabled={isUploading}
              onChange={handleDirectUpload}
            />
          </label>
        </div>
      </div>

      {uploadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Domain info and stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-500 text-[11px] block">Public Domain R2</span>
          <span className="font-mono font-bold text-slate-900 block mt-1 truncate">
            {tenant.r2_bucket_domain}
          </span>
          <span className="text-[10px] text-teal-800 font-medium block mt-1">
            ✓ Akses publik permanen aktif
          </span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-500 text-[11px] block">Total Dokumen Tersimpan</span>
          <span className="font-mono font-bold text-2xl text-slate-900 block mt-1 tabular-nums">
            {documents.length} File
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">
            Format: PDF, JPG, PNG (Max 15MB)
          </span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-500 text-[11px] block">Dokumen Terkunci Resmi</span>
          <span className="font-mono font-bold text-2xl text-amber-700 block mt-1 tabular-nums">
            {documents.filter((d) => d.is_locked).length} Terkunci
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">
            Terikat dengan record pangkalan data nasional
          </span>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          Daftar berkas terindeks pada storage bucket <strong className="font-mono text-slate-700">{tenant.slug}</strong>
        </span>
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama berkas, pemilik..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-teal-600"
          />
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Nama Berkas & Tipe</th>
                <th className="py-3 px-4">Pemilik & Pengunggah</th>
                <th className="py-3 px-4">Ukuran & MIME</th>
                <th className="py-3 px-4">Public URL (Non-Expired)</th>
                <th className="py-3 px-4">Status Kunci</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                    Belum ada dokumen tersimpan.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 truncate" title={doc.original_filename}>
                        {doc.original_filename}
                      </div>
                      <span className="text-[11px] text-teal-800 uppercase font-mono mt-0.5 block">
                        {doc.document_type}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-slate-800 font-medium">{doc.owner_name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        {new Date(doc.created_at).toLocaleDateString('id-ID')}
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600">
                      <div>{(doc.size_bytes / 1024).toFixed(1)} KB</div>
                      <div className="text-[10px] text-slate-400">{doc.mime_type}</div>
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-slate-600 truncate max-w-[200px] select-all">
                          {doc.public_url}
                        </span>
                        <button
                          onClick={() => handleCopy(doc.public_url)}
                          className="p-1 text-slate-400 hover:text-teal-800 transition-colors cursor-pointer"
                          title="Salin Public URL"
                        >
                          {copiedUrl === doc.public_url ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {doc.is_locked ? (
                        <span className="text-amber-800 font-medium text-[11px] flex items-center gap-1">
                          <Lock className="w-3 h-3 text-amber-600" /> Terkunci Resmi
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Bebas Edit</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onPreviewDocument(doc.public_url, doc.original_filename, doc)}
                          className="px-2.5 py-1 text-xs font-medium text-teal-850 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors cursor-pointer"
                        >
                          Pratinjau
                        </button>
                        {!doc.is_locked && (
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Hapus Dokumen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
    </div>
  );
};
