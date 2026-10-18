import type { DocumentItem, DocumentRecordType, DocumentType } from '@students-connect/contracts';
import { api } from '@/lib/api';

export const MAX_UPLOAD_MB = 5;
export const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png';

export interface UploadTarget {
  record_type: DocumentRecordType;
  record_ref: string;
  document_type: DocumentType;
  tahun?: number;
}

/** Validasi cepat di klien untuk UX; backend tetap memeriksa isi file (magic bytes) dan ukuran. */
export const validateFile = (file: File): string | null => {
  if (file.size === 0) return 'File kosong.';
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `Ukuran file maksimal ${MAX_UPLOAD_MB} MB.`;
  if (!ACCEPTED_TYPES.split(',').includes(file.type)) return 'Hanya PDF, JPG, atau PNG yang diizinkan.';
  return null;
};

export function uploadDocument(file: File, target: UploadTarget): Promise<DocumentItem> {
  const form = new FormData();
  form.set('record_type', target.record_type);
  form.set('record_ref', target.record_ref);
  form.set('document_type', target.document_type);
  if (target.tahun) form.set('tahun', String(target.tahun));
  form.set('file', file);
  return api<DocumentItem>('/api/documents', { method: 'POST', form });
}
