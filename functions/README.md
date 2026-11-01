# Backend Cloud Functions - LPJ Revitalisasi Sekolah

Modul Cloud Functions (TypeScript, Firebase Functions v2, Node.js 20, region `asia-southeast2`) untuk manajemen multi-tenant sekolah, isolasi data, dan keamanan kredensial.

---

## 1. Prasyarat Paket Firebase (Blaze Plan)

> ⚠️ **PENTING**: Cloud Functions v2 memerlukan Firebase project dengan paket **Blaze (Pay as you go)**.
> Paket gratis (*Spark*) tidak mendukung runtime Cloud Functions v2 maupun scheduler Cloud Scheduler.
> Pastikan billing telah diaktifkan pada konsol Firebase:
> `https://console.firebase.google.com/project/_/usage/details`

---

## 2. Struktur Endpoint & Fitur

### A. Manajemen Sekolah (Callables)
1. **`createSchool`**: Membuat sekolah baru. ID dibuat server (`sch_${npsn}_${random}`), PIN di-hash dengan **scrypt + salt acak**, dan pembuat otomatis ditugaskan sebagai **BENDAHARA**.
2. **`searchSchools`**: Pencarian sekolah aktif (min. 3 karakter, rate-limited per user, max 10 hasil). Tidak mengekspos field keamanan.
3. **`joinSchool`**: Bergabung ke sekolah dengan validasi PIN di server (constant-time). Mendukung auto-upgrade hash legacy SHA-256 ke scrypt. Dilengkapi *lockout throttling* (5 kali salah = terkunci 15 menit). Peran BENDAHARA tidak bisa diperoleh via PIN.
4. **`changeSchoolPin`**: Mengganti PIN sekolah (khusus Bendahara).
5. **`deleteSchool`**: Soft delete sekolah (status `deleted`, retensi 30 hari). Menghapus akses membership semua anggota tanpa menghapus data LPJ.
6. **`restoreSchool`**: Memulihkan sekolah yang berstatus soft-delete dalam masa 30 hari.

### B. Anggota & Peran (Callables)
7. **`setMemberRole`**: Mengubah peran anggota (khusus Bendahara). Mencegah penurunan peran Bendahara terakhir.
8. **`removeMember`**: Mengeluarkan anggota (khusus Bendahara). Mencegah penghapusan Bendahara terakhir.

### C. Cadangan & Snapshot Harian
9. **`dailySnapshot`** *(Scheduled: 02:00 Asia/Jakarta)*: Otomatis menduplikasi dokumen `lpj_data` aktif harian jika ada perubahan data sejak snapshot terakhir. Menyimpan maksimal 14 snapshot terbaru.
10. **`listSnapshots`**: Menampilkan daftar snapshot yang tersedia (khusus Bendahara).
11. **`restoreSnapshot`**: Memulihkan data LPJ dari snapshot terpilih (khusus Bendahara). Otomatis membuat snapshot proteksi *pre-restore* dan menaikkan nomor revisi (`rev = rev + 1`).

### D. Pembersihan & Migrasi Sistem
12. **`purgeDeletedSchools`** *(Scheduled: 03:00 Asia/Jakarta)*: Menghapus permanen sekolah yang telah lewat masa retensi 30 hari menggunakan `recursiveDelete`.
13. **`migrateLegacySchools`** *(Admin Callable)*: Migrasi idempotent data sekolah lama. Memindahkan `pinHash`/`pinSalt` ke subkoleksi `private/security`, membersihkan root document, dan mem-backfill `users/{uid}/memberships`.

---

## 3. Konfigurasi Variabel Lingkungan (Environment Variables)

Cloud Functions mendukung konfigurasi environment berikut:

| Variabel | Keterangan | Contoh Nilai |
|---|---|---|
| `ADMIN_UIDS` | Daftar UID pengguna Firebase Auth yang memiliki hak akses menjalankan `migrateLegacySchools`. Pisahkan dengan koma jika lebih dari satu. | `uid_admin_1,uid_admin_2,admin@sekolah.id` |
| `ENFORCE_APPCHECK` | Flag untuk mengaktifkan Firebase App Check (default: `false` untuk kemudahan pengujian). | `true` atau `false` |

### Cara Mengisi `ADMIN_UIDS` di Cloud Functions:

1. Buat file `.env` di dalam folder `functions/`:
```bash
# functions/.env
ADMIN_UIDS="aBcDeFgHiJkLmNoPqRsTuVwXyZ12,anotherAdminUid999"
ENFORCE_APPCHECK="false"
```

2. Atau pasang langsung via Google Cloud Secret / Firebase CLI:
```bash
firebase functions:config:set admin.uids="aBcDeFgHiJkLmNoPqRsTuVwXyZ12"
```

---

## 4. Perintah Kompilasi & Pengujian

Masuk ke direktori functions:
```bash
cd functions
npm run build     # Kompilasi TypeScript ke lib/
npm run lint      # Verifikasi type safety
```

Menjalankan pengujian Firestore Rules di emulator:
```bash
npm run test:rules
```

---

## 5. Perintah Deploy ke Firebase

Untuk men-deploy aturan keamanan Firestore dan Cloud Functions secara bersamaan:

```bash
firebase deploy --only functions,firestore:rules
```

Atau deploy functions saja:
```bash
firebase deploy --only functions
```

Atau deploy firestore rules saja:
```bash
firebase deploy --only firestore:rules
```
