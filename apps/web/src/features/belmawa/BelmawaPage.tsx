import { ExternalLink, Eye, Info, Medal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

const SIMKATMAWA_URL = 'https://simkatmawa.kemdiktisaintek.go.id/prestasibelmawa';

/**
 * Prestasi Belmawa tidak punya API dan tidak punya tombol tambah di SIMKATMAWA (daftar baca saja).
 * Halaman ini sengaja tidak menampilkan data buatan; ia menjelaskan cara melihat daftarnya.
 */
export default function BelmawaPage() {
  return (
    <>
      <PageHeader title="Prestasi Belmawa" description="Daftar prestasi dari Belmawa (mis. NUDC) yang tercatat untuk perguruan tinggi Anda." />
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <Medal className="size-7" aria-hidden />
          </span>
          <div className="min-w-0 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Dilihat langsung di SIMKATMAWA</h2>
              <p className="mt-1 max-w-2xl text-slate-700">
                Modul ini hanya menampilkan data (ID, lomba/kompetisi, prestasi, tahun, PT, dan keterangan peran serta nama mahasiswa). Belmawa yang mengisinya, dan SIMKATMAWA tidak menyediakan API untuk membacanya, sehingga Student Connect tidak menyalin atau menampilkan ulang datanya.
              </p>
            </div>
            <Alert tone="info" title="Mengapa tidak ada tombol tambah?">
              Data Prestasi Belmawa berasal dari Belmawa dan tidak dapat ditambah atau diubah oleh perguruan tinggi. Bila ada data yang keliru, ajukan koreksi ke pengelola SIMKATMAWA.
            </Alert>
            <a href={SIMKATMAWA_URL} target="_blank" rel="noopener noreferrer">
              <Button icon={<Eye className="size-4" aria-hidden />}>
                Buka daftar di SIMKATMAWA
                <ExternalLink className="size-4" aria-hidden />
              </Button>
            </a>
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Info className="size-4 shrink-0" aria-hidden /> Anda perlu masuk dengan akun PT di SIMKATMAWA.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
