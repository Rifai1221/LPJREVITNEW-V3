/**
 * Convert numbers into standard Indonesian "Terbilang" words.
 * Example: 537580794 -> "Lima Ratus Tiga Puluh Tujuh Juta Lima Ratus Delapan Puluh Ribu Tujuh Ratus Sembilan Puluh Empat Rupiah"
 */

const satuan = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
  'Sepuluh',
  'Sebelas',
];

function angkaKeKata(n: number): string {
  if (n < 12) {
    return satuan[n];
  } else if (n < 20) {
    return angkaKeKata(n - 10) + ' Belas';
  } else if (n < 100) {
    return (
      angkaKeKata(Math.floor(n / 10)) +
      ' Puluh ' +
      angkaKeKata(n % 10)
    ).trim();
  } else if (n < 200) {
    return ('Seratus ' + angkaKeKata(n - 100)).trim();
  } else if (n < 1000) {
    return (
      angkaKeKata(Math.floor(n / 100)) +
      ' Ratus ' +
      angkaKeKata(n % 100)
    ).trim();
  } else if (n < 2000) {
    return ('Seribu ' + angkaKeKata(n - 1000)).trim();
  } else if (n < 1000000) {
    return (
      angkaKeKata(Math.floor(n / 1000)) +
      ' Ribu ' +
      angkaKeKata(n % 1000)
    ).trim();
  } else if (n < 1000000000) {
    return (
      angkaKeKata(Math.floor(n / 1000000)) +
      ' Juta ' +
      angkaKeKata(n % 1000000)
    ).trim();
  } else if (n < 1000000000000) {
    return (
      angkaKeKata(Math.floor(n / 1000000000)) +
      ' Miliar ' +
      angkaKeKata(n % 1000000000)
    ).trim();
  } else if (n < 1000000000000000) {
    return (
      angkaKeKata(Math.floor(n / 1000000000000)) +
      ' Triliun ' +
      angkaKeKata(n % 1000000000000)
    ).trim();
  }
  return n.toString();
}

export function terbilangRupiah(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Nol Rupiah';
  
  const absoluteAmount = Math.abs(amount);
  const bulat = Math.floor(absoluteAmount);
  const desimal = Math.round((absoluteAmount - bulat) * 100);

  let hasil = angkaKeKata(bulat).replace(/\s+/g, ' ').trim();
  hasil = hasil + ' Rupiah';

  if (desimal > 0) {
    const desimalKata = angkaKeKata(desimal).replace(/\s+/g, ' ').trim();
    hasil = hasil + ' ' + desimalKata + ' Sen';
  }

  if (amount < 0) {
    hasil = 'Minus ' + hasil;
  }

  return hasil + ',-';
}
