import React, { useState, useEffect } from 'react';

export interface MapChooserOptions {
  title?: string;
  onOpenInternalMap?: () => void;
}

interface MapAppChooserModalProps {
  lat?: number;
  lng?: number;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenInternalMap?: () => void;
}

type GlobalMapChooserRequest = {
  lat?: number;
  lng?: number;
  title?: string;
  onOpenInternalMap?: () => void;
};

let globalMapListener: ((req: GlobalMapChooserRequest | null) => void) | null = null;

/**
 * Reusable function to open the map app chooser bottom sheet from anywhere in the app.
 */
export function openMapChooser(
  lat?: number,
  lng?: number,
  options?: MapChooserOptions
): void {
  if (globalMapListener) {
    globalMapListener({
      lat,
      lng,
      title: options?.title || 'موقعیت ملک کلید',
      onOpenInternalMap: options?.onOpenInternalMap,
    });
  }
}

export const MapAppChooserModal: React.FC<MapAppChooserModalProps> = ({
  lat,
  lng,
  title = 'موقعیت ملک کلید',
  isOpen,
  onClose,
  onOpenInternalMap,
}) => {
  const [copiedNotice, setCopiedNotice] = useState(false);

  if (!isOpen) return null;

  const hasValidCoords =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat !== 0 &&
    lng !== 0;

  const targetLat = hasValidCoords ? lat! : 36.651042;
  const targetLng = hasValidCoords ? lng! : 51.201089;

  const apps = [
    {
      name: 'گوگل مپ (Google Maps)',
      subtitle: 'نمایش دقیق و مسیریابی در Google Maps',
      icon: 'map',
      url: hasValidCoords
        ? `https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLng}`
        : 'https://www.google.com/maps/@36.651042,51.201089,13z',
      color: '#34d399',
    },
    {
      name: 'گوگل ارث (Google Earth)',
      subtitle: 'نمای ماهواره‌ای سه‌بعدی زمین و عوارض طبیعی',
      icon: 'public',
      url: `https://earth.google.com/web/@${targetLat},${targetLng},120a,900d,35y,0h,0t,0r`,
      color: '#60a5fa',
    },
    {
      name: 'مسیریاب نشان (Neshan)',
      subtitle: 'نقشه و مسیریاب بومی ایران',
      icon: 'navigation',
      url: `https://nshn.ir/?lat=${targetLat}&lng=${targetLng}`,
      color: '#38bdf8',
    },
    {
      name: 'مسیریاب بلد (Balad)',
      subtitle: 'نقشه و مسیریاب شهری و جاده‌ای بلد',
      icon: 'explore',
      url: `https://balad.ir/location?latitude=${targetLat}&longitude=${targetLng}`,
      color: '#f1cb83',
    },
    {
      name: 'مسیریاب ویز (Waze)',
      subtitle: 'مسیریابی زنده ترافیکی Waze',
      icon: 'near_me',
      url: `https://waze.com/ul?ll=${targetLat},${targetLng}&navigate=yes`,
      color: '#a78bfa',
    },
    {
      name: 'اپل مپس (Apple Maps - iOS)',
      subtitle: 'مخصوص آیفون و آیپد (iOS)',
      icon: 'compass_calibration',
      url: `https://maps.apple.com/?ll=${targetLat},${targetLng}&q=${encodeURIComponent(title)}`,
      color: '#f472b6',
    },
    {
      name: 'نقشه وب (OpenStreetMap)',
      subtitle: 'بازگشایی مستقیم در مرورگر بدون نیاز به نصب برنامه',
      icon: 'travel_explore',
      url: `https://www.openstreetmap.org/?mlat=${targetLat}&mlon=${targetLng}#map=16/${targetLat}/${targetLng}`,
      color: '#fbbf24',
    },
    {
      name: 'انتخابگر بومی گوشی (geo: Intent)',
      subtitle: 'باز کردن لیست برنامه‌های نقشه نصب‌شده روی گوشی',
      icon: 'pin_drop',
      url: `geo:${targetLat},${targetLng}?q=${targetLat},${targetLng}(${encodeURIComponent(title)})`,
      color: '#f43f5e',
    },
  ];

  const handleNativeShare = async () => {
    const shareUrl = `https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLng}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title,
          text: `${title} (${targetLat.toFixed(6)}, ${targetLng.toFixed(6)})`,
          url: shareUrl,
        });
        onClose();
        return;
      } catch {}
    }
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2500);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl glass-panel p-4 sm:p-5 border-t sm:border border-[#f1cb83]/40 shadow-[0_-16px_48px_rgba(0,0,0,0.85)] text-right space-y-3.5 max-h-[88dvh] overflow-y-auto pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle for Mobile Bottom Sheet */}
        <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f1cb83]/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#f1cb83]/15 border border-[#f1cb83]/35 flex items-center justify-center text-[#f1cb83]">
              <span className="material-symbols-outlined text-[22px]">directions</span>
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-[#f1cb83]">باز کردن موقعیت روی نقشه</h3>
              <p className="text-[11px] text-slate-400">
                اپلیکیشن نقشه یا مسیریاب مورد نظر خود را انتخاب کنید
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Coordinates Badge */}
        <div className="px-3.5 py-2.5 rounded-xl bg-[#091224]/90 border border-[#f1cb83]/25 flex items-center justify-between text-xs">
          <span className="text-slate-300 font-medium">
            {hasValidCoords ? 'مختصات فعلی ملک:' : 'مختصات پیش‌فرض منطقه:'}
          </span>
          <span className="font-mono font-bold text-[#f1cb83]" dir="ltr">
            {targetLat.toFixed(6)} , {targetLng.toFixed(6)}
          </span>
        </div>

        {/* Optional In-App Map Picker / Viewer */}
        {onOpenInternalMap && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenInternalMap();
            }}
            className="w-full min-h-[48px] p-3 rounded-xl bg-gradient-to-r from-[#d4b06a]/25 to-[#f1cb83]/20 border border-[#f1cb83]/60 text-[#f1cb83] hover:bg-[#f1cb83]/30 active:scale-[0.99] transition-all flex items-center justify-between cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[22px] text-[#f1cb83]">
                edit_location_alt
              </span>
              <div className="text-right">
                <span className="text-xs font-extrabold block text-[#f1cb83]">
                  انتخاب / مشاهده روی نقشه داخلی کلید
                </span>
                <span className="text-[10px] text-slate-300 block">
                  جابجایی پین روی نقشه ماهواره‌ای داخل برنامه
                </span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">arrow_back</span>
          </button>
        )}

        {/* Map Apps List */}
        <div className="space-y-2">
          {apps.map((app, idx) => (
            <a
              key={idx}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full min-h-[52px] flex items-center justify-between p-3 rounded-xl bg-[#091224]/85 border border-white/10 hover:border-[#f1cb83]/50 hover:bg-[#f1cb83]/10 active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0"
                  style={{ color: app.color }}
                >
                  <span className="material-symbols-outlined text-[20px]">{app.icon}</span>
                </div>
                <div className="min-w-0 text-right">
                  <span className="text-xs font-bold text-slate-100 block truncate">{app.name}</span>
                  <span className="text-[10px] text-slate-400 block truncate">{app.subtitle}</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0 mr-2">
                open_in_new
              </span>
            </a>
          ))}
        </div>

        {/* Copy & Native Share Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText(`${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}`);
                setCopiedNotice(true);
                setTimeout(() => setCopiedNotice(false), 2500);
              } catch {}
            }}
            className="min-h-[46px] py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">content_copy</span>
            <span>{copiedNotice ? 'کپی شد ✓' : 'کپی مختصات'}</span>
          </button>

          <button
            type="button"
            onClick={handleNativeShare}
            className="min-h-[46px] py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">share</span>
            <span>اشتراک‌گذاری موقعیت</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Global host mounted once in App.tsx so `openMapChooser(lat, lng)` works from any view.
 */
export const GlobalMapChooserHost: React.FC = () => {
  const [request, setRequest] = useState<GlobalMapChooserRequest | null>(null);

  useEffect(() => {
    globalMapListener = (req) => setRequest(req);
    return () => {
      globalMapListener = null;
    };
  }, []);

  if (!request) return null;

  return (
    <MapAppChooserModal
      isOpen={true}
      lat={request.lat}
      lng={request.lng}
      title={request.title}
      onOpenInternalMap={request.onOpenInternalMap}
      onClose={() => setRequest(null)}
    />
  );
};
