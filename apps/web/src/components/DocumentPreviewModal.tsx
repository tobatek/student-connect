import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Lock,
  FileCheck,
} from 'lucide-react';
import { DocumentR2 } from '../types';

interface DocumentPreviewModalProps {
  documentUrl: string;
  documentTitle?: string;
  documentMeta?: Partial<DocumentR2>;
  onClose: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  documentUrl,
  documentTitle = 'Dokumen Bukti Kemahasiswaan',
  documentMeta,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(documentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPdf = documentUrl.endsWith('.pdf') || documentMeta?.mime_type === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-snug">{documentTitle}</h3>
              <p className="text-xs text-slate-500">Berkas Dokumen Bukti Sah</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Permanent URL banner */}
        <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 overflow-hidden w-full sm:w-auto">
            <span className="font-semibold text-amber-900 shrink-0">Tautan Dokumen Bukti:</span>
            <span className="font-mono text-slate-700 truncate select-all">{documentUrl}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-300 rounded text-amber-900 font-medium hover:bg-amber-100 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin!' : 'Salin URL'}</span>
            </button>
            <a
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-800 text-white rounded font-medium hover:bg-teal-900 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka</span>
            </a>
          </div>
        </div>

        {/* Content Viewer Simulator */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/70">
          <div className="bg-white rounded-lg border border-slate-300 p-8 shadow-xs max-w-xl mx-auto min-h-[380px] flex flex-col justify-between">
            {/* Visual Header of Academic Document */}
            <div>
              <div className="border-b-2 border-slate-900 pb-4 mb-6 text-center">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                  KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI
                </div>
                <div className="text-sm font-bold text-slate-900 mt-1 uppercase">
                  LEMBAR DOKUMEN BUKTI CAPAIAN PRESTASI MAHASISWA
                </div>
                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                  STIKES ADVAITA MEDIKA NUSANTARA · KODE PT: 041088
                </div>
              </div>

              <div className="space-y-4 text-xs text-slate-700">
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <div className="text-[11px] text-slate-500 uppercase font-semibold">Nama Berkas Asli</div>
                  <div className="font-semibold text-slate-900 mt-0.5 font-mono">
                    {documentMeta?.original_filename || documentUrl.split('/').pop() || 'dokumen-bukti.pdf'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Kategori Dokumen</span>
                    <span className="font-medium text-slate-800 uppercase mt-0.5 block">
                      {documentMeta?.document_type || 'Sertifikat / Bukti Kegiatan'}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Format MIME</span>
                    <span className="font-medium text-slate-800 font-mono mt-0.5 block">
                      {documentMeta?.mime_type || (isPdf ? 'application/pdf' : 'image/jpeg')}
                    </span>
                  </div>
                </div>

                {documentMeta?.storage_key && (
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Kode Berkas Arsip</span>
                    <span className="font-mono text-[11px] text-slate-700 break-all block mt-0.5">
                      {documentMeta.storage_key}
                    </span>
                  </div>
                )}

                <div className="p-3 bg-emerald-50 rounded border border-emerald-200 text-emerald-900">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    Status Verifikasi Dokumen: Sah & Aktif
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Dokumen ini telah terarsip dan dapat diakses untuk keperluan kurasi dan verifikasi pangkalan data nasional.
                  </p>
                </div>
              </div>
            </div>

            {/* Document footer notice */}
            <div className="border-t border-slate-200 pt-4 mt-6 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono">Checksum: {documentMeta?.checksum || 'a89c74f5d24b6f12'}</span>
              {documentMeta?.is_locked ? (
                <span className="flex items-center gap-1 text-slate-600 font-semibold">
                  <Lock className="w-3.5 h-3.5 text-amber-600" /> Terkunci (Tersinkron Resmi)
                </span>
              ) : (
                <span className="text-slate-500">Belum Terkunci</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Dokumen bukti wajib menggunakan public URL permanen tanpa expired link.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-medium transition-colors cursor-pointer"
          >
            Tutup Pratinjau
          </button>
        </div>
      </div>
    </div>
  );
};
