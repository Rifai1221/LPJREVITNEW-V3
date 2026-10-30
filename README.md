# Aplikasi Penyusunan LPJ Revitalisasi Sekolah Terintegrasi

Aplikasi modern, aman, dan berstandar nasional untuk penyusunan Laporan Pertanggungjawaban (LPJ) Revitalisasi Fisik Satuan Pendidikan. Memenuhi standar petunjuk teknis Kementerian Pendidikan Dasar dan Menengah RI serta regulasi perpajakan yang berlaku (UU HPP & PMK No. 59/PMK.03/2022).

---

## Fitur Utama

- **Otentikasi Nyata & Multi-Tenancy**:
  * Login Multi-Faktor per sekolah dengan hash PIN berbasis salted SHA-256 (Web Crypto API).
  * Role-Based Access Control (RBAC): `BENDAHARA`, `TIM_TEKNIS`, `KEPALA_SEKOLAH`, dan `FASILITATOR`.
  * Multi-Tenant aman dengan isolasi data antar dokumen sekolah di Firestore.

- **Buku Pembukuan Keuangan Lengkap**:
  * Buku Kas Umum (BKU), Buku Kas Bank (BKB), dan Buku Kas Tunai (BKT).
  * Rekonsiliasi keuangan presisi integer rupiah: $\text{Saldo BKU} = \text{Saldo BKB} + \text{Saldo BKT}$ tanpa desimal liar.
  * Rekapitulasi Pajak PPN (11%), PPh 22 (1.5%), dan PPh 23 (2.0%) terintegrasi otomatis dari bukti kwitansi.

- **Penyelarasan Progres & Upah**:
  * Monitoring progres fisik mingguan berbasis kurva-S dan AHSP riil.
  * Manajemen upah harian & borongan terhubung ke daftar hadir mingguan dan kwitansi upah.
  * Penyelarasan realisasi pembelanjaan dengan bobot fisik berjalan untuk mencegah saldo kas minus.

- **Penyimpanan Tahan Banting**:
  * Penyimpanan lokal offline-first dengan sinkronisasi Firebase Firestore otomatis.
  * Antrean coba ulang (*exponential backoff*) saat jaringan offline atau terganggu.
  * Deteksi konflik multi-perangkat (*revision vector clock*) dan dialog rekonsiliasi.

---

## Struktur Teknologi

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend & Server**: Node.js, Express (API Proxy & Static Serving)
- **Database & Keamanan**: Firebase Firestore, Firebase Authentication, Web Crypto API
- **Pengujian**: Node.js Native Test Runner (`node --test`), `@firebase/rules-unit-testing`

---

## Panduan Instalasi & Pengaturan Lingkungan

### 1. Prasyarat
- Node.js versi 20 atau yang lebih baru
- npm versi 10 atau yang lebih baru

### 2. Kloning & Instalasi Dependensi
```bash
git clone <repository-url>
cd lpj-revitalisasi-applet
npm install
```

### 3. Pengaturan Variabel Lingkungan (`.env`)
Salin berkas contoh konfigurasi lingkungan:
```bash
cp .env.example .env
```

Isi parameter Firebase sesuai proyek Anda (opsional jika menggunakan Emulator):
```env
APP_URL="http://localhost:3000"
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-app.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"
```
*Catatan: Aplikasi ini murni memproses kalkulasi keuangan dan pembukuan resmi, tidak membutuhkan `GEMINI_API_KEY`.*

---

## Menjalankan Firebase Emulator Suite

Untuk pengujian lokal tanpa menyentuh database cloud produksi:
1. Pastikan Firebase CLI terpasang:
   ```bash
   npm install -g firebase-tools
   ```
2. Jalankan emulator Firestore dan Auth:
   ```bash
   firebase emulators:start --only firestore,auth
   ```
   Emulator UI akan dapat diakses di `http://localhost:4000`, dan port Firestore di `localhost:8080`.

---

## Menjalankan Aplikasi & Skrip Tersedia

- **Mode Pengembangan (Dev)**:
  ```bash
  npm run dev
  ```
  Aplikasi berjalan di `http://localhost:3000`.

- **Pemeriksaan Tipe TypeScript**:
  ```bash
  npm run lint
  ```

- **Menjalankan Pengujian Unit Otomatis**:
  ```bash
  npm test
  ```
  Menjalankan seluruh rangkaian tes: `tests/storage.test.ts` dan `tests/money.test.ts`.

- **Membangun untuk Produksi (Build)**:
  ```bash
  npm run build
  ```
  Menghasilkan *bundle* Vite di `dist/` dan berkas server di `server.js`.

- **Menjalankan Server Produksi**:
  ```bash
  npm start
  ```
  Menjalankan `node server.js` pada port 3000.

---

## Lisensi & Kepatuhan Regulasi
Aplikasi ini dikembangkan untuk memfasilitasi pelaporan dana bantuan revitalisasi sekolah yang akuntabel, transparan, dan bebas anomali perhitungan sesuai peraturan perundang-undangan RI.
