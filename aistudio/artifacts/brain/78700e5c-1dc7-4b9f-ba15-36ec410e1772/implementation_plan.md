# Rencana Implementation & Refactoring Bertahap (Safe Step-by-Step Refactoring Plan)

Rencana refactoring bertahap untuk menjaga stabilitas dan kualitas aplikasi LPJ Revitalisasi Sekolah. Setiap langkah diselesaikan dalam commit terisolasi dan diverifikasi dengan `npm run lint`, `npm test`, serta `compile_applet`.

---

## Progress Ringkasan Langkah Refactoring

- [x] **Langkah 0: Setup Repositori Git & CI Workflow**:
  - Konfigurasi `.gitignore` untuk `.aistudio/` dan `server.js`.
  - Penambahan GitHub Actions CI pipeline (`.github/workflows/ci.yml`).
  - Pembaruan `package.json` (`start: "node server.js"`).
  - Pembaruan `README.md` (instruksi setup Firebase, emulator, tanpa `GEMINI_API_KEY`).
  - *Status*: **SELESAI** (Commit: `3a95db0`)

- [x] **Langkah 1: Notifikasi Terpusat (ToastProvider & Confirm Dialog)**:
  - Pembuatan `ToastContext.tsx` untuk mengelola toast melayang & dialog konfirmasi modern.
  - Penggantian `window.alert()` dan puluhan `setTimeout` manual di `App.tsx` dengan `useToast()`.
  - *Status*: **SELESAI** (Commit: `14d995b`)

- [ ] **Langkah 2: Pemecahan Service Generator (`autoGeneratorService.ts` -> Modul Sub-Domain)**:
  - Pecah file 6.8k baris menjadi modul terstruktur di `src/services/generator/`:
    1. `kwitansiGenerator.ts`
    2. `bkuGenerator.ts`
    3. `taxGenerator.ts`
    4. `wageGenerator.ts`
    5. `splitTransactionService.ts`
  - Ekspor re-export di `autoGeneratorService.ts` untuk menjaga backward compatibility penuh.

- [ ] **Langkah 3: Pemecahan Komponen UI Besar**:
  - `WeeklyProgressManager.tsx` (4k baris) -> Sub-komponen per tab (Foto, S-Curve, Kurva Fisik, Form Harian).
  - `PrintDocumentViewer.tsx` (3k baris) -> Sub-komponen dokumen per jenis (SPB, Kwitansi, BKU, Berita Acara).
  - `App.tsx` (2.7k baris) -> Pemindahan state & aksi ke Store/Context ringan (`AppContext` & `useSchoolStore`).

- [ ] **Langkah 4: Peningkatan Kualitas Tipe TypeScript & Strict Mode**:
  - Eliminasi penggunaan `any` secara menyeluruh di `types/index.ts`, `services/`, dan `components/`.
  - Verifikasi kelulusan `tsc --noEmit` secara bersih.

- [ ] **Langkah 5: Performa & Lazy Loading**:
  - Code splitting dengan `React.lazy` + `Suspense` untuk tab-tab utama.
  - Dynamic import `import('xlsx')` dan `import('jspdf')` / `import('html2canvas')` hanya saat tombol Cetak/Ekspor diklik.

- [ ] **Langkah 6: Fitur Backup / Restore Terjadwal Terenkripsi**:
  - Dukungan ekspor terenkripsi (AES-256 / PBKDF2) per sekolah dengan jadwal pengingat.
  - Tes unit pemulihan (*restore test*) pada `tests/storage.test.ts`.

---

## Verifikasi & Kualitas

Setiap commit dipastikan lulus:
1. `npm run lint` (`tsc --noEmit`)
2. `npm test` (`node --test tests/storage.test.ts tests/money.test.ts`)
3. `compile_applet`
