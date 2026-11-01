import fs from 'fs';
import { validateFinancialReconciliation } from '../src/utils/reconciliationValidator';
import { calculateBkuFromTransactions } from '../src/services/generator/bkuGenerator';
import { syncBkbFromBku, calculateIntegratedBkt } from '../src/services/cashLedgerIntegrationService';

const args = process.argv.slice(2);
const filePath = args[0];

if (!filePath) {
  console.error('Usage: npm run audit:school <path_to_school_backup.json>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found at ${filePath}`);
  process.exit(1);
}

try {
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const appState = JSON.parse(rawData);

  console.log(`\n========================================`);
  console.log(`🔍 AUDITING SCHOOL BACKUP: ${filePath}`);
  console.log(`========================================`);

  const school = appState.school || {};
  const kwitansiList = appState.kwitansiList || [];
  const wageReports = appState.wageReports || [];
  const progressWeeks = appState.progressWeeks || [];
  const taxRecords = appState.taxRecords || [];
  const stores = appState.stores || [];

  const bkuList = calculateBkuFromTransactions(kwitansiList, school, [], progressWeeks, [], wageReports);
  const bkbList = syncBkbFromBku(bkuList, school, progressWeeks, kwitansiList);
  const bktList = calculateIntegratedBkt(bkuList, bkbList, kwitansiList, school, progressWeeks);

  const report = validateFinancialReconciliation(appState, bkuList, bktList, bkbList, taxRecords);

  console.log(`School Name: ${school.namaSekolah || 'N/A'}`);
  console.log(`Total Budget: Rp ${(school.totalAnggaran || 0).toLocaleString('id-ID')}`);
  console.log(`BKU Balance: Rp ${report.totals.bkuBalance.toLocaleString('id-ID')}`);
  console.log(`BKB Balance: Rp ${report.totals.bkbBalance.toLocaleString('id-ID')}`);
  console.log(`BKT Balance: Rp ${report.totals.bktBalance.toLocaleString('id-ID')}`);
  console.log(`----------------------------------------`);
  console.log(`Reconciliation Status: ${report.isValid ? '✅ LULUS (PASS)' : '❌ GAGAL (FAIL)'}`);

  if (report.alerts.length > 0) {
    console.log(`\nFound ${report.alerts.length} Invariant Violations / Alerts:`);
    report.alerts.forEach((alert, idx) => {
      console.log(`  [${idx + 1}] [${alert.severity}] ${alert.title}`);
      console.log(`      ${alert.description}`);
    });
    process.exit(1);
  } else {
    console.log(`✅ All financial invariants and reconciliation checks passed with zero errors!`);
    process.exit(0);
  }
} catch (err: any) {
  console.error(`❌ Audit execution failed:`, err.message);
  process.exit(1);
}
