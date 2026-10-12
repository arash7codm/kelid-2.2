import { normalizeDigits } from './jalali';

export interface ParsedCoordinatesResult {
  success: boolean;
  coords?: { lat: number; lng: number };
  formatted?: string;
  isShortLink?: boolean;
  errorMessage?: string;
}

/**
 * Checks whether coordinates are valid globally and plausibly fall inside Iran's bounding box.
 * Iran bounding box: Latitude ~24.0 to 40.5 N, Longitude ~43.5 to 64.0 E
 */
export function validateIranCoordinates(
  rawLat: number,
  rawLng: number
): { valid: boolean; coords?: { lat: number; lng: number }; reason?: 'out_of_range' | 'outside_iran' } {
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) {
    return { valid: false, reason: 'out_of_range' };
  }

  let lat = rawLat;
  let lng = rawLng;

  // Check if user or URL provided (lng, lat) swapped for Iran
  if (lat >= 43.5 && lat <= 64.0 && lng >= 24.0 && lng <= 40.5) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, reason: 'out_of_range' };
  }

  if (lat < 24.0 || lat > 40.5 || lng < 43.5 || lng > 64.0) {
    return { valid: false, reason: 'outside_iran' };
  }

  return {
    valid: true,
    coords: {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    },
  };
}

/**
 * Synchronous parser for extracting coordinates from map links or plain text.
 * Supports:
 * - Google Maps (!3d..!4d.., @lat,lng, ?q=lat,lng, ll=, query=, center=, destination=)
 * - Neshan (lat=..&lng=.., /#15/lat/lng)
 * - Balad (latitude=..&longitude=.., /#15/lat/lng)
 * - Waze (ll=lat,lng, navigate=yes)
 * - Apple Maps (ll=lat,lng, q=lat,lng, sll=lat,lng)
 * - OpenStreetMap (?mlat=..&mlon=.., #map=zoom/lat/lng)
 * - geo:lat,lng
 * - Plain "lat , lng" text (with Persian, Arabic, or English digits)
 */
export function parseMapLocationSync(rawInput: string): ParsedCoordinatesResult {
  if (!rawInput || !rawInput.trim()) {
    return { success: false, errorMessage: 'متنی برای استخراج مختصات وارد نشده است.' };
  }

  // Normalize Persian/Arabic digits first
  let text = normalizeDigits(rawInput.trim());
  try {
    text = decodeURIComponent(text);
  } catch {
    // Ignore malformed URI sequences
  }

  const candidatePairs: Array<[number, number]> = [];

  // 1. Google Maps exact pin !3d<lat>!4d<lng>
  const bangMatch = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/i);
  if (bangMatch) {
    candidatePairs.push([parseFloat(bangMatch[1]), parseFloat(bangMatch[2])]);
  }

  // 2. @lat,lng pattern (Google Maps, Google Earth, Balad, Neshan)
  const atMatch = text.match(/@(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i);
  if (atMatch) {
    candidatePairs.push([parseFloat(atMatch[1]), parseFloat(atMatch[2])]);
  }

  // 3. Query parameters with comma-separated pair: q=, query=, ll=, sll=, center=, destination=, origin=, loc=, point=
  const queryPairRegex =
    /[?&#](?:q|query|ll|sll|center|destination|origin|loc|point|daddr|saddr)=(?:loc:)?\s*(-?\d+\.\d+)\s*(?:,|%2C|\s)\s*(-?\d+\.\d+)/gi;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = queryPairRegex.exec(text)) !== null) {
    candidatePairs.push([parseFloat(qMatch[1]), parseFloat(qMatch[2])]);
  }

  // 4. Separate lat/lng query parameters (Neshan, Balad, OpenStreetMap)
  const latParamMatch = text.match(/[?&#](?:lat|latitude|mlat)=(-?\d+\.\d+)/i);
  const lngParamMatch = text.match(/[?&#](?:lng|lon|long|longitude|mlon)=(-?\d+\.\d+)/i);
  if (latParamMatch && lngParamMatch) {
    candidatePairs.push([parseFloat(latParamMatch[1]), parseFloat(lngParamMatch[1])]);
  }

  // 5. Hash or slash zoom/lat/lng format: #map=16/36.6510/51.2010 or #15/36.6510/51.2010
  const slashMapMatch = text.match(/(?:#map=\d+\/|#\d+(?:\.\d+)?\/|\/)(-?\d{2}\.\d{3,})\/(-?\d{2}\.\d{3,})/i);
  if (slashMapMatch) {
    candidatePairs.push([parseFloat(slashMapMatch[1]), parseFloat(slashMapMatch[2])]);
  }

  // 6. geo: URI scheme (geo:36.6510,51.2010)
  const geoMatch = text.match(/geo:\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i);
  if (geoMatch) {
    candidatePairs.push([parseFloat(geoMatch[1]), parseFloat(geoMatch[2])]);
  }

  // 7. Plain coordinate pair anywhere in text (e.g. "36.651042 , 51.201089")
  const plainMatch = text.match(/(-?\d{2}\.\d{2,})\s*[,،\s/]+\s*(-?\d{2}\.\d{2,})/);
  if (plainMatch) {
    candidatePairs.push([parseFloat(plainMatch[1]), parseFloat(plainMatch[2])]);
  }

  let sawOutsideIran = false;

  for (const [rawLat, rawLng] of candidatePairs) {
    const check = validateIranCoordinates(rawLat, rawLng);
    if (check.valid && check.coords) {
      return {
        success: true,
        coords: check.coords,
        formatted: `${check.coords.lat.toFixed(6)} , ${check.coords.lng.toFixed(6)}`,
      };
    }
    if (check.reason === 'outside_iran') {
      sawOutsideIran = true;
    }
  }

  if (sawOutsideIran) {
    return {
      success: false,
      errorMessage: 'مختصات واردشده خارج از محدوده جغرافیایی ایران است.',
    };
  }

  // Check if input looks like a shortened map link
  const isShortLink =
    /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/maps|nshn\.ir|balad\.ir|waze\.com\/ul|ul\.waze\.com)/i.test(
      text
    );

  if (isShortLink) {
    return {
      success: false,
      isShortLink: true,
      errorMessage:
        'این یک لینک کوتاه نقشه است. در حال بازگشایی خودکار لینک...',
    };
  }

  return {
    success: false,
    errorMessage:
      'فرمت لینک یا مختصات شناسایی نشد. لطفاً مختصات (مثلاً 36.651042 , 51.201089) یا لینک کامل نقشه را وارد کنید.',
  };
}

/**
 * Asynchronous parser that first tries synchronous parsing (works 100% offline for full links and coordinate pairs),
 * and if the input contains a short URL (such as maps.app.goo.gl, nshn.ir, balad.ir),
 * attempts a direct browser fetch; if CORS or offline state blocks it, returns a polite Persian instruction.
 */
export async function resolveAndParseMapInput(rawInput: string): Promise<ParsedCoordinatesResult> {
  const direct = parseMapLocationSync(rawInput);
  if (direct.success) {
    return direct;
  }

  // Extract first http/https URL from the text if present
  const normalized = normalizeDigits(rawInput.trim());
  const urlMatch = normalized.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) {
    return direct;
  }

  const targetUrl = urlMatch[0];

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.url) {
        const parsedFinal = parseMapLocationSync(res.url);
        if (parsedFinal.success) {
          return parsedFinal;
        }
      }

      if (res.ok) {
        const htmlSnippet = (await res.text()).slice(0, 50000);
        const parsedHtml = parseMapLocationSync(htmlSnippet);
        if (parsedHtml.success) {
          return parsedHtml;
        }
      }
    } catch {
      // Browser CORS policy or offline state blocked direct short-link redirect reading
    }
  }

  return {
    success: false,
    isShortLink: true,
    errorMessage:
      'لینک کوتاه به دلیل محدودیت مرورگر (CORS) بازگشایی نشد؛ لطفاً لینک را در برنامه نقشه باز کنید و لینک کامل یا مختصات را کپی و در این کادر بچسبانید.',
  };
}
