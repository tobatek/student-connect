# Panduan SIMKATMAWA untuk Integrasi Student Connect

Sumber: halaman web SIMKATMAWA (akses sebagai PT) dan dokumentasi API Postman
https://documenter.getpostman.com/view/4139231/2sBXcLebzg

Tanggal penelusuran: 4 Oktober 2026

## 1. Ringkasan

- API hanya memiliki 4 endpoint: login, prestasi mandiri, sertifikasi, rekognisi.
- Ketiga endpoint data berupa POST (hanya membuat data baru). Tidak ada GET, PUT, atau DELETE.
- Modul Kejuaraan, Institusi, dan Prestasi Belmawa tidak punya API. Diisi atau dilihat lewat web.
- Setiap aktivitas API tercatat di sistem. Jangan disalahgunakan.
- `kode_pt` dan `tahun` diisi server berdasarkan akun yang login.

## 2. Modul di web

| Modul | URL | Fungsi | API |
|---|---|---|---|
| Dashboard | /dashboard | Daftar modul sesuai hak akses (PT) | - |
| Dokumentasi | /dokumentasi | Tautan ke dokumentasi API Postman | - |
| Kejuaraan / Ajang / Lomba | /kejuaraan | Laporan ajang yang diselenggarakan PT | Tidak ada |
| Prestasi Belmawa | /prestasibelmawa | Daftar baca prestasi dari Belmawa (mis. NUDC) | Tidak ada |
| Prestasi Mandiri | /prestasimandiri | Prestasi mahasiswa beserta mahasiswa dan dosen | Ada |
| Rekognisi | /rekognisi | Rekognisi mahasiswa/dosen | Ada |
| Sertifikasi | /sertifikasi | Sertifikasi mahasiswa | Ada |
| Institusi | /institusi | Laporan tahunan tata kelola kemahasiswaan | Tidak ada |

Halaman lain: /dashboard/changepwd (ganti password), /logout.

### 2.1 Kejuaraan (web saja)

- Jenis penyelenggaraan: Mandiri, atau Mandiri Terverifikasi (otomatis membentuk 3 tahun berurutan dari tahun terakhir).
- Field: level (Kab/Kota, Provinsi, Nasional, Internasional), kategori (Risnov STEM, Risnov SSH, Seni Budaya, Olahraga, Minat Khusus), bentuk (Luring, Daring, Hibrid), nama ajang, tempat, URL ajang, tahun.
- Laporan kegiatan per tahun: URL ajang dan URL laporan kegiatan (wajib setiap tahun).
- Data peserta dan juara diisi di halaman terpisah.
- Status: Submitted.

### 2.2 Institusi (web saja)

Laporan tahunan berupa checklist 70 indikator. Tiap indikator yang dicentang wajib diberi link dokumen. Ada tombol Simpan Draft per seksi dan Simpan Laporan di akhir.

- A. Kelembagaan Kemahasiswaan: 1 Regulasi pembinaan (11 butir), 2.a Beasiswa pengelolaan (6), 2.b Jumlah penerima beasiswa NonAPBN (isian angka), 3 Layanan kesehatan (6), 4 Konseling (6), 5 Pencegahan kekerasan (5), 6 Anti intoleransi/perundungan/korupsi (3), 7 Kewirausahaan (6), 8 Karakter/bela negara (3).
- B. Sumber Daya Manusia: 1 Level kelembagaan (Level 1, 2, 3, dengan dua dokumen pendukung), 2 Tugas pokok dan fungsi (6).
- C. Prasarana dan Sarana (7 butir).
- D. Pembiayaan: total anggaran PT dan total anggaran kemahasiswaan (isian angka).
- E. Regulasi Penghargaan Capaian Prestasi (6 butir).

### 2.3 Prestasi Belmawa (web saja)

Kolom: ID, lomba/kompetisi, prestasi, tahun, PT, keterangan (peran dan nama mahasiswa). Hanya tampil, tidak ada tombol tambah.

## 3. API

Base URL: `https://simkatmawa.kemdiktisaintek.go.id`

### 3.1 Login

`POST /api/login`

Header: `Content-Type: application/json`

```json
{"email": "xxxxx@xxxx.com", "password": "xxxxxxx"}
```

Respons 200:

```json
{"success": true, "kode_pt": "999999", "token": "eyJ0eXAi..."}
```

Token dipakai di request berikutnya: `Authorization: Bearer {token}`

### 3.2 Prestasi Mandiri

`POST /api/prestasi-mandiri`

```json
{
  "level": "NAS",
  "kategori": "RISNOV",
  "lomba": "National Programming Contest",
  "cabang": "Matematika Lanjut",
  "penyelenggara": "PT. LOMBA",
  "peringkat": "JUARA1",
  "jumlah_unit_peserta": "3",
  "kelompok_prestasi": "KELOMPOK",
  "bentuk": "DARING",
  "url_peserta": "http://www.test.com",
  "url_sertifikat": "http://www.test.com",
  "tgl_sertifikat": "2025-05-01",
  "url_foto_upp": "http://www.test.com",
  "url_dokumen_undangan": "http://www.test.com",
  "keterangan": "Catatan",
  "mahasiswa": [
    {"nim": "51422001", "nama": "Budi Santoso"},
    {"nim": "51422002", "nama": "Siti Aminah"}
  ],
  "dosen": [
    {"nuptk": "511111422001", "nama": "Budi Santoso", "url_surat_tugas": "http://www.dokument.com"}
  ]
}
```

Nilai enum:

- `level`: KAB, PROV, NAS, INT
- `kategori`: RISNOV (Riset dan Inovasi STEM), RISNOVSSH (Riset dan Inovasi SSH), SENBUD (Seni dan Budaya), OLAHRAGA, MINAT (Minat Khusus)
- `peringkat`: JUARA1, JUARA2, JUARA3, HARAPAN1, HARAPAN2, HARAPAN3, APRESIASI (Apresiasi Kejuaraan/Penghargaan Tambahan/Juara Umum), PESERTA
- `kelompok_prestasi`: INDIVIDU, KELOMPOK
- `bentuk`: LURING, DARING
- `jumlah_unit_peserta`: jumlah PT (level nasional) atau jumlah negara (level internasional)

### 3.3 Sertifikasi

`POST /api/sertifikasi`

Field: `level`, `nama`, `penyelenggara`, `url_peserta`, `url_sertifikat`, `tgl_sertifikat`, `url_foto_upp`, `url_dokumen_undangan`, `keterangan`, `mahasiswa[]`, `dosen[]`.

### 3.4 Rekognisi

`POST /api/rekognisi`

Field sama dengan sertifikasi, ditambah `jenis`:

| Kode | Arti |
|---|---|
| SERKOM | Sertifikat Kompetensi |
| JURIOR | Juri/Pelatih/Wasit Olahraga |
| JURINOR | Juri/Pelatih/Wasit Non Olahraga |
| KEYCONF | Keynote speaker conference |
| KEYWORK | Keynote speaker workshop/pelatihan/bimbingan teknis |
| PAMERAN | Pameran karya seni |
| KARYA | Karya cipta lagu dan/atau seni tari |
| BUKU | Penulis buku |
| PATEN | Paten/Paten Sederhana |
| PUB | Publikasi artikel ilmiah |
| DUTA | Duta (Brand Ambassador) |
| PTG | Produk Teknologi Tepat Guna |
| PSB | Produk Seni dan Budaya |
| PKD | Produk Kreatif Dunia Usaha dan Industri |

Catatan: di form web rekognisi, pilihan `level` tidak memuat KAB (hanya PROV, NAS, INT), sedangkan dokumentasi API mencantumkan KAB.

### 3.5 Respons sukses (ketiga endpoint)

```json
{
  "status": true,
  "message": "Prestasi berhasil disimpan",
  "data": { "...": "...", "kode_pt": "000000", "tahun": "2026", "id": 518023 }
}
```

### 3.6 Aturan field (dari form web)

Wajib: semua field di atas kecuali `url_foto_upp`, `url_dokumen_undangan`, `keterangan`, dan seluruh isian dosen. Minimal satu mahasiswa (NIM dan nama).

## 4. Catatan desain Student Connect

1. Simpan URL dokumen bukti (sertifikat, surat tugas, dll.), bukan hanya file upload, karena API menerima tautan.
2. Siapkan tabel mapping nilai internal ke kode SIMKATMAWA (NAS, JUARA1, RISNOV, dst.).
3. Form web prestasi mandiri menampilkan bentuk "Luring/Hibrida" dan "Daring", sedangkan dokumentasi API menulis LURING/DARING. Uji perilaku untuk hibrida.
4. Tidak ada endpoint ubah/hapus/lihat. Simpan `id` dari respons dan tandai data sudah terkirim agar tidak terkirim ganda. Koreksi data dilakukan lewat web.
5. Masa berlaku token tidak dijelaskan. Siapkan login ulang otomatis saat 401. Simpan kredensial hanya di server.
6. Dokumentasi tidak menjelaskan kode error, format validasi, rate limit, atau header Accept. Contoh request masih memakai `localhost:8000`. Uji sendiri dan konfirmasi ke pengelola.
7. Web memakai verifikasi Cloudflare. Uji bahwa panggilan API dari server tidak terblokir.
8. Dokumentasi tidak menjelaskan status data dari API (Submitted atau Verified). Konfirmasi ke pengelola.
9. Gunakan antrean dan retry untuk pengiriman, dengan log permintaan dan respons per data.

## 5. Contoh alur integrasi

1. Mahasiswa atau admin mengisi prestasi/sertifikasi/rekognisi di Student Connect, lengkap dengan link bukti.
2. Admin PT memverifikasi data internal.
3. Job pengirim login ke `/api/login` (atau memakai token yang masih valid).
4. Data dipetakan ke payload endpoint yang sesuai dan dikirim.
5. Simpan `id` SIMKATMAWA, status, dan pesan respons. Jika gagal, tandai dan coba ulang.
