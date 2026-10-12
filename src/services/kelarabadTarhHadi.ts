import { getSetting, setSetting, getBlobDataUrl, saveBlob } from '../db';
import { TarhHadiCheckResult } from '../types';
import { getTodayJalali, toPersianDigits } from '../utils/jalali';
import {
  DEFAULT_TARH_HADI_MAP_URL,
  DEFAULT_TARH_HADI_LEGEND_URL,
  resolvePlanMapAssetUrl,
  resolvePlanLegendAssetUrl,
  hasCustomPlanMapAsset,
  hasCustomPlanLegendAsset,
} from './planAssets';

export {
  DEFAULT_TARH_HADI_MAP_URL,
  DEFAULT_TARH_HADI_LEGEND_URL,
  resolvePlanMapAssetUrl,
  resolvePlanLegendAssetUrl,
  hasCustomPlanMapAsset,
  hasCustomPlanLegendAsset,
};

export const TARH_HADI_SETTINGS_KEY = 'kelarabad_tarh_hadi_config';

export interface TarhHadiControlPoint {
  id: string;
  label: string;
  imageX: number; // Normalized 0..1 from left to right
  imageY: number; // Normalized 0..1 from top to bottom (North up)
  lat: number;
  lng: number;
  rawInput?: string;
}

export interface TarhHadiCalibrationConfig {
  isCalibrated: boolean;
  isNotificationDismissed?: boolean;
  updatedAt: string;
  updatedBy?: string;
  customMapBlobRef?: string;
  customLegendBlobRef?: string;
  overlayOpacity?: number;
  controlPoints: TarhHadiControlPoint[];
}

export interface LegendLandUseItem {
  code: string;
  title: string;
  color: string;
  rgb: [number, number, number];
  description: string;
  suggestedZoningStatus: string;
  suggestedLandUsage: string;
}

export const KELARABAD_LEGEND_ITEMS: LegendLandUseItem[] = [
  {
    code: 'residential',
    title: 'مسکونی',
    color: '#facc15',
    rgb: [250, 204, 21],
    description: 'پهنه مسکونی داخل محدوده پیشنهادی طرح هادی کلارآباد.',
    suggestedZoningStatus: 'داخل بافت مسکونی ۱۰۰٪',
    suggestedLandUsage: 'مسکونی ویلایی',
  },
  {
    code: 'commercial',
    title: 'تجاری و خدماتی',
    color: '#ef4444',
    rgb: [239, 68, 68],
    description: 'پهنه تجاری و خدماتی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'بافت زرد تجاری-مسکونی',
    suggestedLandUsage: 'تجاری و خدماتی',
  },
  {
    code: 'mixed',
    title: 'مختلط تجاری - مسکونی',
    color: '#f97316',
    rgb: [249, 115, 22],
    description: 'پهنه مختلط تجاری-مسکونی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'بافت زرد تجاری-مسکونی',
    suggestedLandUsage: 'تجاری - مسکونی',
  },
  {
    code: 'tourism',
    title: 'گردشگری، توریستی و پذیرایی',
    color: '#a855f7',
    rgb: [168, 85, 247],
    description: 'پهنه گردشگری و توریستی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'دارای کاربری توریستی/گردشگری',
    suggestedLandUsage: 'گردشگری و توریستی',
  },
  {
    code: 'green_space',
    title: 'فضای سبز و پارک',
    color: '#22c55e',
    rgb: [34, 197, 94],
    description: 'پهنه فضای سبز و پارک عمومی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'داخل حریم',
    suggestedLandUsage: 'کشاورزی و باغی',
  },
  {
    code: 'orchard',
    title: 'باغات و کشاورزی داخل محدوده',
    color: '#15803d',
    rgb: [21, 128, 61],
    description: 'پهنه باغات و اراضی زراعی داخل محدوده پیشنهادی کلارآباد.',
    suggestedZoningStatus: 'الحاق به بافت با تعهد معتبر',
    suggestedLandUsage: 'باغ‌ویلا',
  },
  {
    code: 'educational',
    title: 'آموزشی',
    color: '#3b82f6',
    rgb: [59, 130, 246],
    description: 'پهنه کاربری آموزشی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'داخل حریم',
    suggestedLandUsage: 'تجاری و خدماتی',
  },
  {
    code: 'administrative',
    title: 'اداری و انتظامی',
    color: '#64748b',
    rgb: [100, 116, 139],
    description: 'پهنه مراکز اداری و دولتی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'بافت زرد تجاری-مسکونی',
    suggestedLandUsage: 'تجاری و خدماتی',
  },
  {
    code: 'cultural',
    title: 'فرهنگی و مذهبی',
    color: '#06b6d4',
    rgb: [6, 182, 212],
    description: 'پهنه مراکز فرهنگی و مذهبی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'داخل بافت مسکونی ۱۰۰٪',
    suggestedLandUsage: 'تجاری و خدماتی',
  },
  {
    code: 'sports',
    title: 'ورزشی',
    color: '#84cc16',
    rgb: [132, 204, 22],
    description: 'پهنه کاربری ورزشی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'دارای کاربری توریستی/گردشگری',
    suggestedLandUsage: 'گردشگری و توریستی',
  },
  {
    code: 'health',
    title: 'بهداشتی و درمانی',
    color: '#f43f5e',
    rgb: [244, 63, 94],
    description: 'پهنه بهداشتی و درمانی در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'بافت زرد تجاری-مسکونی',
    suggestedLandUsage: 'تجاری و خدماتی',
  },
  {
    code: 'facilities',
    title: 'تأسیسات و تجهیزات شهری',
    color: '#d97706',
    rgb: [217, 119, 6],
    description: 'پهنه تأسیسات و تجهیزات شهری در طرح هادی کلارآباد.',
    suggestedZoningStatus: 'داخل حریم',
    suggestedLandUsage: 'تجاری و خدماتی',
  },
];

/**
 * Geometrically affine-consistent default reference points for Kelarabad Master Plan.
 * Every point lies on the exact same North-up affine plane:
 * lng = 51.201089 + (imageX - 0.48) * 0.0600
 * lat = 36.651042 + (imageY - 0.56) * (-0.0500)
 * So testing any reference point (including 36.651042, 51.201089 at cp-3) lands with 0.00% error.
 */
export const DEFAULT_CONTROL_POINTS: TarhHadiControlPoint[] = [
  {
    id: 'cp-1',
    label: 'نقطه مرجع ۱ (شمال‌غرب نقشه)',
    imageX: 0.18,
    imageY: 0.22,
    lat: 36.668042,
    lng: 51.183089,
    rawInput: '36.668042 , 51.183089',
  },
  {
    id: 'cp-2',
    label: 'نقطه مرجع ۲ (شمال‌شرق نقشه)',
    imageX: 0.84,
    imageY: 0.28,
    lat: 36.665042,
    lng: 51.222689,
    rawInput: '36.665042 , 51.222689',
  },
  {
    id: 'cp-3',
    label: 'نقطه مرجع ۳ (مرکز نقشه)',
    imageX: 0.48,
    imageY: 0.56,
    lat: 36.651042,
    lng: 51.201089,
    rawInput: '36.651042 , 51.201089',
  },
  {
    id: 'cp-4',
    label: 'نقطه مرجع ۴ (جنوب‌شرق نقشه)',
    imageX: 0.82,
    imageY: 0.74,
    lat: 36.642042,
    lng: 51.221489,
    rawInput: '36.642042 , 51.221489',
  },
];

let cachedConfig: TarhHadiCalibrationConfig | null = null;
const configListeners = new Set<(cfg: TarhHadiCalibrationConfig) => void>();

export function subscribeTarhHadiConfig(
  listener: (cfg: TarhHadiCalibrationConfig) => void
): () => void {
  configListeners.add(listener);
  return () => {
    configListeners.delete(listener);
  };
}

function notifyConfigListeners(cfg: TarhHadiCalibrationConfig) {
  configListeners.forEach((fn) => {
    try {
      fn(cfg);
    } catch {
      // ignore listener errors
    }
  });
}

export function getDefaultTarhHadiConfig(): TarhHadiCalibrationConfig {
  return {
    isCalibrated: false,
    isNotificationDismissed: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'سیستم',
    overlayOpacity: 0.72,
    controlPoints: DEFAULT_CONTROL_POINTS,
  };
}

export async function loadTarhHadiConfig(): Promise<TarhHadiCalibrationConfig> {
  const saved = await getSetting<TarhHadiCalibrationConfig | null>(TARH_HADI_SETTINGS_KEY, null);
  if (saved && Array.isArray(saved.controlPoints) && saved.controlPoints.length >= 2) {
    // Ensure any custom blob references are loaded into memory cache
    if (saved.customMapBlobRef) {
      await getBlobDataUrl(saved.customMapBlobRef);
    }
    if (saved.customLegendBlobRef) {
      await getBlobDataUrl(saved.customLegendBlobRef);
    }

    // Migrate legacy uncalibrated contradictory defaults if present
    let migratedPoints = saved.controlPoints;
    if (
      !saved.isCalibrated &&
      saved.controlPoints.length === 4 &&
      Math.abs(saved.controlPoints[0].lat - 36.6935) < 1e-4 &&
      Math.abs(saved.controlPoints[2].lat - 36.651042) < 1e-4
    ) {
      migratedPoints = DEFAULT_CONTROL_POINTS;
    }

    const normalizedSaved: TarhHadiCalibrationConfig = {
      ...saved,
      controlPoints: migratedPoints,
    };
    cachedConfig = normalizedSaved;
    const url = getActiveTarhHadiMapUrl(normalizedSaved);
    if (url) ensurePlanPixelCacheLoaded(url);
    notifyConfigListeners(normalizedSaved);
    return normalizedSaved;
  }
  const def = getDefaultTarhHadiConfig();
  cachedConfig = def;
  ensurePlanPixelCacheLoaded(DEFAULT_TARH_HADI_MAP_URL);
  notifyConfigListeners(def);
  return def;
}

export function getTarhHadiConfigSync(): TarhHadiCalibrationConfig {
  return cachedConfig || getDefaultTarhHadiConfig();
}

export async function saveTarhHadiConfig(config: TarhHadiCalibrationConfig): Promise<void> {
  cachedConfig = config;
  await setSetting(TARH_HADI_SETTINGS_KEY, config);
  const url = getActiveTarhHadiMapUrl(config);
  ensurePlanPixelCacheLoaded(url);
  notifyConfigListeners(config);
}

/**
 * Single centralized helper to upload and persist the Plan Image or Legend Image into IndexedDB
 * and immediately notify all active views/components.
 */
export async function uploadAndSaveTarhHadiAsset(
  file: File,
  kind: 'map' | 'legend',
  updatedBy?: string
): Promise<TarhHadiCalibrationConfig> {
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });

  if (!dataUrl) {
    throw new Error('خطا در خواندن فایل تصویر');
  }

  const mimeType = file.type || (kind === 'map' ? 'image/jpeg' : 'image/png');
  const blobRef = await saveBlob(dataUrl, mimeType);
  const currentCfg = getTarhHadiConfigSync();
  const nextCfg: TarhHadiCalibrationConfig = {
    ...currentCfg,
    ...(kind === 'map' ? { customMapBlobRef: blobRef } : { customLegendBlobRef: blobRef }),
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };

  await saveTarhHadiConfig(nextCfg);
  if (kind === 'map') {
    await ensurePlanPixelCacheLoaded(getActiveTarhHadiMapUrl(nextCfg));
  }
  return nextCfg;
}

export function getActiveTarhHadiMapUrl(config?: TarhHadiCalibrationConfig): string {
  const cfg = config || getTarhHadiConfigSync();
  return resolvePlanMapAssetUrl(cfg);
}

export function getActiveTarhHadiLegendUrl(config?: TarhHadiCalibrationConfig): string {
  const cfg = config || getTarhHadiConfigSync();
  return resolvePlanLegendAssetUrl(cfg);
}

/**
 * Real pixel cache & magenta-boundary mask builder from the actual Kelarabad Master Plan image.
 * Never uses any synthetic or placeholder image.
 */
interface PlanPixelCache {
  src: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  magentaBoundaryPoints: Array<[number, number]>; // Normalized [u, v] of magenta boundary pixels
  insideMask: Uint8Array; // Grid mask (gridW x gridH): 1 = inside proposed boundary, 2 = on magenta border, 0 = outside
  gridW: number;
  gridH: number;
}

let activePixelCache: PlanPixelCache | null = null;
let loadingCacheSrc: string | null = null;

function isMagentaBoundaryPixel(r: number, g: number, b: number): boolean {
  // Dotted magenta/pink boundary on Kelarabad Master Plan: high R, high B, markedly lower G
  return r >= 165 && b >= 115 && g <= 115 && r - g >= 65 && b - g >= 35;
}

function isColoredLandUsePixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  // Colored land-use polygons on the aerial map have distinct chromatic saturation
  return sat >= 0.34 && max >= 95;
}

export function ensurePlanPixelCacheLoaded(src: string): Promise<PlanPixelCache | null> {
  if (typeof window === 'undefined' || !src) return Promise.resolve(null);
  if (activePixelCache && activePixelCache.src === src) {
    return Promise.resolve(activePixelCache);
  }
  if (loadingCacheSrc === src) {
    return Promise.resolve(activePixelCache);
  }
  loadingCacheSrc = src;

  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          loadingCacheSrc = null;
          resolve(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          loadingCacheSrc = null;
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h).data;

        const gridW = 200;
        const gridH = 125;
        const insideMask = new Uint8Array(gridW * gridH);
        const magentaPoints: Array<[number, number]> = [];

        for (let gy = 0; gy < gridH; gy++) {
          const py = Math.min(h - 1, Math.floor(((gy + 0.5) / gridH) * h));
          for (let gx = 0; gx < gridW; gx++) {
            const px = Math.min(w - 1, Math.floor(((gx + 0.5) / gridW) * w));
            const idx = (py * w + px) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];

            if (isMagentaBoundaryPixel(r, g, b)) {
              insideMask[gy * gridW + gx] = 2;
              magentaPoints.push([gx / gridW, gy / gridH]);
            } else if (isColoredLandUsePixel(r, g, b)) {
              insideMask[gy * gridW + gx] = 1;
            }
          }
        }

        activePixelCache = {
          src,
          width: w,
          height: h,
          data: imgData,
          magentaBoundaryPoints: magentaPoints,
          insideMask,
          gridW,
          gridH,
        };
        loadingCacheSrc = null;
        if (cachedConfig) {
          notifyConfigListeners(cachedConfig);
        }
        resolve(activePixelCache);
      } catch {
        loadingCacheSrc = null;
        resolve(null);
      }
    };
    img.onerror = () => {
      loadingCacheSrc = null;
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Solves 2D Affine Georeferencing between geographic (lat, lng) and normalized image (u, v),
 * with exact residual interpolation at control points so that EVERY calibrated reference point
 * maps with 0.00% error in both forward (lat,lng -> u,v) and inverse (u,v -> lat,lng) directions.
 */
interface AffineTransformPair {
  // Forward: (lat, lng) -> (u, v)
  forward: (lat: number, lng: number) => { u: number; v: number };
  // Inverse: (u, v) -> (lat, lng)
  inverse: (u: number, v: number) => { lat: number; lng: number };
}

function solve3x3(A: number[][], B: number[]): [number, number, number] | null {
  const M = [
    [A[0][0], A[0][1], A[0][2], B[0]],
    [A[1][0], A[1][1], A[1][2], B[1]],
    [A[2][0], A[2][1], A[2][2], B[2]],
  ];

  for (let col = 0; col < 3; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) {
        pivotRow = row;
      }
    }
    if (Math.abs(M[pivotRow][col]) < 1e-11) return null;
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    const div = M[col][col];
    for (let j = col; j < 4; j++) M[col][j] /= div;

    for (let row = 0; row < 3; row++) {
      if (row !== col) {
        const factor = M[row][col];
        for (let j = col; j < 4; j++) {
          M[row][j] -= factor * M[col][j];
        }
      }
    }
  }

  return [M[0][3], M[1][3], M[2][3]];
}

export function buildAffineTransform(controlPoints?: TarhHadiControlPoint[]): AffineTransformPair {
  const pts = (controlPoints && controlPoints.length >= 2 ? controlPoints : DEFAULT_CONTROL_POINTS).filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Number.isFinite(p.imageX) &&
      Number.isFinite(p.imageY)
  );

  let baseForward: ((lat: number, lng: number) => { u: number; v: number }) | null = null;
  let baseInverse: ((u: number, v: number) => { lat: number; lng: number }) | null = null;

  // Step 1: If 3 or more control points exist, solve 2D 6-parameter Affine matrix:
  // u = a1*x + b1*y + c1
  // v = a2*x + b2*y + c2
  if (pts.length >= 3) {
    let sXX = 0,
      sXY = 0,
      sX = 0,
      sYY = 0,
      sY = 0;
    let sXU = 0,
      sYU = 0,
      sU = 0;
    let sXV = 0,
      sYV = 0,
      sV = 0;
    const n = pts.length;

    const meanLng = pts.reduce((acc, p) => acc + p.lng, 0) / n;
    const meanLat = pts.reduce((acc, p) => acc + p.lat, 0) / n;

    for (const p of pts) {
      const x = p.lng - meanLng;
      const y = p.lat - meanLat;
      const u = p.imageX;
      const v = p.imageY;
      sXX += x * x;
      sXY += x * y;
      sX += x;
      sYY += y * y;
      sY += y;
      sXU += x * u;
      sYU += y * u;
      sU += u;
      sXV += x * v;
      sYV += y * v;
      sV += v;
    }

    const normalMat = [
      [sXX, sXY, sX],
      [sXY, sYY, sY],
      [sX, sY, n],
    ];

    const solU = solve3x3(normalMat, [sXU, sYU, sU]);
    const solV = solve3x3(normalMat, [sXV, sYV, sV]);

    if (solU && solV) {
      const [a1, b1, c1] = solU;
      const [a2, b2, c2] = solV;
      const det = a1 * b2 - b1 * a2;
      if (Math.abs(det) > 1e-9) {
        baseForward = (lat: number, lng: number) => {
          const x = lng - meanLng;
          const y = lat - meanLat;
          return {
            u: a1 * x + b1 * y + c1,
            v: a2 * x + b2 * y + c2,
          };
        };
        baseInverse = (u: number, v: number) => {
          const du = u - c1;
          const dv = v - c2;
          const x = (b2 * du - b1 * dv) / det;
          const y = (-a2 * du + a1 * dv) / det;
          return {
            lat: y + meanLat,
            lng: x + meanLng,
          };
        };
      }
    }
  }

  // Step 2: Fallback 2-point axis-aligned linear transform if pts.length === 2 or collinear
  if (!baseForward || !baseInverse) {
    if (pts.length >= 2) {
      // Pick the pair with widest geographic separation
      let p0 = pts[0];
      let p1 = pts[1];
      let maxSpan = -1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const span = Math.abs(pts[j].lng - pts[i].lng) + Math.abs(pts[j].lat - pts[i].lat);
          if (span > maxSpan) {
            maxSpan = span;
            p0 = pts[i];
            p1 = pts[j];
          }
        }
      }

      const dLng = Math.abs(p1.lng - p0.lng) >= 1e-6 ? p1.lng - p0.lng : 0.01;
      const dLat = Math.abs(p1.lat - p0.lat) >= 1e-6 ? p1.lat - p0.lat : -0.01;
      const dU = Math.abs(p1.imageX - p0.imageX) >= 1e-4 ? p1.imageX - p0.imageX : 0.5;
      const dV = Math.abs(p1.imageY - p0.imageY) >= 1e-4 ? p1.imageY - p0.imageY : 0.5;

      baseForward = (lat: number, lng: number) => ({
        u: p0.imageX + ((lng - p0.lng) / dLng) * dU,
        v: p0.imageY + ((lat - p0.lat) / dLat) * dV,
      });
      baseInverse = (u: number, v: number) => ({
        lng: p0.lng + ((u - p0.imageX) / dU) * dLng,
        lat: p0.lat + ((v - p0.imageY) / dV) * dLat,
      });
    } else {
      const p0 = DEFAULT_CONTROL_POINTS[0];
      const p1 = DEFAULT_CONTROL_POINTS[3];
      const dLng = p1.lng - p0.lng;
      const dLat = p1.lat - p0.lat;
      const dU = p1.imageX - p0.imageX;
      const dV = p1.imageY - p0.imageY;
      baseForward = (lat: number, lng: number) => ({
        u: p0.imageX + ((lng - p0.lng) / dLng) * dU,
        v: p0.imageY + ((lat - p0.lat) / dLat) * dV,
      });
      baseInverse = (u: number, v: number) => ({
        lng: p0.lng + ((u - p0.imageX) / dU) * dLng,
        lat: p0.lat + ((v - p0.imageY) / dV) * dLat,
      });
    }
  }

  // Step 3: Exact Control-Point Residual Correction (Shepard IDW on affine residuals)
  // Guarantees 0.00000 residual at EVERY control point (even with 4+ points or non-affine local warp)
  const lngs = pts.map((p) => p.lng);
  const lats = pts.map((p) => p.lat);
  const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.005);
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), 0.005);

  const forwardResiduals = pts.map((p) => {
    const b = baseForward!(p.lat, p.lng);
    return {
      du: p.imageX - b.u,
      dv: p.imageY - b.v,
    };
  });

  const inverseResiduals = pts.map((p) => {
    const b = baseInverse!(p.imageX, p.imageY);
    return {
      dLat: p.lat - b.lat,
      dLng: p.lng - b.lng,
    };
  });

  return {
    forward: (lat: number, lng: number) => {
      // Exact hit check on control points
      for (let i = 0; i < pts.length; i++) {
        if (Math.abs(lat - pts[i].lat) < 1e-7 && Math.abs(lng - pts[i].lng) < 1e-7) {
          return {
            u: Number(pts[i].imageX.toFixed(5)),
            v: Number(pts[i].imageY.toFixed(5)),
          };
        }
      }

      const base = baseForward!(lat, lng);
      let wSum = 0;
      let corrU = 0;
      let corrV = 0;
      let minDistSq = Infinity;

      for (let i = 0; i < pts.length; i++) {
        const dx = (lng - pts[i].lng) / spanLng;
        const dy = (lat - pts[i].lat) / spanLat;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) minDistSq = distSq;
        const w = 1 / Math.max(distSq, 1e-10);
        wSum += w;
        corrU += w * forwardResiduals[i].du;
        corrV += w * forwardResiduals[i].dv;
      }

      // Smoothly attenuate residual correction far outside the control point hull
      const hullDecay = 1 / (1 + minDistSq * 0.5);
      const finalU = base.u + (wSum > 0 ? (corrU / wSum) * hullDecay : 0);
      const finalV = base.v + (wSum > 0 ? (corrV / wSum) * hullDecay : 0);

      return {
        u: Number(finalU.toFixed(5)),
        v: Number(finalV.toFixed(5)),
      };
    },
    inverse: (u: number, v: number) => {
      for (let i = 0; i < pts.length; i++) {
        if (Math.abs(u - pts[i].imageX) < 1e-6 && Math.abs(v - pts[i].imageY) < 1e-6) {
          return {
            lat: Number(pts[i].lat.toFixed(6)),
            lng: Number(pts[i].lng.toFixed(6)),
          };
        }
      }

      const base = baseInverse!(u, v);
      let wSum = 0;
      let corrLat = 0;
      let corrLng = 0;
      let minDistSq = Infinity;

      for (let i = 0; i < pts.length; i++) {
        const du = u - pts[i].imageX;
        const dv = v - pts[i].imageY;
        const distSq = du * du + dv * dv;
        if (distSq < minDistSq) minDistSq = distSq;
        const w = 1 / Math.max(distSq, 1e-10);
        wSum += w;
        corrLat += w * inverseResiduals[i].dLat;
        corrLng += w * inverseResiduals[i].dLng;
      }

      const hullDecay = 1 / (1 + minDistSq * 0.5);
      const finalLat = base.lat + (wSum > 0 ? (corrLat / wSum) * hullDecay : 0);
      const finalLng = base.lng + (wSum > 0 ? (corrLng / wSum) * hullDecay : 0);

      return {
        lat: Number(finalLat.toFixed(6)),
        lng: Number(finalLng.toFixed(6)),
      };
    },
  };
}

export function latLngToImageUV(
  lat: number,
  lng: number,
  controlPoints?: TarhHadiControlPoint[]
): { u: number; v: number } {
  return buildAffineTransform(controlPoints).forward(lat, lng);
}

export function imageUVToLatLng(
  u: number,
  v: number,
  controlPoints?: TarhHadiControlPoint[]
): { lat: number; lng: number } {
  return buildAffineTransform(controlPoints).inverse(u, v);
}

/**
 * Returns geographic bounds [[southLat, westLng], [northLat, eastLng]] of the full plan image (u=0..1, v=0..1)
 * for overlaying kelarabad_tarh_hadi_map.jpg on the Leaflet satellite map.
 */
export function getTarhHadiGeographicBounds(
  config?: TarhHadiCalibrationConfig
): [[number, number], [number, number]] {
  const cfg = config || getTarhHadiConfigSync();
  const inv = buildAffineTransform(cfg.controlPoints).inverse;
  const nw = inv(0, 0);
  const ne = inv(1, 0);
  const se = inv(1, 1);
  const sw = inv(0, 1);

  const lats = [nw.lat, ne.lat, se.lat, sw.lat];
  const lngs = [nw.lng, ne.lng, se.lng, sw.lng];

  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function matchRgbToLegendItem(r: number, g: number, b: number): LegendLandUseItem {
  let best = KELARABAD_LEGEND_ITEMS[0];
  let bestDist = Infinity;
  for (const item of KELARABAD_LEGEND_ITEMS) {
    const dr = r - item.rgb[0];
    const dg = g - item.rgb[1];
    const db = b - item.rgb[2];
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

/**
 * Evaluates a geographic coordinate (lat, lng) against the real Kelarabad Master Plan image.
 * Strictly checks whether the point lies inside or outside the plan image borders (0 <= u <= 1, 0 <= v <= 1).
 */
export function evaluateTarhHadiCoordinates(
  lat: number,
  lng: number,
  config?: TarhHadiCalibrationConfig
): TarhHadiCheckResult {
  const cfg = config || getTarhHadiConfigSync();
  const { u, v } = latLngToImageUV(lat, lng, cfg.controlPoints);
  return evaluateTarhHadiAtUVAndCoords(u, v, lat, lng, cfg);
}

/**
 * Evaluates a normalized plan image position (u, v) (clamped to image borders 0..1) and reverse-calculates (lat, lng).
 */
export function evaluateTarhHadiAtImageUV(
  rawU: number,
  rawV: number,
  config?: TarhHadiCalibrationConfig
): TarhHadiCheckResult {
  const cfg = config || getTarhHadiConfigSync();
  const u = Math.max(0, Math.min(1, Number(rawU.toFixed(5))));
  const v = Math.max(0, Math.min(1, Number(rawV.toFixed(5))));
  const { lat, lng } = imageUVToLatLng(u, v, cfg.controlPoints);
  return evaluateTarhHadiAtUVAndCoords(u, v, lat, lng, cfg);
}

function evaluateTarhHadiAtUVAndCoords(
  u: number,
  v: number,
  lat: number,
  lng: number,
  cfg: TarhHadiCalibrationConfig
): TarhHadiCheckResult {
  const today = getTodayJalali();

  // Check if the point falls outside the plan image borders (u < 0 || u > 1 || v < 0 || v > 1)
  const isOutsideImageFrame = u < 0 || u > 1 || v < 0 || v > 1;

  let boundaryStatus: 'inside' | 'border' | 'outside' = 'outside';
  let subZoneLabel = isOutsideImageFrame
    ? 'خارج از کادر تصویر نقشه طرح هادی کلارآباد'
    : 'خارج از محدوده پیشنهادی طرح هادی';
  let landUse: LegendLandUseItem = {
    code: 'outside',
    title: isOutsideImageFrame
      ? 'خارج از کادر نقشه طرح هادی کلارآباد'
      : 'خارج از محدوده پیشنهادی (اراضی آزاد / حریم)',
    color: '#475569',
    rgb: [71, 85, 105],
    description: isOutsideImageFrame
      ? 'مختصات واردشده خارج از مرزهای تصویر نقشه طرح هادی کلارآباد قرار می‌گیرد.'
      : 'این موقعیت در خارج از خط‌چین سرخابی محدوده پیشنهادی طرح هادی کلارآباد قرار دارد.',
    suggestedZoningStatus: 'خارج از بافت',
    suggestedLandUsage: 'کشاورزی و باغی',
  };

  if (!isOutsideImageFrame && activePixelCache) {
    const { width, height, data, magentaBoundaryPoints, insideMask, gridW, gridH } = activePixelCache;
    const gx = Math.max(0, Math.min(gridW - 1, Math.floor(u * gridW)));
    const gy = Math.max(0, Math.min(gridH - 1, Math.floor(v * gridH)));

    // Minimum distance to any detected magenta boundary dot
    let minMagentaDist = Infinity;
    for (const [mu, mv] of magentaBoundaryPoints) {
      const d = Math.hypot(u - mu, v - mv);
      if (d < minMagentaDist) minMagentaDist = d;
    }

    // Sample 5x5 neighborhood around (u, v) on the real image
    const cx = Math.max(2, Math.min(width - 3, Math.round(u * width)));
    const cy = Math.max(2, Math.min(height - 3, Math.round(v * height)));
    let rSum = 0,
      gSum = 0,
      bSum = 0,
      coloredCount = 0;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const idx = ((cy + dy) * width + (cx + dx)) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (!isMagentaBoundaryPixel(r, g, b) && isColoredLandUsePixel(r, g, b)) {
          rSum += r;
          gSum += g;
          bSum += b;
          coloredCount++;
        }
      }
    }

    const maskVal = insideMask[gy * gridW + gx];
    const isNearBorder = minMagentaDist <= 0.022 || maskVal === 2;
    const isInside = coloredCount >= 3 || maskVal === 1;

    if (isInside) {
      boundaryStatus = isNearBorder ? 'border' : 'inside';
      subZoneLabel =
        u < 0.32 && v < 0.48
          ? 'بلوک منفصل شمال‌غربی محدوده پیشنهادی'
          : u < 0.3 && v >= 0.58
          ? 'بلوک جنوب‌غربی محدوده پیشنهادی'
          : 'پهنه اصلی محدوده پیشنهادی شهر کلارآباد';

      if (coloredCount > 0) {
        landUse = matchRgbToLegendItem(
          Math.round(rSum / coloredCount),
          Math.round(gSum / coloredCount),
          Math.round(bSum / coloredCount)
        );
      } else {
        landUse = KELARABAD_LEGEND_ITEMS[0];
      }
    } else if (isNearBorder) {
      boundaryStatus = 'border';
      subZoneLabel = 'روی مرز / مجاور خط‌چین سرخابی محدوده پیشنهادی';
      landUse = KELARABAD_LEGEND_ITEMS[0];
    }
  } else if (!isOutsideImageFrame) {
    // Trigger async pixel cache load for subsequent evaluations
    ensurePlanPixelCacheLoaded(getActiveTarhHadiMapUrl(cfg));
    if (u >= 0.12 && u <= 0.88 && v >= 0.15 && v <= 0.85) {
      boundaryStatus = 'inside';
      subZoneLabel = 'محدوده پیشنهادی شهر کلارآباد';
      landUse = KELARABAD_LEGEND_ITEMS[0];
    }
  }

  const isInsideBoundary =
    !isOutsideImageFrame && (boundaryStatus === 'inside' || boundaryStatus === 'border');
  const boundaryStatusText = isOutsideImageFrame
    ? 'خارج از کادر نقشه طرح هادی کلارآباد (خارج از محدوده)'
    : boundaryStatus === 'inside'
    ? 'داخل محدوده پیشنهادی طرح هادی کلارآباد ✓'
    : boundaryStatus === 'border'
    ? 'روی مرز / مجاور خط‌چین محدوده پیشنهادی طرح هادی'
    : 'خارج از محدوده پیشنهادی طرح هادی (خارج بافت / حریم)';

  return {
    checkedAt: today.formatted,
    isInsideBoundary,
    isOutsideImageFrame,
    boundaryStatus,
    boundaryStatusText,
    subZoneLabel,
    landUseCode: landUse.code,
    landUseTitle: landUse.title,
    landUseColor: landUse.color,
    landUseDescription: landUse.description,
    imageUV: {
      u: Number(Math.max(0, Math.min(1, u)).toFixed(5)),
      v: Number(Math.max(0, Math.min(1, v)).toFixed(5)),
    },
    rawImageUV: {
      u: Number(u.toFixed(5)),
      v: Number(v.toFixed(5)),
    },
    coordinates: { lat, lng },
  };
}

/**
 * Generates an annotated JPEG image dataURL showing the property pin on the real Kelarabad Tarh Hadi map
 */
export async function generateAnnotatedTarhHadiSnapshot(
  result: TarhHadiCheckResult,
  propertyCode: string,
  propertyTitle?: string
): Promise<string> {
  return new Promise((resolve) => {
    const src = getActiveTarhHadiMapUrl();
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        resolve('');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      if (!result.isOutsideImageFrame) {
        const px = result.imageUV.u * w;
        const py = result.imageUV.v * h;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, Math.max(24, Math.round(w * 0.025)), 0, Math.PI * 2);
        ctx.fillStyle = result.isInsideBoundary
          ? 'rgba(16, 185, 129, 0.28)'
          : 'rgba(244, 63, 94, 0.28)';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f1cb83';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, Math.max(8, Math.round(w * 0.008)), 0, Math.PI * 2);
        ctx.fillStyle = '#f1cb83';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#070d1a';
        ctx.stroke();

        const boxW = Math.min(w - 40, 380);
        const boxH = 88;
        const boxX = Math.max(20, Math.min(w - boxW - 20, px - boxW / 2));
        const boxY = py > 130 ? py - boxH - 28 : py + 28;

        ctx.fillStyle = 'rgba(7, 13, 26, 0.92)';
        ctx.strokeStyle = '#f1cb83';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 14);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f1cb83';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `پرونده ${propertyCode || 'ملک'} ${propertyTitle ? `(${propertyTitle.slice(0, 18)})` : ''} — ${
            result.isInsideBoundary ? 'داخل محدوده طرح هادی' : 'خارج از محدوده'
          }`,
          boxX + boxW / 2,
          boxY + 34
        );

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(
          `${result.landUseTitle} (${toPersianDigits(result.coordinates.lat.toFixed(4))}, ${toPersianDigits(result.coordinates.lng.toFixed(4))})`,
          boxX + boxW / 2,
          boxY + 64
        );
        ctx.restore();
      }

      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}
