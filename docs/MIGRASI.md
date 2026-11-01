# Panduan Migrasi Data Lama Multi-Tenant LPJ Revitalisasi Sekolah

Dokumen ini menjelaskan prosedur migrasi data dari sistem lama (Single-School / Client-side PIN verification) ke sistem baru **Multi-Tenant Server-Authoritative** (Satu Akun, Banyak Sekolah).

---

## Ringkasan Perubahan Arsitektur

| Aspek | Sistem Lama (Legacy) | Sistem Baru (Multi-Tenant) |
|---|---|---|
| **Penyimpanan PIN** | Hash di root dokumen `schools/{id}` (`pinHash`, `pinSalt`) | Subkoleksi privat `schools/{id}/private/security` |
| **Algoritma PIN** | SHA-256 + salt di browser | Scrypt berstandar industri via Cloud Functions |
| **Daftar Sekolah Pengguna** | Scan seluruh koleksi `schools` (`getDocs`) | Realtime listener subkoleksi `users/{uid}/memberships` |
| **Otorisasi Role** | Disimpan di klien (mudah dimanipulasi) | Server-driven via Firestore Rules & Cloud Functions |
| **Format Dokumen LPJ** | Dokumen tunggal raksasa `lpj_data/current` | Domain modular terpencar (`master`, `kwitansi`, `bku`, dll.) |

---

## Urutan Operasi Aman (Step-by-Step)

Ikuti urutan langkah di bawah ini secara ketat untuk menjamin data tidak hilang, tidak rusak, dan tidak mengalami downtime.

```
[1. Backup JSON] ──> [2. Deploy Functions & Rules] ──> [3. Dry Run] ──> [4. Eksekusi Migrasi] ──> [5. Deploy Frontend] ──> [6. Verifikasi] ──> [7. Bersihkan Field Legacy]
```

---

### Langkah 1: Backup JSON Tiap Sekolah

Sebelum melakukan perubahan apa pun pada database:
1. Masuk ke aplikasi sebagai Bendahara untuk masing-masing sekolah.
2. Buka menu **Backup & Restore Data** di bilah navigasi atas (ikon Hard Drive).
3. Klik tombol **Unduh Cadangan Lengkap (JSON)**.
4. Simpan file cadangan tersebut di tempat yang aman (misalnya: Google Drive terenkripsi atau penyimpanan lokal bertanggal).

---

### Langkah 2: Deploy Cloud Functions & Firestore Rules

Terapkan backend Cloud Functions dan aturan keamanan Firestore terbaru:

```bash
# 1. Deploy Firestore Security Rules
firebase deploy --only firestore:rules

# 2. Deploy Cloud Functions (region: asia-southeast2)
firebase deploy --only functions
```

Pastikan variabel lingkungan `ADMIN_UIDS` telah diatur di Google Cloud Console atau Cloud Functions environment:
```bash
firebase functions:config:set admin.uids="Jenong1221@gmail.com,UID_ADMIN_LAIN"
```

---

### Langkah 3: Jalankan Simulasi (Dry Run)

Simulasi dilakukan untuk memvalidasi dokumen tanpa mengubah data nyata di Firestore.

1. Buka aplikasi dan login dengan akun yang terdaftar di `ADMIN_UIDS`.
2. Klik tombol **Portal Sekolah** di Header, lalu pilih tab **⚙️ Migrasi Sekolah Lama**.
3. Klik tombol **Jalankan Simulasi (Dry Run)**.
4. Sistem akan memanggil Cloud Function `migrateLegacySchools({ dryRun: true })`.
5. Periksa tabel hasil simulasi:
   - **School ID & Nama Sekolah**: Pastikan seluruh sekolah terdeteksi.
   - **PIN Dipindahkan**: Menunjukkan apakah kredensial akan dipindahkan ke subkoleksi privat.
   - **Membership Dibuat**: Menunjukkan jumlah akun anggota yang akan didaftarkan ke `users/{uid}/memberships`.
   - **Status**: Memastikan tidak ada error atau anomali.

---

### Langkah 4: Eksekusi Migrasi Sungguhan

Setelah hasil simulasi dipastikan valid dan akurat:
1. Pada panel yang sama, klik tombol **Eksekusi Migrasi Sungguhan**.
2. Kotak dialog konfirmasi akan muncul. Klik **Ya, Eksekusi Sekarang**.
3. Cloud Function `migrateLegacySchools({ dryRun: false })` akan:
   - Membuat dokumen `schools/{id}/private/security` berisi `pinHash`, `pinSalt`, dan `algo: 'sha256-legacy'`.
   - Menghapus field `pinHash` dan `pinSalt` dari root dokumen `schools/{id}`.
   - Membaca subkoleksi `schools/{id}/members` dan membuat dokumen `users/{uid}/memberships/{schoolId}` untuk setiap anggota.
   - Mengisi status sekolah menjadi `status: 'active'`.

---

### Langkah 5: Deploy Frontend Baru

Setelah data database termigrasi:
```bash
# Build dan deploy aplikasi web
npm run build
# Deploy hosting
firebase deploy --only hosting
```

---

### Langkah 6: Verifikasi Hasil Migrasi

Lakukan pengecekan fungsi:
1. **Login Pengguna**: Login dengan akun pengguna yang sebelumnya menjadi anggota sekolah.
2. **Daftar Sekolah**: Verifikasi bahwa daftar "Sekolah Saya" muncul di dropdown Header tanpa perlu mencari manual.
3. **Pindah Sekolah**: Pindah antar sekolah dan pastikan data LPJ (BKU, Kwitansi, RPD) termuat utuh.
4. **Upgrade Algoritma PIN**: Saat salah satu pengguna bergabung atau memasukkan PIN sekolah, sistem secara otomatis meng-upgrade hash PIN dari SHA-256 legacy ke **scrypt**.

---

### Langkah 7: (Opsional) Pembersihan Dokumen Legacy

Setelah sistem baru berjalan stabil selama minimal 14 hari:
- Dokumen legacy `schools/{id}/lpj_data/current` dapat dihapus jika semua pembacaan domain modular (`schools/{id}/lpj_data/*`) sudah lengkap dan diverifikasi.
- Subkoleksi cadangan `schools/{id}/snapshots` secara otomatis mempertahankan maksimal 14 snapshot harian terbaru.
