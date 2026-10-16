export function formatRupiah(amount: number | null | undefined, withPrefix = true): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return withPrefix ? 'Rp 0,00' : '0,00';
  }
  
  // Format with standard Indonesian numbering (dots for thousands, comma for decimals)
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  
  const parts = absAmount.toFixed(2).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimalPart = parts[1];
  
  // If no decimals, we can show ,00 or if exact
  const formatted = decimalPart === '00' ? `${integerPart}` : `${integerPart},${decimalPart}`;
  const sign = isNegative ? '-' : '';
  
  return withPrefix ? `${sign}Rp ${formatted}` : `${sign}${formatted}`;
}

export function formatNumber(val: number | null | undefined, maxDecimals = 2, minDecimals = 0): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return val.toLocaleString('id-ID', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

export function parseIndonesianDate(dateStr: string): Date {
  // Handles format 'DD/MM/YYYY' or 'YYYY-MM-DD' or 'DD MMMM YYYY'
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }
  return new Date(dateStr);
}

export function formatIndonesianDate(date: Date | string): string {
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  
  let d: Date;
  if (typeof date === 'string') {
    if (date.includes('/')) {
      const [day, month, year] = date.split('/');
      d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }
  
  if (isNaN(d.getTime())) return date.toString();
  
  const day = d.getDate();
  const monthName = months[d.getMonth()];
  const year = d.getFullYear();
  
  return `${day} ${monthName} ${year}`;
}

export function toRoman(num: number): string {
  if (!num || num <= 0) return 'I';
  const lookup: { [key: string]: number } = {
    M: 1000, CM: 900, D: 500, CD: 400,
    C: 100, XC: 90, L: 50, XL: 40,
    X: 10, IX: 9, V: 5, IV: 4, I: 1
  };
  let roman = '';
  let n = Math.floor(num);
  for (const i in lookup) {
    while (n >= lookup[i]) {
      roman += i;
      n -= lookup[i];
    }
  }
  return roman || 'I';
}
