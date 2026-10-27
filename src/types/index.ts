export interface SchoolMasterData {
  namaSekolah: string;
  npsn: string;
  alamat: string;
  desa: string;
  kecamatan: string;
  kabKota: string;
  provinsi: string;
  tahunAnggaran: string;
  program: string;
  pekerjaan: string;
  lokasi: string;
  dinasPendidikan: string;
  periodePenggunaan: string;
  totalAnggaran: number;
  termin1Persen: number;
  termin2Persen: number;
  termin1Nilai: number;
  termin2Nilai: number;
  // Keamanan & Dual Login
  pinAkses?: string;
  // Kop Surat & Visual Identity Logos
  logoLeftUrl?: string;
  logoRightUrl?: string;
  logoHeightPx?: number; // 52 | 65 | 78
  headerPemerintahText?: string;
  cabangDinas?: string;
  kopAlamatText?: string;
  kopKontakText?: string;
  teleponSekolah?: string;
  emailSekolah?: string;
  websiteSekolah?: string;
  kodePos?: string;
  // SK Tim Teknis
  nomorSkTimTeknis?: string;
  tanggalSkTimTeknis?: string;
  alamatPerencana?: string;
  pendidikanPerencana?: string;
  kriteriaPerencana?: string;
  alamatPengawas?: string;
  pendidikanPengawas?: string;
  kriteriaPengawas?: string;
  // Signatures & SK P2SP
  namaKepalaSekolah: string;
  nipKepalaSekolah: string;
  jabatanKepalaSekolah?: string;
  hpKepalaSekolah?: string;
  nomorSkP2SP?: string;
  tanggalSkP2SP?: string;
  tentangSkP2SP?: string;
  namaKetuaP2SP: string;
  nipKetuaP2SP?: string;
  jabatanKetuaP2SP?: string;
  unsurKetuaP2SP?: string;
  hpKetuaP2SP?: string;
  namaSekretaris?: string;
  nipSekretaris?: string;
  jabatanSekretaris?: string;
  hpSekretaris?: string;
  namaBendahara: string;
  nipBendahara: string;
  jabatanBendahara?: string;
  hpBendahara?: string;
  namaPerencana: string;
  nipPerencana?: string;
  jabatanPerencana?: string;
  anggotaPerencana?: string;
  hpPerencana?: string;
  namaPengawas: string;
  nipPengawas?: string;
  jabatanPengawas?: string;
  anggotaPengawas?: string;
  hpPengawas?: string;
  namaPelaksana: string;
  namaKepalaPelaksana?: string;
  nipPelaksana?: string;
  jabatanPelaksana?: string;
  hpPelaksana?: string;
  namaLogistik?: string;
  namaMandor?: string;
  namaKeamanan?: string;
  nipKeamanan?: string;
  jabatanKeamanan?: string;
  hpKeamanan?: string;
  namaFasilitator?: string;
  nipFasilitator?: string;
  jabatanFasilitator?: string;
  hpFasilitator?: string;
  // Bank Info
  namaBank: string;
  nomorRekening: string;
  namaRekening: string;
  kotaTempatBintek: string;
  tanggalBintek: string;
}

export type RpdKategori =
  | 'GAJI_REHAB'
  | 'GAJI_BARU'
  | 'PERSIAPAN'
  | 'BAHAN_REHAB'
  | 'BAHAN_BARU'
  | 'PERABOT'
  | 'KONSULTAN_ADM';

export interface RpdItem {
  id: string;
  no: number;
  kategori: RpdKategori;
  uraian: string;
  volume100: number;
  volumeTermin1: number;
  satuan: string;
  volumeTermin2: number;
  hargaSatuan: number;
  jumlahTermin1: number;
  jumlahTermin2: number;
  jumlahAnggaran: number;
  defaultToko?: string;
  pajakType?: 'NON_PAJAK' | 'PPN_PPH22' | 'PPH23' | 'PPH21';
  isBarangPabrikasi?: boolean;
}

export interface WorkerItem {
  id: string;
  nama: string;
  jenisKelamin: 'L' | 'P';
  domisili: 'Dalam Desa' | 'Luar Desa';
  peran: string; // 'KT' | 'T' | 'P' or custom job titles e.g. 'Mandor', 'Tukang Cat', 'Tukang Besi', 'Operator Alat'
  peranLabel?: string; // Custom label description
  upahHarian: number;
  kategoriPenugasan?: 'SEMUA' | 'HARIAN' | 'BORONGAN';
}

export interface StoreVendor {
  id: string;
  namaToko: string;
  pemilikNama: string;
  pekerjaan?: string; // e.g. 'Pemilik Toko', 'Direktur CV', 'Penyedia Bahan', 'Perencana Teknis', 'Pengawas Lapangan', 'Pengelola SPJ', 'Percetakan'
  alamat: string;
  telepon?: string;
  npwp?: string;
  kategori: 'MATERIAL' | 'PINTU_JENDELA_ALUMINIUM' | 'PERABOT' | 'PERENCANA' | 'PENGAWAS' | 'OPERASIONAL' | 'K3' | 'KONSULTAN' | 'SIPLAH' | 'PERCETAKAN' | 'PENGELOLA_SPJ' | 'UMUM';
  isSiplah?: boolean;
  mitraSiplah?: string; // e.g. 'SipLah Blibli', 'SipLah Telkom', 'SipLah Eureka', 'SipLah Tokoko'
  noMitraSiplah?: string;
}

export interface WeeklyAttendance {
  workerId: string;
  nama: string;
  jenisKelamin: 'L' | 'P';
  domisili: 'Dalam Desa' | 'Luar Desa';
  peran: string; // 'KT' | 'T' | 'P' or custom
  peranLabel?: string;
  days: [number, number, number, number, number, number, number]; // 1 or 0
  hok: number;
  upahHarian: number;
  totalUpah: number;
}

export interface WeeklyWageReport {
  id: string;
  mingguKe: number;
  bulan: string; // e.g. 'Oktober 2025'
  periodeStart: string; // e.g. '20 Oktober 2025'
  periodeEnd: string; // e.g. '26 Oktober 2025'
  tanggalKwitansi: string; // e.g. '26 Oktober 2025'
  noBuktiKwitansi: string; // e.g. 'UK/03/2025'
  penerimaNama: string; // e.g. 'Budiman'
  penerimaJabatan: string; // e.g. 'Kepala Tukang'
  attendance: WeeklyAttendance[];
  totalUpah: number;
  bobotMingguIni?: number; // %
  bobotKumulatif?: number; // %
  // Mode Borongan fields
  tipeUpah?: 'HARIAN_HOK' | 'BORONGAN';
  boronganType?: 'MINGGUAN' | 'BULANAN' | 'RENTANG_WAKTU';
  boronganUraian?: string;
  boronganVolume?: number;
  boronganSatuan?: string;
  boronganHargaSatuan?: number;
  boronganNoSpk?: string;
  boronganAnggotaKelompok?: string[];
  boronganAttendance?: WeeklyAttendance[];
  boronganTotalUpah?: number;
}

export interface TokoItem {
  namaBarang: string;
  volume: number;
  satuan: string;
  hargaSatuan: number;
  jumlah: number;
  isBarangPabrikasi?: boolean;
  tag?: string;
  // Solusi 2: Penanda Tagging / Tautan Item RAB (Item Linking)
  rabItemIdRef?: string;
  rabItemName?: string;
  rabDivisionKode?: string;
  isManualDibelanjakan?: boolean;
}

export interface KwitansiDocument {
  id: string;
  noBukti: string; // e.g. '01/1MD/2025', 'UK/01/2025', or 'Fur/01/2026'
  tipe: 'MATERIAL' | 'UPAH' | 'KONSULTAN' | 'PERABOT' | 'OPERASIONAL' | 'SMKK' | 'PINTU_JENDELA' | 'CETAK';
  tanggal: string; // e.g. '18/10/2025'
  tanggalFormatted: string; // e.g. '18 Oktober 2025'
  bulan: string; // e.g. 'Oktober 2025'
  uraian: string;
  penerimaNama: string;
  penerimaPekerjaan: string; // e.g. 'Pemilik Toko DEXA PRINTING', 'Perencana', 'Kepala Tukang'
  penerimaAlamat: string;
  namaToko?: string;
  items: TokoItem[];
  nominal: number;
  // Tax details
  isPpn: boolean;
  isPph22: boolean;
  isPph23: boolean;
  ppnAmount: number; // 11%
  pph22Amount: number; // 1.5%
  pph23Amount: number; // 2% / 4%
  kategoriBiayaPajak?: 'Konstruksi' | 'Perabot' | 'Peralatan' | 'Perencanaan_Pengelolaan' | 'Siplah' | 'Percetakan';
  // SPB details
  noSpb?: string;
  keteranganSpb?: string;
  mingguKeRef?: number;
  isManual?: boolean;
  isLocked?: boolean;
  isManualDate?: boolean;
  linkedRabDivisions?: string[];
  linkedRabItemIds?: string[];
  metodeBayar?: 'TUNAI' | 'BANK';
}

export interface BkuTransaction {
  id: string;
  tanggal: string; // '18/10/2025'
  tanggalObj: string; // '2025-10-18' for sorting
  bulan: string; // 'Oktober 2025'
  jenis: 'PENERIMAAN' | 'PENGELUARAN';
  uraian: string;
  noBukti: string;
  penerimaan: number;
  pengeluaran: number;
  saldo?: number;
  kategoriBiaya?: string;
  kwitansiIdRef?: string;
  metodeBayar?: 'TUNAI' | 'BANK' | 'MUTASI_KAS';
  isManual?: boolean;
  isLocked?: boolean;
  isManualDate?: boolean;
}

export interface BktTransaction {
  id: string;
  tanggal: string;
  tanggalObj: string;
  bulan: string;
  uraian: string;
  noBukti: string;
  pemasukan: number; // Debet
  pengeluaran: number; // Kredit
  saldo?: number;
  kategoriBiaya?: string;
  kwitansiIdRef?: string;
  metodeBayar?: 'TUNAI' | 'BANK' | 'MUTASI_KAS';
  isManual?: boolean;
  isLocked?: boolean;
  isManualDate?: boolean;
}

export interface BkbTransaction {
  id: string;
  tanggal: string;
  tanggalObj: string;
  bulan: string;
  uraian: string;
  noBukti: string;
  penerimaan: number; // Debit
  pengeluaran: number; // Kredit
  saldo?: number;
  kategoriBiaya?: string;
  kategori?: string;
  kwitansiIdRef?: string;
  metodeBayar?: 'TUNAI' | 'BANK' | 'MUTASI_KAS';
}

export interface TaxRecord {
  id: string;
  noUrut: number;
  noBukti: string;
  tanggal: string;
  bulan: string;
  keperluan: string;
  nominalKonstruksi: number;
  nominalPerabot: number;
  nominalPeralatan: number;
  nominalKonsultanAdm: number;
  ppn11: number;
  pph22: number;
  pph23: number;
  totalPajak: number;
  isManual?: boolean;
  kwitansiIdRef?: string;
  ntpn?: string;
  tanggalSetor?: string;
  kategori?: 'Konstruksi' | 'Perabot' | 'Peralatan' | 'Perencanaan_Pengelolaan';
  statusSetor?: 'LUNAS' | 'BELUM_SETOR';
  namaToko?: string;
  penerimaNama?: string;
}

export interface DivisionProgressItem {
  id: string;
  kode: string; // I, II, III, etc.
  kategori: 'FISIK' | 'MANAJEMEN';
  uraian: string;
  bobotTotal: number; // e.g. 2.66
  prestasiMingguLalu: number;
  prestasiMingguIni: number;
  prestasiSdMingguIni: number;
  materialRef?: string[]; // item IDs or keywords from RPD
  isManualMingguLalu?: boolean; // true if manually overridden by user
}

export interface ProgressPhotoItem {
  id: string;
  url: string; // base64 or image url
  caption: string; // e.g. "Pekerjaan Pengecoran Kolom Praktis"
  tanggal?: string; // date of photo
  persentase?: number; // optional progress percentage at time of photo
}

export interface ProjectProgressWeek {
  mingguKe: number;
  periode: string;
  startDate?: string; // ISO date 'YYYY-MM-DD'
  endDate?: string; // ISO date 'YYYY-MM-DD'
  bobotRencana: number;
  bobotRealisasi: number;
  deviasi: number;
  keterangan: string;
  itemPekerjaan: string[];
  rencanaWaktuHK?: number; // e.g. 98 HK
  rencanaWaktuMinggu?: number; // e.g. 14 Minggu
  waktuTerlaksanaHK?: number; // e.g. 7 HK
  waktuTerlaksanaMinggu?: number; // e.g. 1 Minggu
  sisaWaktuHK?: number; // e.g. 91 HK
  sisaWaktuMinggu?: number; // e.g. 13 Minggu
  divisions?: DivisionProgressItem[];
  photos?: ProgressPhotoItem[];
  customTotalMingguLalu?: number; // optional manual override for TOTAL Prestasi Minggu Lalu
  customTotalMingguIni?: number;  // optional manual override for TOTAL Prestasi Minggu Ini
  customTotalSdMingguIni?: number; // optional manual override for TOTAL Prestasi s.d Minggu Ini
}

export interface RabSubItem {
  id: string;
  kode?: string;
  uraian: string;
  volume: number;
  satuan: string;
  hargaSatuan: number;
  jumlah: number;
  kategoriBiaya?: 'BAHAN' | 'UPAH' | 'ALAT' | 'SMKK' | 'UPAH_BAHAN' | 'PINTU_JENDELA' | 'CETAK' | 'SIPLAH' | 'PERENCANA' | 'PENGAWAS' | 'PENGELOLA' | 'LAINNYA';
  ahspIdRef?: string;
  statusBelanja?: 'DIBELANJAKAN' | 'DIALIHKAN' | 'SUDAH_DIBELANJAKAN_MANDIRI';
  targetReallokasi?: 'PROPORSIONAL_BAHAN' | 'UPAH' | 'SPESIFIK';
  targetItemId?: string;
  alasanPengalihan?: string;
  isBarangPabrikasi?: boolean;
  tags?: string[];
  allocationSplit?: AllocationSplit;
}

export interface AllocationSplit {
  materialValue: number;
  laborValue: number;
  isConfirmed: boolean;
}

export interface RabDivision {
  id: string;
  kode: string; // I, II, III, ... XII
  uraian: string;
  subTotal: number;
  bobotPersen: number; // calculated or manual
  items: RabSubItem[];
}

export interface AhspKomponen {
  id: string;
  kategori: 'BAHAN' | 'UPAH' | 'ALAT' | 'PINTU_JENDELA' | 'CETAK' | 'SMKK' | 'SIPLAH';
  uraian: string;
  koefisien: number;
  satuan: string;
  hargaSatuan: number;
  totalHarga: number;
  tag?: string;
}

export interface AhspItem {
  id: string;
  kodePekerjaan: string;
  namaPekerjaan: string;
  satuan: string;
  totalHargaSatuan: number;
  komponen: AhspKomponen[];
}

export interface RealSchoolData {
  namaSekolah: string;
  satuanPendidikan: string;
  kegiatan: string;
  lokasi: string;
  kabKota: string;
  provinsi: string;
  tahunAnggaran: string;
  luasBangunanM2: number;
  biayaPerM2: number;
  paguAnggaran?: number;
  totalNilaiRab: number;
  divisions: RabDivision[];
  ahspList?: AhspItem[];
}

export interface AppStateData {
  school: SchoolMasterData;
  rpdItems: RpdItem[];
  workers: WorkerItem[];
  stores?: StoreVendor[];
  progressWeeks: ProjectProgressWeek[];
  kwitansiList: KwitansiDocument[];
  wageReports: WeeklyWageReport[];
  bkbRecords: BkbTransaction[];
  manualBkuTransactions: BkuTransaction[];
  deletedBkuIds?: string[];
  deletedKwitansiIds?: string[];
  manualTaxRecords?: TaxRecord[];
  deletedTaxIds?: string[];
  realSchoolData?: RealSchoolData;
}

export interface TransactionFilterOptions {
  filterMode: 'ALL' | 'MONTH' | 'WEEK' | 'CUSTOM';
  month?: string;
  weekNum?: number;
  startDate?: string;
  endDate?: string;
  label?: string;
}
