/**
 * Taxonomies, Cities, and Neighborhoods Management System (§2.8 & §3)
 */

export interface CityData {
  id: string;
  name: string;
  aliases: string[];
  neighborhoods: string[];
}

export const INITIAL_CITIES: CityData[] = [
  {
    id: 'kelarabad',
    name: 'کلارآباد',
    aliases: ['کلار اباد'],
    neighborhoods: ['خوشامیان', 'خیابان صدف', 'لاله', 'امیردشت', 'اسپندکلا', 'چارز', 'یال‌بندان']
  },
  {
    id: 'motelghoo',
    name: 'متلقو (سلمان‌شهر)',
    aliases: ['متل قو', 'سلمانشهر', 'سلمان شهر'],
    neighborhoods: ['دریاگوشه', 'تیلاکنار', 'کمربندی', 'دانیال', 'سی‌سرا', 'تازه آباد']
  },
  {
    id: 'namakabroud',
    name: 'نمک‌آبرود',
    aliases: ['نمک ابرود', 'هچیرود'],
    neighborhoods: ['شهرک نمک‌آبرود', 'محله ۱۲ توریستی', 'مسده', 'چاخانی', 'هرسه‌آبادی']
  },
  {
    id: 'chalous',
    name: 'چالوس',
    aliases: ['چالوس'],
    neighborhoods: ['رادیو دریا', 'خط هشت', 'فرمانداری', 'پردیس', 'اشکاردشت', 'امام‌رود']
  },
  {
    id: 'noshahr',
    name: 'نوشهر',
    aliases: ['نوشهر و سیسنگان'],
    neighborhoods: ['سیسنگان', 'چلک', 'بندپی', 'ونوش', 'تسکاتک', 'هلستان', 'کجور']
  },
  {
    id: 'abbasabad',
    name: 'عباس‌آباد',
    aliases: ['عباس اباد', 'کلاردشت'],
    neighborhoods: ['مرکز شهر', 'پسنده علیا', 'پسنده سفلی', 'امرپردیس', 'کلاردشت حسن‌کیف']
  },
  {
    id: 'tonekabon',
    name: 'تنکابن',
    aliases: ['شهسوار', 'تنکابن و شهسوار'],
    neighborhoods: ['کریم‌آباد', 'شیرود', 'دو هزار', 'سه هزار', 'سلیمان‌آباد', 'خرم‌آباد']
  },
  {
    id: 'ramsar',
    name: 'رامسر',
    aliases: ['سخت‌سر'],
    neighborhoods: ['سادات‌شهر', 'کتالم', 'بلوار کازینو', 'توساسان', 'جواهرده', 'اربکله']
  },
  {
    id: 'tehran',
    name: 'تهران',
    aliases: ['پایتخت'],
    neighborhoods: ['الهیه', 'فرمانیه', 'زعفرانیه', 'ولنجک', 'لواسان']
  }
];

export const PROPERTY_TYPES = [
  { key: 'land', short: 'زمین', long: 'زمین و کلنگی' },
  { key: 'villa', short: 'ویلا', long: 'ویلا لوکس و مدرن' },
  { key: 'apartment', short: 'آپارتمان', long: 'آپارتمان و پنت‌هاوس' },
  { key: 'commercial', short: 'مغازه و تجاری', long: 'تجاری و خدماتی' },
  { key: 'garden', short: 'باغ', long: 'هکتاری و باغات' },
  { key: 'township', short: 'شهرک برند', long: 'شهرک‌های برند' }
];

export const PROPERTY_STATUSES = [
  { key: 'active', value: 'فعال' as const, label: 'فعال (آماده فروش)', color: '#34d399' },
  { key: 'negotiating', value: 'در مذاکره' as const, label: 'در مذاکره', color: '#f1cb83' },
  { key: 'reserved', value: 'رزرو شده' as const, label: 'رزرو شده', color: '#38bdf8' },
  { key: 'sold', value: 'فروخته‌شده' as const, label: 'فروخته‌شده', color: '#94a3b8' },
  { key: 'inactive', value: 'غیرفعال' as const, label: 'غیرفعال / راکد', color: '#64748b' }
];

export const DEED_TYPES = [
  'تک‌برگ عرصه و اعیان (ششدانگ)',
  'شورایی با اصالت معتبر',
  'مشاعی یا بنچاق',
  'قولنامه‌ای معتبر با کد رهگیری',
  'وکالتی رسمی',
  'منگوله‌دار شاهنشاهی'
];

export const ZONING_STATUSES = [
  'داخل بافت مسکونی ۱۰۰٪',
  'دارای کاربری توریستی/گردشگری',
  'الحاق به بافت با تعهد معتبر',
  'بافت زرد تجاری-مسکونی',
  'خارج از بافت',
  'داخل حریم'
];

export const PRIORITY_LEVELS = [
  { key: 'vip', label: 'خریدار VIP', desc: 'اولویت درجه یک', color: '#34d399' },
  { key: 'cash', label: 'سرمایه‌گذار نقدی', desc: 'تسویه نقد زیر ۴۸ ساعت', color: '#f1cb83' },
  { key: 'urgent', label: 'ضرب‌الاجل', desc: 'خرید فوری فوری', color: '#f43f5e' },
  { key: 'normal', label: 'عادی', desc: 'متقاضی دوره بلندمدت', color: '#b8c5f5' }
];

export const CREDIT_LEVELS = [
  { key: 'excellent', label: 'عالی', color: '#34d399' },
  { key: 'good', label: 'خوب', color: '#f1cb83' },
  { key: 'normal', label: 'عادی', color: '#38bdf8' },
  { key: 'weak', label: 'ضعیف', color: '#f43f5e' }
];

export const REMINDER_CATEGORIES = [
  { key: 'phone', label: 'تماس تلفنی', icon: 'call' },
  { key: 'deed', label: 'استعلام سند', icon: 'description' },
  { key: 'visit', label: 'بازدید حضوری', icon: 'explore' },
  { key: 'finance', label: 'پیگیری مالی', icon: 'payments' },
  { key: 'commission', label: 'تسویه و کمیسیون', icon: 'account_balance_wallet' }
];
