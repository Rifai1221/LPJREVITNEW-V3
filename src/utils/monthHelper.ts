import { SchoolMasterData } from '../types';

const indonesianMonths = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const monthOrderMap: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, feb: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, ags: 8, agt: 8,
  september: 9, sep: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11, nopember: 11, nop: 11,
  desember: 12, des: 12,
};

/**
 * Safely parse 4-digit year from string, falling back to 2026 if empty or invalid
 */
export function sanitizeYear(yearStr?: string | number, fallbackYear = 2026): number {
  if (!yearStr) return fallbackYear;
  const match = String(yearStr).match(/\b(19\d\d|20\d\d)\b/);
  if (match) {
    return parseInt(match[0], 10);
  }
  const parsed = parseInt(String(yearStr).replace(/\D/g, ''), 10);
  if (parsed >= 1900 && parsed <= 2100) return parsed;
  return fallbackYear;
}

/**
 * Safely convert a Date to YYYY-MM-DD ISO string
 */
function safeToIsoDate(d: Date, fallbackIso: string): string {
  if (!d || isNaN(d.getTime())) return fallbackIso;
  try {
    return d.toISOString().split('T')[0];
  } catch {
    return fallbackIso;
  }
}

/**
 * Convert any Indonesian date string (DD/MM/YYYY, YYYY-MM-DD, or DD Bulan YYYY) to YYYY-MM-DD ISO format
 */
export function parseTxDateToIso(dateStr?: string, defaultYear = 2026): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  // Case 1: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  // Case 2: DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Case 3: DD Month YYYY (e.g. 06 Juli 2026)
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 3) {
    const day = parts[0].replace(/\D/g, '').padStart(2, '0');
    const monthName = parts[1].toLowerCase();
    const year = sanitizeYear(parts[2], defaultYear);
    const monthNum = monthOrderMap[monthName] || 7;
    return `${year}-${String(monthNum).padStart(2, '0')}-${day}`;
  }
  return '';
}

/**
 * Dynamically expand range of Indonesian months from a period string like
 * "01 Juli 2026 sampai 31 Oktober 2026" or "Juli - November"
 * strictly anchored to defaultYear (from Data Master Sekolah's tahunAnggaran).
 */
export function expandMonthsFromPeriodeString(periodeStr: string, defaultYear = '2026'): string[] {
  const targetYear = sanitizeYear(defaultYear, 2026);

  if (!periodeStr || typeof periodeStr !== 'string' || periodeStr.trim() === '') {
    // Default fallback: July to November of targetYear
    return [
      `Juli ${targetYear}`,
      `Agustus ${targetYear}`,
      `September ${targetYear}`,
      `Oktober ${targetYear}`,
      `November ${targetYear}`,
    ];
  }

  const monthRegex = /(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|nopember|jan|feb|mar|apr|jun|jul|agu|agt|ags|sep|okt|nov|nop|des)/gi;
  const matches = [...periodeStr.matchAll(monthRegex)];

  if (matches.length === 0) {
    return [
      `Juli ${targetYear}`,
      `Agustus ${targetYear}`,
      `September ${targetYear}`,
      `Oktober ${targetYear}`,
      `November ${targetYear}`,
    ];
  }

  const yearMatches = [...periodeStr.matchAll(/20\d\d/g)];
  let startYear = targetYear;
  let endYear = targetYear;

  if (yearMatches.length >= 2) {
    startYear = sanitizeYear(yearMatches[0][0], targetYear);
    endYear = sanitizeYear(yearMatches[yearMatches.length - 1][0], targetYear);
  } else if (yearMatches.length === 1) {
    startYear = sanitizeYear(yearMatches[0][0], targetYear);
    endYear = startYear;
  }

  // If startYear is less than targetYear (e.g. legacy text in period string), align startYear with targetYear
  if (startYear < targetYear) {
    const diff = targetYear - startYear;
    startYear += diff;
    endYear += diff;
  }

  const startMonthName = matches[0][0].toLowerCase();
  const endMonthName = matches[matches.length - 1][0].toLowerCase();

  const mIdxStart = monthOrderMap[startMonthName] || 7;
  let mIdxEnd = monthOrderMap[endMonthName] || mIdxStart;

  // If end month is earlier than start month, spans to next year (e.g. Nov to Feb)
  if (mIdxEnd < mIdxStart && startYear === endYear) {
    endYear = startYear + 1;
  }

  const results: string[] = [];
  let curYear = startYear;
  let curM = mIdxStart;

  while (curYear < endYear || (curYear === endYear && curM <= mIdxEnd)) {
    results.push(`${indonesianMonths[curM - 1]} ${curYear}`);
    curM++;
    if (curM > 12) {
      curM = 1;
      curYear++;
    }
    if (results.length > 24) break; // Safety cap
  }

  return results;
}

/**
 * Parse Indonesian month name and year automatically from period date string (e.g., '20 Jul - 26 Jul 2026' -> 'Juli 2026')
 */
export function getMonthFromPeriodString(periode: string, defaultYear = '2026'): string {
  const safeYear = sanitizeYear(defaultYear, 2026);
  if (!periode) return `Juli ${safeYear}`;

  const lower = periode.toLowerCase();
  
  // Extract year if present
  const yearMatch = periode.match(/20\d\d/);
  const year = yearMatch ? sanitizeYear(yearMatch[0], safeYear) : safeYear;

  // Check month abbreviations / names
  if (lower.includes('jan')) return `Januari ${year}`;
  if (lower.includes('feb')) return `Februari ${year}`;
  if (lower.includes('mar')) return `Maret ${year}`;
  if (lower.includes('apr')) return `April ${year}`;
  if (lower.includes('mei')) return `Mei ${year}`;
  if (lower.includes('jun')) return `Juni ${year}`;
  if (lower.includes('jul')) return `Juli ${year}`;
  if (lower.includes('agu') || lower.includes('agt') || lower.includes('ags')) return `Agustus ${year}`;
  if (lower.includes('sep')) return `September ${year}`;
  if (lower.includes('okt')) return `Oktober ${year}`;
  if (lower.includes('nov') || lower.includes('nop')) return `November ${year}`;
  if (lower.includes('des')) return `Desember ${year}`;

  // Check numeric month if date is formatted like '26/07/2026'
  const dateNumMatch = periode.match(/\d{1,2}\/(\d{1,2})\/20\d\d/);
  if (dateNumMatch && dateNumMatch[1]) {
    const monthIdx = parseInt(dateNumMatch[1], 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${indonesianMonths[monthIdx]} ${year}`;
    }
  }

  return `Juli ${year}`;
}

/**
 * Extract active construction months for a school based on school.periodePenggunaan and school.tahunAnggaran
 * from Data Master Sekolah.
 */
export function getAvailableMonthsForSchool(
  school?: SchoolMasterData,
  lists?: Array<{ bulan?: string }[] | undefined>
): string[] {
  const monthSet = new Set<string>();
  const schoolYear = String(sanitizeYear(school?.tahunAnggaran, 2026));

  // 1. First Priority: Extract months from school.periodePenggunaan and school.tahunAnggaran
  if (school?.periodePenggunaan) {
    const expanded = expandMonthsFromPeriodeString(school.periodePenggunaan, schoolYear);
    expanded.forEach((m) => monthSet.add(m));
  }

  // 2. Second Priority: Collect months from all provided transaction lists
  if (lists) {
    lists.forEach((list) => {
      if (Array.isArray(list)) {
        list.forEach((item) => {
          if (item && item.bulan && typeof item.bulan === 'string' && item.bulan.trim() !== '') {
            monthSet.add(item.bulan.trim());
          }
        });
      }
    });
  }

  // If still empty, default fallback based on schoolYear
  if (monthSet.size === 0) {
    const fallbackMonths = expandMonthsFromPeriodeString('', schoolYear);
    fallbackMonths.forEach((m) => monthSet.add(m));
  }

  const monthArray = Array.from(monthSet).sort((a, b) => {
    const parseMonthYear = (str: string) => {
      const parts = str.split(' ');
      const mName = parts[0]?.toLowerCase() || '';
      const year = sanitizeYear(parts[1] || schoolYear, 2026);
      const mIdx = monthOrderMap[mName] || 1;
      return year * 100 + mIdx;
    };
    return parseMonthYear(a) - parseMonthYear(b);
  });

  return ['ALL', ...monthArray];
}

/**
 * Format start and end date ISO strings to standard Indonesian period text (e.g., '06 Jul - 12 Jul 2026')
 */
export function formatWeekPeriodString(startDateIso: string, endDateIso: string): string {
  if (!startDateIso || !endDateIso) return '';
  const sObj = new Date(`${startDateIso}T00:00:00`);
  const eObj = new Date(`${endDateIso}T00:00:00`);
  if (isNaN(sObj.getTime()) || isNaN(eObj.getTime())) return '';

  const sDay = String(sObj.getDate()).padStart(2, '0');
  const eDay = String(eObj.getDate()).padStart(2, '0');
  const shortMonthS = indonesianMonths[sObj.getMonth()]?.substring(0, 3) || 'Jul';
  const shortMonthE = indonesianMonths[eObj.getMonth()]?.substring(0, 3) || 'Jul';
  const eYear = eObj.getFullYear() || 2026;

  return `${sDay} ${shortMonthS} - ${eDay} ${shortMonthE} ${eYear}`;
}

/**
 * Resolve week dates into ISO, Indonesian formatted text, slash formatted dates, and month strings.
 */
export function resolveWeekDates(
  week: { mingguKe: number; periode?: string; startDate?: string; endDate?: string },
  schoolYear = '2026'
): {
  startDate: string;
  endDate: string;
  startDateFormatted: string;
  endDateFormatted: string;
  startDateSlash: string;
  endDateSlash: string;
  bulan: string;
  periodeText: string;
} {
  const yearNum = sanitizeYear(schoolYear, 2026);
  const fallbackStartIso = `${yearNum}-07-06`;
  const fallbackEndIso = `${yearNum}-07-12`;

  let startIso = week.startDate;
  let endIso = week.endDate;

  // Validate startIso if already provided
  if (startIso) {
    const testS = new Date(`${startIso}T00:00:00`);
    if (isNaN(testS.getTime())) {
      startIso = undefined;
    }
  }

  // Validate endIso if already provided
  if (endIso) {
    const testE = new Date(`${endIso}T00:00:00`);
    if (isNaN(testE.getTime())) {
      endIso = undefined;
    }
  }

  if (!startIso) {
    const baseDate = new Date(`${yearNum}-07-01T00:00:00`);
    const sDate = new Date(baseDate.getTime() + (Math.max(1, week.mingguKe || 1) - 1) * 7 * 86400000);
    startIso = safeToIsoDate(sDate, fallbackStartIso);
  }

  if (!endIso) {
    const sDate = new Date(`${startIso}T00:00:00`);
    const eDate = new Date(sDate.getTime() + 6 * 86400000);
    endIso = safeToIsoDate(eDate, fallbackEndIso);
  }

  let sObj = new Date(`${startIso}T00:00:00`);
  let eObj = new Date(`${endIso}T00:00:00`);

  if (isNaN(sObj.getTime())) {
    sObj = new Date(`${fallbackStartIso}T00:00:00`);
    startIso = fallbackStartIso;
  }
  if (isNaN(eObj.getTime())) {
    eObj = new Date(`${fallbackEndIso}T00:00:00`);
    endIso = fallbackEndIso;
  }

  const sDay = String(sObj.getDate()).padStart(2, '0');
  const sMonth = sObj.getMonth();
  const sYear = sObj.getFullYear();

  const eDay = String(eObj.getDate()).padStart(2, '0');
  const eMonth = eObj.getMonth();
  const eYear = eObj.getFullYear();

  const startDateFormatted = `${sDay} ${indonesianMonths[sMonth] || 'Juli'} ${sYear}`;
  const endDateFormatted = `${eDay} ${indonesianMonths[eMonth] || 'Juli'} ${eYear}`;

  const startDateSlash = `${sDay}/${String(sMonth + 1).padStart(2, '0')}/${sYear}`;
  const endDateSlash = `${eDay}/${String(eMonth + 1).padStart(2, '0')}/${eYear}`;

  const bulan = `${indonesianMonths[eMonth] || 'Juli'} ${eYear}`;

  const shortMonthS = (indonesianMonths[sMonth] || 'Juli').substring(0, 3);
  const shortMonthE = (indonesianMonths[eMonth] || 'Juli').substring(0, 3);
  const calculatedPeriode = `${sDay} ${shortMonthS} - ${eDay} ${shortMonthE} ${eYear}`;
  const periodeText = week.startDate && week.endDate ? calculatedPeriode : (week.periode || calculatedPeriode);

  return {
    startDate: startIso,
    endDate: endIso,
    startDateFormatted,
    endDateFormatted,
    startDateSlash,
    endDateSlash,
    bulan,
    periodeText,
  };
}

/**
 * Automatically determine Indonesian Bulan Buku (e.g. 'November 2026') from any date format
 */
export function getBulanFromTanggal(dateStr?: string, defaultYear: string | number = 2026): string {
  if (!dateStr || typeof dateStr !== 'string') return `Juli ${defaultYear}`;
  const trimmed = dateStr.trim();
  const effYear = sanitizeYear(trimmed, Number(defaultYear) || 2026);

  // Case 1: DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [, m] = trimmed.split('/');
    const mNum = parseInt(m, 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${indonesianMonths[mNum - 1]} ${effYear}`;
    }
  }
  // Case 2: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [, m] = trimmed.split('-');
    const mNum = parseInt(m, 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${indonesianMonths[mNum - 1]} ${effYear}`;
    }
  }
  // Case 3: DD Month YYYY (e.g. 25 November 2026 or 25 Nov 2026)
  const monthMatch = trimmed.match(/(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|nopember|desember)/i);
  if (monthMatch) {
    const mName = monthMatch[1].toLowerCase();
    const mNum = monthOrderMap[mName] || 1;
    return `${indonesianMonths[mNum - 1]} ${effYear}`;
  }
  return `Juli ${effYear}`;
}

/**
 * Format a DD/MM/YYYY date string into long Indonesian text (e.g. 25/11/2026 -> '25 November 2026')
 */
export function formatIndonesianDateLong(dateStr?: string, defaultYear: string | number = 2026): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  const effYear = sanitizeYear(trimmed, Number(defaultYear) || 2026);

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m] = trimmed.split('/');
    const dNum = parseInt(d, 10);
    const mNum = parseInt(m, 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${dNum} ${indonesianMonths[mNum - 1]} ${effYear}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [, m, d] = trimmed.split('-');
    const dNum = parseInt(d, 10);
    const mNum = parseInt(m, 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${dNum} ${indonesianMonths[mNum - 1]} ${effYear}`;
    }
  }
  return trimmed;
}

/**
 * Get comprehensive list of monthly billing/accounting periods grouped by year
 */
export function getAllMonthOptions(schoolYear: string | number = 2026): { year: number; months: string[] }[] {
  const y = sanitizeYear(schoolYear, 2026);
  return [
    {
      year: y,
      months: indonesianMonths.map((m) => `${m} ${y}`),
    },
    {
      year: y - 1,
      months: indonesianMonths.map((m) => `${m} ${y - 1}`),
    },
    {
      year: y + 1,
      months: indonesianMonths.map((m) => `${m} ${y + 1}`),
    },
  ];
}

