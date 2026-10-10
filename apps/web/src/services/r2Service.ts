import { DocumentR2, TenantConfig } from '../types';
import { StorageService } from './storage';

export const R2Service = {
  uploadFile: async (
    file: File,
    recordType: 'prestasi-mandiri' | 'sertifikasi' | 'rekognisi' | 'kejuaraan' | 'institusi',
    recordId: string,
    documentType: 'sertifikat' | 'peserta' | 'undangan' | 'foto_upp' | 'surat_tugas' | 'laporan',
    ownerType: 'mahasiswa' | 'dosen' | 'admin',
    ownerId: string,
    ownerName: string
  ): Promise<DocumentR2> => {
    const tenant: TenantConfig = StorageService.getTenant();
    
    // Validate mime type
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];
    if (!allowedMimeTypes.includes(file.type)) {
      throw new Error(`Tipe file tidak didukung: ${file.type}. Harap unggah PDF, JPG, atau PNG.`);
    }

    // Max 15MB
    if (file.size > 15 * 1024 * 1024) {
      throw new Error('Ukuran file melebihi batas maksimal 15 MB.');
    }

    // Sanitize filename
    const cleanFileName = file.name
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '-')
      .replace(/-+/g, '-');
    const timestamp = Date.now().toString(36);
    const finalFilename = `${documentType}-${timestamp}-${cleanFileName}`;

    const storageKey = `tenants/${tenant.slug}/simkatmawa/${tenant.tahun_aktif}/${recordType}/${recordId}/${documentType}/${finalFilename}`;
    const publicUrl = `${tenant.r2_bucket_domain}/${storageKey}`;

    // Mock quick checksum calculation
    const checksum = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);

    const newDoc: DocumentR2 = {
      id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenant_id: tenant.id,
      owner_type: ownerType,
      owner_id: ownerId,
      owner_name: ownerName,
      document_type: documentType,
      original_filename: file.name,
      storage_key: storageKey,
      public_url: publicUrl,
      mime_type: file.type,
      size_bytes: file.size,
      checksum,
      is_locked: false,
      created_at: new Date().toISOString(),
    };

    const currentDocs = StorageService.getDocuments();
    StorageService.saveDocuments([newDoc, ...currentDocs]);

    return newDoc;
  },

  lockDocumentsForRecord: (publicUrls: string[]) => {
    const docs = StorageService.getDocuments();
    const updated = docs.map((doc) => {
      if (publicUrls.includes(doc.public_url)) {
        return { ...doc, is_locked: true };
      }
      return doc;
    });
    StorageService.saveDocuments(updated);
  },

  deleteDocument: (docId: string): { success: boolean; message?: string } => {
    const docs = StorageService.getDocuments();
    const target = docs.find((d) => d.id === docId);
    if (!target) {
      return { success: false, message: 'Dokumen tidak ditemukan.' };
    }
    if (target.is_locked) {
      return {
        success: false,
        message: 'Dokumen terkunci karena sudah menjadi lampiran resmi data terkirim SIMKATMAWA.',
      };
    }

    const filtered = docs.filter((d) => d.id !== docId);
    StorageService.saveDocuments(filtered);
    return { success: true };
  },
};
