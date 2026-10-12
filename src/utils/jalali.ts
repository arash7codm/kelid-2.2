/**
 * Persian (Jalali / Shamsi) calendar algorithms & number formatting tools
 */

export const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
export const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toPersianDigits(input: string | number): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[0-9]/g, (w) => PERSIAN_DIGITS[+w]);
}

export function normalizeDigits(input: string): string {
  if (!input) return '';
  let res = input;
  for (let i = 0; i < 10; i++) {
    res = res.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), String(i));
    res = res.replace(new RegExp(ARABIC_DIGITS[i], 'g'), String(i));
  }
  return res.replace(/[\u200B-\u200D\uFEFF]/g, ''); // strip invisible spaces
}

export function formatWithCommas(num: number | string): string {
  if (!num && num !== 0) return '';
  const clean = normalizeDigits(String(num)).replace(/[^0-9]/g, '');
  if (!clean) return '';
  const grouped = clean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return toPersianDigits(grouped);
}

export function parseTomanNumber(str: string): number {
  const clean = normalizeDigits(str).replace(/[^0-9]/g, '');
  return parseInt(clean, 10) || 0;
}

// Gregorian to Jalali converter
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy: number;
  if (gy > 1600) {
    jy = 979;
    gy -= 1600;
  } else {
    jy = 0;
    gy -= 621;
  }
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

// Jalali to Gregorian converter
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number;
  if (jy > 979) {
    gy = 1600;
    jy -= 979;
  } else {
    gy = 621;
  }
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm: number;
  for (gm = 0; gm < 13; gm++) {
    const v = sal_a[gm];
    if (gd <= v) break;
    gd -= v;
  }
  return [gy, gm, gd];
}

export const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const JALALI_WEEKDAY_NAMES = [
  'شنبه',
  'یک‌شنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
];

export function getTodayJalali(): { year: number; month: number; day: number; formatted: string } {
  const now = new Date();
  const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const formatted = `${toPersianDigits(jy)}/${toPersianDigits(jm < 10 ? '0' + jm : jm)}/${toPersianDigits(jd < 10 ? '0' + jd : jd)}`;
  return { year: jy, month: jm, day: jd, formatted };
}

export function formatJalaliLong(date: Date = new Date()): string {
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const monthName = JALALI_MONTH_NAMES[jm - 1];
  return `${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
}

export function getWeekdayName(date: Date = new Date()): string {
  // JavaScript day 0 is Sunday, 6 is Saturday
  // Iranian week: 6 is Saturday (شنبه = 0), 0 is Sunday (یک‌شنبه = 1), ..., 5 is Friday (جمعه = 6)
  const d = date.getDay();
  const iranianDayIndex = (d + 1) % 7;
  return JALALI_WEEKDAY_NAMES[iranianDayIndex];
}

export function formatJalaliWithWeekday(date: Date = new Date()): string {
  const weekday = getWeekdayName(date);
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const monthName = JALALI_MONTH_NAMES[jm - 1];
  return `${weekday} ${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
}

// Convert numbers to Persian words
const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

function chunkToWords(num: number): string {
  if (num === 0) return '';
  const parts: string[] = [];
  const c = Math.floor(num / 100);
  const r = num % 100;
  if (c > 0) parts.push(HUNDREDS[c]);
  if (r >= 10 && r < 20) {
    parts.push(TEENS[r - 10]);
  } else {
    const t = Math.floor(r / 10);
    const o = r % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }
  return parts.join(' و ');
}

export function numberToPersianWords(val: number): string {
  if (!val || val === 0) return 'صفر';
  const num = Math.floor(Math.abs(val));
  const chunks: number[] = [];
  let temp = num;
  while (temp > 0) {
    chunks.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }
  const words: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunkVal = chunks[i];
    if (chunkVal > 0) {
      const chunkWord = chunkToWords(chunkVal);
      const scale = SCALES[i];
      words.push(scale ? `${chunkWord} ${scale}` : chunkWord);
    }
  }
  return words.join(' و ');
}

export function formatPriceInWords(toman: number): string {
  if (!toman || toman <= 0) return 'صفر تومان';
  const words = numberToPersianWords(toman);
  return `${words} تومان`;
}

export function formatAreaInWords(area: number): string {
  if (!area || area <= 0) return 'صفر متر';
  const words = numberToPersianWords(area);
  return `${words} متر مربع`;
}

/**
 * Shared utility: Formats a number with thousands separators and Persian digits.
 */
export function formatPersianNumber(val: number | string): string {
  if (val === null || val === undefined || val === '') return '';
  if (val === 0 || val === '0') return '۰';
  return formatWithCommas(val);
}

/**
 * Shared utility: Formats a price in Toman into compact value + unit parts (e.g. ۱۲.۵ + میلیارد).
 */
export function formatPriceShortParts(toman: number): {
  value: string;
  unit: string;
  full: string;
} {
  if (!toman || toman <= 0) {
    return { value: '۰', unit: 'تومان', full: '۰ تومان' };
  }

  const formatDecimal = (n: number): string => {
    const rounded = Math.round(n * 100) / 100;
    const str = Number.isInteger(rounded)
      ? formatWithCommas(rounded)
      : toPersianDigits(String(rounded).replace('.', '٫'));
    return str;
  };

  if (toman >= 1_000_000_000_000) {
    const v = formatDecimal(toman / 1_000_000_000_000);
    return { value: v, unit: 'همت', full: `${v} همت` };
  }
  if (toman >= 1_000_000_000) {
    const v = formatDecimal(toman / 1_000_000_000);
    return { value: v, unit: 'میلیارد', full: `${v} میلیارد تومان` };
  }
  if (toman >= 1_000_000) {
    const v = formatDecimal(toman / 1_000_000);
    return { value: v, unit: 'میلیون', full: `${v} میلیون تومان` };
  }
  if (toman >= 1_000) {
    const v = formatDecimal(toman / 1_000);
    return { value: v, unit: 'هزار', full: `${v} هزار تومان` };
  }
  const v = formatWithCommas(toman);
  return { value: v, unit: 'تومان', full: `${v} تومان` };
}

/**
 * Shared utility: Formats a price in Toman into a concise Persian string (e.g. ۱۲٫۵ میلیارد تومان).
 */
export function formatPriceShort(toman: number): string {
  return formatPriceShortParts(toman).full;
}

/**
 * Shared utility: Formats duration in seconds as Persian MM:SS (e.g. ۰۰:۱۸).
 */
export function formatDurationPersian(seconds?: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '۰۰:۰۰';
  const totalSec = Math.max(1, Math.round(seconds));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${toPersianDigits(String(mins).padStart(2, '0'))}:${toPersianDigits(String(secs).padStart(2, '0'))}`;
}

// Convert ISO date to Jalali string YYYY/MM/DD
export function isoToJalali(isoString: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${toPersianDigits(jy)}/${toPersianDigits(jm < 10 ? '0' + jm : jm)}/${toPersianDigits(jd < 10 ? '0' + jd : jd)}`;
  } catch {
    return '';
  }
}

// Iranian official holidays (bundled lookup table)
export const OFFICIAL_HOLIDAYS_1405: Record<string, string> = {
  '01/01': 'عید نوروز',
  '01/02': 'عید نوروز',
  '01/03': 'عید نوروز',
  '01/04': 'عید نوروز',
  '01/12': 'روز جمهوری اسلامی',
  '01/13': 'روز طبیعت (سیزده به در)',
  '03/14': 'رحلت امام خمینی',
  '03/15': 'قیام ۱۵ خرداد',
  '07/23': 'مناسبت رسمی',
  '11/22': 'پیروزی انقلاب اسلامی',
  '12/29': 'ملی شدن صنعت نفت',
};
