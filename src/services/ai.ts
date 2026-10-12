import { db, getSetting, setSetting } from '../db';
import { getTodayJalali, toPersianDigits } from '../utils/jalali';
import { Property, Applicant, Collaborator, ReminderTask } from '../types';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_KEY_SETTING = 'gemini_api_key';
export const GEMINI_MODEL_SETTING = 'gemini_model_name';

export interface ExtractedReminderData {
  title: string;
  category: 'تماس تلفنی' | 'استعلام سند' | 'بازدید حضوری' | 'پیگیری مالی' | 'تسویه و کمیسیون';
  priority: 'فوری و بحرانی' | 'عادی' | 'کم‌اهمیت';
  dateJalali: string;
  timeStr: string;
  linkedPropertyCode?: string;
  linkedPersonName?: string;
  linkedPersonCode?: string;
  notes?: string;
  usedLocalFallback?: boolean;
  fallbackReason?: 'no_key' | 'offline' | 'error';
  noticeMessage?: string;
}

function purgeLegacyLocalStorageKeys(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('gemini_api_key');
      window.localStorage.removeItem('geminiApiKey');
      window.localStorage.removeItem('KELID_GEMINI_KEY');
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Retrieve stored Gemini API key strictly from IndexedDB settings (never from localStorage or bundle).
 */
export async function getStoredGeminiApiKey(): Promise<string> {
  purgeLegacyLocalStorageKeys();

  const dbKey = await getSetting<string>(GEMINI_KEY_SETTING, '');
  if (dbKey && dbKey.trim()) return dbKey.trim();

  const dbKeyLegacy = await getSetting<string>('geminiApiKey', '');
  if (dbKeyLegacy && dbKeyLegacy.trim()) {
    const clean = dbKeyLegacy.trim();
    await setSetting(GEMINI_KEY_SETTING, clean);
    try {
      await db.settings.delete('geminiApiKey');
    } catch {}
    return clean;
  }

  return '';
}

/**
 * Save Gemini API key strictly in IndexedDB on this device.
 */
export async function saveStoredGeminiApiKey(apiKey: string): Promise<void> {
  purgeLegacyLocalStorageKeys();
  const clean = apiKey.trim();
  if (!clean) {
    await deleteStoredGeminiApiKey();
    return;
  }
  await setSetting(GEMINI_KEY_SETTING, clean);
  try {
    await db.settings.delete('geminiApiKey');
  } catch {}
}

/**
 * Delete stored Gemini API key from IndexedDB.
 */
export async function deleteStoredGeminiApiKey(): Promise<void> {
  purgeLegacyLocalStorageKeys();
  try {
    await db.settings.delete(GEMINI_KEY_SETTING);
    await db.settings.delete('geminiApiKey');
  } catch {}
}

/**
 * Retrieve stored Gemini model name from IndexedDB with sensible default.
 */
export async function getStoredGeminiModel(): Promise<string> {
  const model = await getSetting<string>(GEMINI_MODEL_SETTING, DEFAULT_GEMINI_MODEL);
  const clean = (model || '').trim();
  return clean || DEFAULT_GEMINI_MODEL;
}

/**
 * Save Gemini model name in IndexedDB.
 */
export async function saveStoredGeminiModel(model: string): Promise<string> {
  const clean = (model || '').trim() || DEFAULT_GEMINI_MODEL;
  await setSetting(GEMINI_MODEL_SETTING, clean);
  return clean;
}

/**
 * Makes a real tiny test call to Gemini from the browser using the provided or stored key
 * and returns a clear Persian result without logging or exposing the key in URLs.
 */
export async function testGeminiApiKey(
  candidateKey?: string,
  candidateModel?: string
): Promise<{ ok: boolean; message: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      message: 'دستگاه در حال حاضر آفلاین است. برای تست کلید، اتصال اینترنت را برقرار کنید.',
    };
  }

  const keyToUse = (candidateKey !== undefined ? candidateKey : await getStoredGeminiApiKey()).trim();
  if (!keyToUse) {
    return {
      ok: false,
      message: 'لطفاً ابتدا کلید هوش مصنوعی (API Key) را در کادر بالا وارد کنید.',
    };
  }

  const modelToUse = (
    (candidateModel !== undefined ? candidateModel : await getStoredGeminiModel()) ||
    DEFAULT_GEMINI_MODEL
  ).trim() || DEFAULT_GEMINI_MODEL;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToUse)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': keyToUse,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'فقط کلمه «تایید» را بنویس.' }] }],
          generationConfig: { maxOutputTokens: 16 },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const reply = data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text || '')
        .join(' ')
        .trim();
      if (reply || data?.candidates?.length) {
        return {
          ok: true,
          message: `کلید معتبر است و اتصال مستقیم به مدل «${modelToUse}» با موفقیت برقرار شد ✓`,
        };
      }
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message:
          'کلید واردشده نامعتبر است یا محدودیت دامنه (HTTP Referrer) اجازه دسترسی از این آدرس را نمی‌دهد.',
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        message: `مدل «${modelToUse}» یافت نشد. لطفاً نام مدل را بررسی کنید (پیشنهاد: ${DEFAULT_GEMINI_MODEL}).`,
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        message: 'کلید شناسایی شد اما سقف مجاز درخواست (Quota) موقتاً پر شده است (کد ۴۲۹).',
      };
    }

    return {
      ok: false,
      message: `خطا در پاسخ سرویس Gemini (کد وضعیت: ${toPersianDigits(response.status)}).`,
    };
  } catch {
    return {
      ok: false,
      message: 'امکان برقراری ارتباط با سرور Gemini وجود نداشت؛ اتصال اینترنت یا فیلترشکن را بررسی کنید.',
    };
  }
}

/**
 * Normalizes Persian text for duplicate comparison (unifies Yeh/Kaf and spaces).
 */
function normalizeForComparison(text: string): string {
  return text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Appends a new speech segment to existing text while eliminating Android Chrome's
 * cumulative repetition bug in continuous/interim mode.
 */
export function appendWithoutOverlap(existing: string, incoming: string): string {
  const cleanExisting = existing.replace(/\s+/g, ' ').trim();
  const cleanIncoming = incoming.replace(/\s+/g, ' ').trim();

  if (!cleanIncoming) return cleanExisting;
  if (!cleanExisting) return cleanIncoming;

  const normExisting = normalizeForComparison(cleanExisting);
  const normIncoming = normalizeForComparison(cleanIncoming);

  // Case 1: Identical
  if (normExisting === normIncoming) {
    return cleanExisting;
  }

  // Case 2: Incoming contains the entire existing string as a prefix (classic Chrome Android bug)
  if (normIncoming.startsWith(normExisting)) {
    return cleanIncoming;
  }

  // Case 3: Existing already ends with incoming
  if (normExisting.endsWith(normIncoming)) {
    return cleanExisting;
  }

  // Case 4: Word-level suffix-prefix overlap (e.g. "کلارآباد خیابان" + "خیابان دریا")
  const existingWords = cleanExisting.split(' ');
  const incomingWords = cleanIncoming.split(' ');
  const normExistingWords = normExisting.split(' ');
  const normIncomingWords = normIncoming.split(' ');

  const maxOverlap = Math.min(existingWords.length, incomingWords.length);
  for (let overlapLen = maxOverlap; overlapLen >= 1; overlapLen--) {
    const existingSuffix = normExistingWords.slice(existingWords.length - overlapLen).join(' ');
    const incomingPrefix = normIncomingWords.slice(0, overlapLen).join(' ');
    if (existingSuffix === incomingPrefix) {
      const remainingWords = incomingWords.slice(overlapLen);
      if (remainingWords.length === 0) return cleanExisting;
      return `${cleanExisting} ${remainingWords.join(' ')}`.replace(/\s+/g, ' ').trim();
    }
  }

  return `${cleanExisting} ${cleanIncoming}`.replace(/\s+/g, ' ').trim();
}

/**
 * Processes SpeechRecognitionResultList and returns deduplicated transcript text.
 * Specifically guards against the Android Chrome continuous mode bug where each result
 * repeats previous results.
 */
export function mergeSpeechRecognitionResults(results: any): {
  finalTranscript: string;
  interimTranscript: string;
  combinedTranscript: string;
} {
  let finalTranscript = '';
  let interimTranscript = '';

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const transcript = (result[0]?.transcript || '').trim();
    if (!transcript) continue;

    if (result.isFinal) {
      finalTranscript = appendWithoutOverlap(finalTranscript, transcript);
    } else {
      interimTranscript = appendWithoutOverlap(interimTranscript, transcript);
    }
  }

  const combinedTranscript = appendWithoutOverlap(finalTranscript, interimTranscript);
  return {
    finalTranscript,
    interimTranscript,
    combinedTranscript,
  };
}

/**
 * Direct browser audio transcription using Gemini API with the user's IndexedDB key.
 */
export async function transcribeAudioWithGemini(
  base64Audio: string,
  mimeType: string
): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('OFFLINE');
  }

  const apiKey = await getStoredGeminiApiKey();
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }

  const model = await getStoredGeminiModel();
  const prompt = 'این صدا فارسی است؛ فقط متن دقیق گفته‌شده را بدون توضیح اضافه برگردان.';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/webm',
                  data: base64Audio,
                },
              },
              { text: prompt },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GEMINI_HTTP_${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text || '')
    .join(' ')
    .trim();

  if (!text) {
    throw new Error('NO_SPEECH');
  }
  return text;
}

export async function extractReminderFromTranscript(
  transcript: string,
  properties: Property[] = [],
  collaborators: Collaborator[] = [],
  applicants: Applicant[] = []
): Promise<ExtractedReminderData> {
  const apiKey = await getStoredGeminiApiKey();
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (!apiKey) {
    const localResult = extractLocalHeuristic(transcript, properties, collaborators, applicants);
    return {
      ...localResult,
      usedLocalFallback: true,
      fallbackReason: 'no_key',
      noticeMessage:
        'کلید هوش مصنوعی در تنظیمات ثبت نشده است؛ اطلاعات به صورت خودکار با تحلیلگر محلی فارسی استخراج شد.',
    };
  }

  if (isOffline) {
    const localResult = extractLocalHeuristic(transcript, properties, collaborators, applicants);
    return {
      ...localResult,
      usedLocalFallback: true,
      fallbackReason: 'offline',
      noticeMessage:
        'دستگاه آفلاین است؛ اطلاعات به صورت خودکار با تحلیلگر محلی فارسی استخراج شد.',
    };
  }

  const today = getTodayJalali();
  const model = await getStoredGeminiModel();

  const knownProps = properties.map(p => `${p.code}: ${p.title} (${p.city})`).join('\n');
  const knownPersons = [
    ...collaborators.map(c => `${c.code}: ${c.fullName} (همکار)`),
    ...applicants.map(a => `${a.code}: ${a.fullName} (متقاضی)`)
  ].join('\n');

  const prompt = `
تو دستیار هوشمند و فوق‌تخصصی املاک «کلید» در شمال ایران هستی.
امروز: ${today.formatted} (تاریخ شمسی).
متن پیاده‌شده ویس مشاور: "${transcript}"

فهرست پرونده‌های ملکی موجود:
${knownProps}

فهرست مخاطبین موجود:
${knownPersons}

لطفاً این متن را تحلیل کن و یک خروجی JSON معتبر با ساختار زیر بده:
{
  "title": "یک عنوان کوتاه و شفاف به زبان فارسی",
  "category": "یکی از: تماس تلفنی | استعلام سند | بازدید حضوری | پیگیری مالی | تسویه و کمیسیون",
  "priority": "یکی از: فوری و بحرانی | عادی | کم‌اهمیت",
  "dateJalali": "تاریخ شمسی دقیق مثلاً ۱۴۰۵/۰۷/۲۴ (اگر گفت فردا یا پس‌فردا از روی تاریخ امروز محاسبه کن)",
  "timeStr": "ساعت دقیق به فرمت فارسی مثلاً ۱۱:۰۰ قبل‌ازظهر یا ۱۶:۰۰ بعدازظهر",
  "linkedPropertyCode": "کد ملک اگر اشاره شد مثل F-002 یا خالی",
  "linkedPersonName": "نام شخص اشاره‌شده یا خالی",
  "linkedPersonCode": "کد شخص مانند H-003 یا C-001 یا خالی",
  "notes": "خلاصه اقدام و نکات مهم"
}
پاسخ فقط و فقط یک آبجکت JSON باشد بدون هیچ متن اضافه.
`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText.trim());
        if (parsed && parsed.title) {
          return {
            ...(parsed as ExtractedReminderData),
            usedLocalFallback: false,
          };
        }
      }
    }
  } catch {
    // Fallback to local Persian heuristic without logging secrets
  }

  const fallbackResult = extractLocalHeuristic(transcript, properties, collaborators, applicants);
  return {
    ...fallbackResult,
    usedLocalFallback: true,
    fallbackReason: 'error',
    noticeMessage:
      'ارتباط با هوش مصنوعی برقرار نشد؛ اطلاعات به صورت خودکار با تحلیلگر محلی فارسی استخراج شد.',
  };
}

function extractLocalHeuristic(
  transcript: string,
  properties: Property[],
  collaborators: Collaborator[],
  applicants: Applicant[]
): ExtractedReminderData {
  const today = getTodayJalali();
  let targetDay = today.day + 1;
  let targetMonth = today.month;
  let targetYear = today.year;

  if (transcript.includes('پس‌فردا') || transcript.includes('پس فردا')) {
    targetDay += 2;
  } else if (transcript.includes('فردا')) {
    targetDay += 1;
  }

  const dateJalali = `${toPersianDigits(targetYear)}/${toPersianDigits(targetMonth < 10 ? '0' + targetMonth : targetMonth)}/${toPersianDigits(targetDay < 10 ? '0' + targetDay : targetDay)}`;

  // Find linked property
  let matchedProp = properties.find(p => transcript.includes(p.code) || (p.district && transcript.includes(p.district)));
  if (!matchedProp && properties.length > 0) {
    matchedProp = properties[0];
  }

  // Find linked person
  let matchedCollab = collaborators.find(c => transcript.includes(c.code) || transcript.includes(c.fullName));
  let matchedApp = applicants.find(a => transcript.includes(a.code) || transcript.includes(a.fullName));

  let category: ExtractedReminderData['category'] = 'تماس تلفنی';
  if (transcript.includes('سند') || transcript.includes('استعلام')) {
    category = 'استعلام سند';
  } else if (transcript.includes('بازدید')) {
    category = 'بازدید حضوری';
  } else if (transcript.includes('تسویه') || transcript.includes('کمیسیون')) {
    category = 'تسویه و کمیسیون';
  } else if (transcript.includes('مالی') || transcript.includes('چک')) {
    category = 'پیگیری مالی';
  }

  let priority: ExtractedReminderData['priority'] = 'عادی';
  if (transcript.includes('فوری') || transcript.includes('بحرانی') || transcript.includes('سریع')) {
    priority = 'فوری و بحرانی';
  }

  return {
    title: `پیگیری ${category} - ${matchedProp ? matchedProp.title : 'پرونده کلید'}`,
    category,
    priority,
    dateJalali,
    timeStr: '۱۱:۰۰ قبل‌ازظهر',
    linkedPropertyCode: matchedProp?.code,
    linkedPersonName: matchedCollab?.fullName || matchedApp?.fullName || 'مهندس کیان رضوانی',
    linkedPersonCode: matchedCollab?.code || matchedApp?.code || 'H-003',
    notes: transcript
  };
}

// Global smart search engine with natural Persian intent parsing
export interface SmartSearchResult {
  properties: Property[];
  applicants: Applicant[];
  collaborators: Collaborator[];
  reminders: ReminderTask[];
  suggestedAction?: {
    text: string;
    actionType: 'map' | 'property' | 'applicant' | 'reminder';
    targetId?: string;
  };
}

export function performSmartSearch(
  query: string,
  allProps: Property[],
  allApps: Applicant[],
  allCollabs: Collaborator[],
  allReminders: ReminderTask[]
): SmartSearchResult {
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      properties: allProps,
      applicants: allApps,
      collaborators: allCollabs,
      reminders: allReminders
    };
  }

  // Check for special number queries (e.g. 300 متر)
  const areaMatch = q.match(/(\d+)\s*متر/);
  const targetArea = areaMatch ? parseInt(areaMatch[1], 10) : null;

  const matchedProps = allProps.filter(p => {
    if (p.deleted) return false;
    if (targetArea && Math.abs(p.area - targetArea) <= targetArea * 0.15) return true;
    return (
      p.code.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q) ||
      p.district.toLowerCase().includes(q) ||
      p.propertyType.toLowerCase().includes(q) ||
      p.deedType.toLowerCase().includes(q) ||
      (p.address && p.address.toLowerCase().includes(q))
    );
  });

  const matchedApps = allApps.filter(a => {
    if (a.deleted) return false;
    return (
      a.code.toLowerCase().includes(q) ||
      a.fullName.toLowerCase().includes(q) ||
      a.phone.includes(q) ||
      a.primaryCity.toLowerCase().includes(q) ||
      a.priority.toLowerCase().includes(q)
    );
  });

  const matchedCollabs = allCollabs.filter(c => {
    if (c.deleted) return false;
    return (
      c.code.toLowerCase().includes(q) ||
      c.fullName.toLowerCase().includes(q) ||
      c.agencyName.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.primaryCity.toLowerCase().includes(q)
    );
  });

  const matchedReminders = allReminders.filter(r => {
    return (
      r.title.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.linkedPropertyCode && r.linkedPropertyCode.toLowerCase().includes(q)) ||
      (r.linkedPersonName && r.linkedPersonName.toLowerCase().includes(q))
    );
  });

  let suggestedAction: SmartSearchResult['suggestedAction'] = undefined;
  if (matchedProps.length > 0 && (q.includes('نقشه') || q.includes('لوکیشن') || q.includes('کجا'))) {
    suggestedAction = {
      text: `مشاهده موقعیت ${matchedProps.length} ملک یافت‌شده روی نقشه ماهواره‌ای`,
      actionType: 'map'
    };
  }

  return {
    properties: matchedProps,
    applicants: matchedApps,
    collaborators: matchedCollabs,
    reminders: matchedReminders,
    suggestedAction
  };
}
