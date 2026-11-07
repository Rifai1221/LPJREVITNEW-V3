import { describe, it } from 'node:test';
import assert from 'node:assert';
import XLSX from 'xlsx';
import { parseRealDataExcelFile } from '../src/utils/excelHelper';
import { defaultRealSchoolData } from '../src/data/realSchoolData';
import { generateUnifiedCashLedger } from '../src/services/cashEngine';
import { validateCashLedgerInvariants } from '../src/utils/reconciliationValidator';
import { generateMonthlyManagementTransactions } from '../src/services/generator/batchGenerator';
import { resolveAhsp } from '../src/utils/ahspHelper';

describe('TAHAP 7: E2E Excel Import Pipeline & Full Cash Ledger Generation', () => {

  it('1. Imports Excel file via parseRealDataExcelFile, links RAB to AHSP, runs full generator (14 weeks)', async () => {
    // Construct Excel workbook matching Template_RAB-AHSP.xlsx structure
    const wb = XLSX.utils.book_new();

    // Sheet 1: Identitas_Sekolah
    const identitasRows = [
      ['Nama Sekolah', 'Satuan Pendidikan', 'Kegiatan', 'Lokasi', 'Kab/Kota', 'Provinsi', 'Tahun Anggaran', 'Luas Bangunan (m2)'],
      ['TK NURIADEEN CENDEKIA', 'TK', 'LPJ Revitalisasi TK Nuriadeen', 'Bogor', 'Kab. Bogor', 'Jawa Barat', '2026', 128],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(identitasRows), 'Identitas_Sekolah');

    // Sheet 2: Rekapitulasi_dan_RAB
    const rabRows: any[][] = [
      ['Kode Divisi', 'Uraian Divisi / Pekerjaan', 'Volume', 'Satuan', 'Harga Satuan (Rp)', 'Kategori Biaya'],
    ];

    defaultRealSchoolData.divisions.forEach((div) => {
      // Division header row
      rabRows.push([div.kode, div.uraian, '', '', '', '']);
      div.items.forEach((it) => {
        rabRows.push([div.kode, it.uraian, it.volume, it.satuan, it.hargaSatuan, it.kategoriBiaya || 'BAHAN']);
      });
    });

    // Append pagu row L97 style
    rabRows.push(['', 'TOTAL PEKERJAAN & PAGU ANGGARAN', '', '', 552457000, '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rabRows), 'Rekapitulasi_dan_RAB');

    // Sheet 3: AHSP_Analisa_Harga_Satuan
    const ahspRows: any[][] = [
      ['Kode Pekerjaan AHSP', 'Nama Pekerjaan AHSP', 'Satuan AHSP', 'Kategori Komponen', 'Uraian Komponen', 'Koefisien', 'Satuan Komponen', 'Harga Satuan Komponen (Rp)'],
    ];

    (defaultRealSchoolData.ahspList || []).forEach((ah) => {
      if (ah.komponen && ah.komponen.length > 0) {
        ah.komponen.forEach((k) => {
          ahspRows.push([ah.kodePekerjaan, ah.namaPekerjaan, ah.satuan, k.kategori, k.uraian, k.koefisien, k.satuan, k.hargaSatuan]);
        });
      } else {
        ahspRows.push([ah.kodePekerjaan, ah.namaPekerjaan, ah.satuan, '', '', '', '', '']);
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ahspRows), 'AHSP_Analisa_Harga_Satuan');

    // Convert workbook to Buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Mock File object for parseRealDataExcelFile
    const fileObj = {
      name: 'Template_RAB-AHSP.xlsx',
      arrayBuffer: async () => excelBuffer.buffer.slice(excelBuffer.byteOffset, excelBuffer.byteOffset + excelBuffer.byteLength),
    } as unknown as File;

    // Parse via parseRealDataExcelFile
    const parseResult = await parseRealDataExcelFile(fileObj);
    assert.strictEqual(parseResult.success, true, 'Excel parsing must succeed');
    assert.ok(parseResult.data, 'Parsed data must exist');

    const parsedData = parseResult.data!;
    assert.strictEqual(parsedData.divisions?.length, 13, 'Must have 13 divisions after import');

    const totalRab = (parsedData.divisions || []).reduce((s, d) => s + (d.subTotal || 0), 0);
    assert.strictEqual(totalRab, 552457000, 'Total RAB must be Rp 552.457.000');

    // Run Full 14-Week Generator Pipeline
    const school: any = {
      namaSekolah: 'TK NURIADEEN CENDEKIA',
      tahunAnggaran: '2026',
      totalAnggaran: 552457000,
      termin1Persen: 70,
      termin2Persen: 30,
      termin1Nilai: 386719900,
      termin2Nilai: 165737100,
      kabKota: 'Kabupaten Bogor',
      namaBendahara: 'Bendahara P2SP',
      namaKepalaSekolah: 'Kepala Sekolah',
    };

    const weeksToUse: any[] = Array.from({ length: 14 }, (_, idx) => {
      const wNum = idx + 1;
      const bobot = Math.round((wNum / 14) * 100);
      return {
        mingguKe: wNum,
        bulan: wNum <= 4 ? 'Juli 2026' : wNum <= 8 ? 'Agustus 2026' : wNum <= 12 ? 'September 2026' : 'Oktober 2026',
        bobotRealisasi: bobot,
        divisions: parsedData.divisions?.map((d) => ({
          ...d,
          prestasiMingguIni: d.bobotPersen ? d.bobotPersen / 14 : 0.5,
          prestasiSdMingguIni: d.bobotPersen ? (d.bobotPersen * wNum) / 14 : 0.5 * wNum,
        })),
      };
    });

    const mgtRes = generateMonthlyManagementTransactions({
      weeksToUse,
      activeWeeks: weeksToUse,
      school,
      realSchoolData: parsedData as any,
    });

    const kwitansiList = mgtRes.managementKwitansi;

    // Run unified cashEngine
    const ledger = generateUnifiedCashLedger({
      kwitansiList,
      school,
      progressWeeks: weeksToUse,
      bkuWeekLimit: 14,
    });

    // Assertions required by TAHAP 7:
    // a) No negative balance on any date
    const negativeBku = ledger.bkuList.find((b) => (b.saldo || 0) < 0);
    assert.strictEqual(negativeBku, undefined, 'BKU balance must never be negative');

    const negativeBkt = ledger.bktList.find((b) => (b.saldo || 0) < 0);
    assert.strictEqual(negativeBkt, undefined, 'BKT balance must never be negative');

    const negativeBkb = ledger.bkbList.find((b) => (b.saldo || 0) < 0);
    assert.strictEqual(negativeBkb, undefined, 'BKB balance must never be negative');

    // b) Invariant check: BKU = BKB + BKT on every date
    const invReport = validateCashLedgerInvariants(ledger.bkuList, ledger.bkbList, ledger.bktList, kwitansiList);
    assert.strictEqual(invReport.isSatisfied, true, `Invariants must hold: ${invReport.violations.join('; ')}`);

    // c) Exactly 1 receipt = 1 BKU row = 1 BKT row (for cash receipts)
    kwitansiList.forEach((kw) => {
      if (kw.metodeBayar !== 'BANK') {
        const matchingBku = ledger.bkuList.filter((b) => b.kwitansiIdRef === kw.id || b.noBukti === kw.noBukti);
        const matchingBkt = ledger.bktList.filter((b) => b.kwitansiIdRef === kw.id || b.noBukti === kw.noBukti);

        assert.strictEqual(matchingBku.length, 1, `Receipt ${kw.noBukti} must have exactly 1 BKU row`);
        assert.strictEqual(matchingBkt.length, 1, `Receipt ${kw.noBukti} must have exactly 1 BKT row`);
        assert.strictEqual(matchingBku[0].pengeluaran, kw.nominal, 'BKU nominal must match receipt nominal');
        assert.strictEqual(matchingBkt[0].pengeluaran, kw.nominal, 'BKT nominal must match receipt nominal');
      }
    });

    // d) Consultant fees match RAB budget in Excel
    const consultantItems = (parsedData.divisions || []).flatMap((d) => d.items).filter((it) =>
      it.kategoriBiaya === 'PERENCANA' || it.kategoriBiaya === 'PENGAWAS' || it.kategoriBiaya === 'PENGELOLA' ||
      /perencana|pengawas|pengelola|administrasi/i.test(it.uraian)
    );
    const consultantRabTotal = consultantItems.reduce((s, it) => s + (it.jumlah || 0), 0);
    const consultantKwTotal = kwitansiList
      .filter((k) => k.tipe === 'KONSULTAN' || k.tipe === 'OPERASIONAL' || /KONS|ADM/i.test(k.noBukti))
      .reduce((s, k) => s + k.nominal, 0);

    assert.strictEqual(consultantKwTotal, consultantRabTotal, 'Consultant receipts must equal consultant RAB budget');

    // e) Total Upah = SUM(koefisien upah * harga upah) AHSP * volume
    const allRabItems = (parsedData.divisions || []).flatMap((d) => d.items);
    let totalCalculatedAhspUpah = 0;

    allRabItems.forEach((it) => {
      const ahsp = resolveAhsp(it, parsedData.ahspList);
      if (ahsp) {
        const upahComps = ahsp.komponen.filter((c) => c.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(c.uraian));
        const upahSatuanAHSP = upahComps.reduce((s, c) => s + Math.round((c.koefisien || 0) * (c.hargaSatuan || 0)), 0);
        totalCalculatedAhspUpah += Math.round(it.volume * upahSatuanAHSP);
      }
    });

    assert.ok(totalCalculatedAhspUpah > 0, 'Total AHSP labor must be greater than 0');
  });
});
