import React, { useState, useRef, useEffect } from 'react';
import {
  TarhHadiCalibrationConfig,
  TarhHadiControlPoint,
  DEFAULT_CONTROL_POINTS,
  getActiveTarhHadiMapUrl,
  getTarhHadiConfigSync,
  saveTarhHadiConfig,
  subscribeTarhHadiConfig,
  evaluateTarhHadiCoordinates,
  ensurePlanPixelCacheLoaded,
  uploadAndSaveTarhHadiAsset,
  hasCustomPlanMapAsset,
  hasCustomPlanLegendAsset,
} from '../services/kelarabadTarhHadi';
import { parseMapLocationSync, resolveAndParseMapInput } from '../utils/mapLinkParser';
import { openMapChooser } from './MapAppChooserModal';
import { toPersianDigits } from '../utils/jalali';
import { KelarabadTarhHadiViewerModal } from './KelarabadTarhHadiModal';
import { MapView } from '../views/MapView';

interface KelarabadSettingsPanelProps {
  config: TarhHadiCalibrationConfig;
  userRole: string;
  userName: string;
  onConfigSaved: (updated: TarhHadiCalibrationConfig) => void;
  onShowToast: (msg: string) => void;
  onOpenSatelliteMapWithOverlay?: () => void;
  onPickControlPointOnSatelliteMap?: (
    pointId: string,
    initialCoords: { lat: number; lng: number }
  ) => void;
}

export const KelarabadSettingsPanel: React.FC<KelarabadSettingsPanelProps> = ({
  config,
  userRole,
  userName,
  onConfigSaved,
  onShowToast,
  onOpenSatelliteMapWithOverlay,
}) => {
  const isAdmin = userRole === 'مدیر';
  const [controlPoints, setControlPoints] = useState<TarhHadiControlPoint[]>(
    config.controlPoints?.length >= 2 ? config.controlPoints : DEFAULT_CONTROL_POINTS
  );
  const [activePointId, setActivePointId] = useState<string>(
    controlPoints[0]?.id || 'cp-1'
  );
  const [customMapBlobRef, setCustomMapBlobRef] = useState<string | undefined>(
    config.customMapBlobRef
  );
  const [customLegendBlobRef, setCustomLegendBlobRef] = useState<string | undefined>(
    config.customLegendBlobRef
  );
  const [resolvingPointId, setResolvingPointId] = useState<string | null>(null);
  const [isResolvingTestInput, setIsResolvingTestInput] = useState(false);
  const [pointNotice, setPointNotice] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [showTestPinOnPreview, setShowTestPinOnPreview] = useState<boolean>(true);

  // In-place Satellite Map Picker state (for Reference Points or Live Test)
  const [satellitePickTarget, setSatellitePickTarget] = useState<
    | { type: 'control-point'; pointId: string; initialCoords: { lat: number; lng: number }; label: string }
    | { type: 'test-pin'; initialCoords: { lat: number; lng: number } }
    | null
  >(null);

  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);

  // Sync when parent config or central store updates
  useEffect(() => {
    if (config.controlPoints?.length >= 2) {
      setControlPoints(config.controlPoints);
    }
    setCustomMapBlobRef(config.customMapBlobRef);
    setCustomLegendBlobRef(config.customLegendBlobRef);
  }, [config]);

  useEffect(() => {
    return subscribeTarhHadiConfig((updated) => {
      if (updated.controlPoints?.length >= 2) {
        setControlPoints(updated.controlPoints);
      }
      setCustomMapBlobRef(updated.customMapBlobRef);
      setCustomLegendBlobRef(updated.customLegendBlobRef);
    });
  }, []);

  // Quick test coordinates inside Settings
  const [testInput, setTestInput] = useState<string>('36.651042 , 51.201089');
  const [testCoords, setTestCoords] = useState<{ lat: number; lng: number }>({
    lat: 36.651042,
    lng: 51.201089,
  });

  // Fullscreen modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTab, setViewerTab] = useState<'map' | 'legend'>('map');

  const mapFileInputRef = useRef<HTMLInputElement | null>(null);
  const legendFileInputRef = useRef<HTMLInputElement | null>(null);

  const previewConfig: TarhHadiCalibrationConfig = {
    ...getTarhHadiConfigSync(),
    ...config,
    customMapBlobRef,
    customLegendBlobRef,
    controlPoints,
  };

  const mapUrl = getActiveTarhHadiMapUrl(previewConfig);
  const testResult = evaluateTarhHadiCoordinates(testCoords.lat, testCoords.lng, previewConfig);

  useEffect(() => {
    setMapLoadError(false);
  }, [mapUrl]);

  const persistControlPointsChange = async (nextPoints: TarhHadiControlPoint[]) => {
    setControlPoints(nextPoints);
    const latestBase = getTarhHadiConfigSync();
    const nextCfg: TarhHadiCalibrationConfig = {
      ...latestBase,
      customMapBlobRef: customMapBlobRef ?? latestBase.customMapBlobRef,
      customLegendBlobRef: customLegendBlobRef ?? latestBase.customLegendBlobRef,
      controlPoints: nextPoints,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    await saveTarhHadiConfig(nextCfg);
    onConfigSaved(nextCfg);
  };

  const updatePointUVFromClientXY = (
    pointId: string,
    clientX: number,
    clientY: number,
    commitToDb: boolean
  ) => {
    const targetEl = previewImgRef.current || previewBoxRef.current;
    if (!isAdmin || mapLoadError || !targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const u = Number(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)).toFixed(4));
    const v = Number(Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)).toFixed(4));

    const nextPoints = controlPoints.map((cp) =>
      cp.id === pointId ? { ...cp, imageX: u, imageY: v } : cp
    );
    setControlPoints(nextPoints);

    if (commitToDb) {
      persistControlPointsChange(nextPoints);
      const idx = nextPoints.findIndex((cp) => cp.id === pointId);
      setPointNotice(
        `محل نقطه مرجع ${toPersianDigits(idx >= 0 ? idx + 1 : 1)} روی تصویر نقشه ثبت شد: X=${toPersianDigits(
          Math.round(u * 100)
        )}% , Y=${toPersianDigits(Math.round(v * 100))}% ✓`
      );
    }
  };

  const handlePointCoordInput = async (pointId: string, rawText: string) => {
    if (!isAdmin) return;
    const withRaw = controlPoints.map((cp) =>
      cp.id === pointId ? { ...cp, rawInput: rawText } : cp
    );
    setControlPoints(withRaw);

    const syncParsed = parseMapLocationSync(rawText);
    if (syncParsed.success && syncParsed.coords) {
      const updated = withRaw.map((cp) =>
        cp.id === pointId
          ? {
              ...cp,
              lat: syncParsed.coords!.lat,
              lng: syncParsed.coords!.lng,
              rawInput: /https?:\/\/|geo:|@/i.test(rawText)
                ? syncParsed.formatted!
                : rawText,
            }
          : cp
      );
      await persistControlPointsChange(updated);
      if (/https?:\/\/|geo:|@/i.test(rawText)) {
        setPointNotice('لینک نقشه با موفقیت به مختصات نقطه مرجع تبدیل شد ✓');
      }
      return;
    }

    if (/https?:\/\//i.test(rawText)) {
      setResolvingPointId(pointId);
      const resolved = await resolveAndParseMapInput(rawText);
      setResolvingPointId(null);
      if (resolved.success && resolved.coords) {
        const updated = withRaw.map((cp) =>
          cp.id === pointId
            ? {
                ...cp,
                lat: resolved.coords!.lat,
                lng: resolved.coords!.lng,
                rawInput: resolved.formatted!,
              }
            : cp
        );
        await persistControlPointsChange(updated);
        setPointNotice('لینک کوتاه نقشه بازگشایی و مختصات نقطه مرجع ثبت شد ✓');
      }
    }
  };

  const handlePasteForPoint = async (pointId: string) => {
    if (!isAdmin || !navigator.clipboard?.readText) return;
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        await handlePointCoordInput(pointId, clip.trim());
      }
    } catch {
      setPointNotice('لطفاً مختصات یا لینک نقشه را در کادر مربوطه Paste کنید.');
    }
  };

  const handleGpsForPoint = (pointId: string) => {
    if (!isAdmin || !navigator.geolocation) {
      setPointNotice('مرورگر از موقعیت‌یاب GPS پشتیبانی نمی‌کند.');
      return;
    }
    setResolvingPointId(pointId);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setResolvingPointId(null);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const formatted = `${lat.toFixed(6)} , ${lng.toFixed(6)}`;
        const nextPoints = controlPoints.map((cp) =>
          cp.id === pointId ? { ...cp, lat, lng, rawInput: formatted } : cp
        );
        await persistControlPointsChange(nextPoints);
        setPointNotice('موقعیت فعلی GPS برای نقطه مرجع ثبت شد ✓');
      },
      () => {
        setResolvingPointId(null);
        setPointNotice('خطا در دریافت موقعیت GPS؛ لطفاً دسترسی مکان را بررسی کنید.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAddControlPoint = async () => {
    if (!isAdmin) return;
    const nextIdx = controlPoints.length + 1;
    const newId = `cp-${Date.now()}`;
    const newPoint: TarhHadiControlPoint = {
      id: newId,
      label: `نقطه مرجع ${toPersianDigits(nextIdx)}`,
      imageX: 0.5,
      imageY: 0.5,
      lat: 36.652042,
      lng: 51.202289,
      rawInput: '36.652042 , 51.202289',
    };
    const nextPoints = [...controlPoints, newPoint];
    setActivePointId(newId);
    await persistControlPointsChange(nextPoints);
    setPointNotice(`نقطه مرجع ${toPersianDigits(nextIdx)} اضافه شد؛ محل آن را روی نقشه مشخص کنید.`);
  };

  const handleRemoveControlPoint = async (id: string) => {
    if (!isAdmin || controlPoints.length <= 2) return;
    const next = controlPoints.filter((cp) => cp.id !== id);
    if (activePointId === id && next[0]) {
      setActivePointId(next[0].id);
    }
    await persistControlPointsChange(next);
  };

  const handleUploadCustomAsset = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'map' | 'legend'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const updatedCfg = await uploadAndSaveTarhHadiAsset(file, kind, userName);
      setCustomMapBlobRef(updatedCfg.customMapBlobRef);
      setCustomLegendBlobRef(updatedCfg.customLegendBlobRef);
      onConfigSaved(updatedCfg);
      if (kind === 'map') {
        setMapLoadError(false);
        onShowToast('تصویر نقشه طرح هادی کلارآباد با موفقیت بارگذاری و ذخیره شد ✓');
      } else {
        onShowToast('تصویر راهنمای نقشه (Legend) با موفقیت بارگذاری و ذخیره شد ✓');
      }
    } catch {
      onShowToast('خطا در بارگذاری تصویر؛ لطفاً مجدداً تلاش کنید.');
    }
    e.target.value = '';
  };

  const handleTestInputChange = async (raw: string) => {
    setTestInput(raw);
    const parsed = parseMapLocationSync(raw);
    if (parsed.success && parsed.coords) {
      setTestCoords(parsed.coords);
      if (/https?:\/\/|geo:|@/i.test(raw)) {
        setTestInput(parsed.formatted!);
      }
      return;
    }
    if (/https?:\/\//i.test(raw)) {
      setIsResolvingTestInput(true);
      const res = await resolveAndParseMapInput(raw);
      setIsResolvingTestInput(false);
      if (res.success && res.coords) {
        setTestCoords(res.coords);
        setTestInput(res.formatted!);
      }
    }
  };

  const handlePasteTestInput = async () => {
    if (!navigator.clipboard?.readText) return;
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        await handleTestInputChange(clip.trim());
      }
    } catch {
      setPointNotice('لطفاً مختصات یا لینک نقشه را در کادر تست Paste کنید.');
    }
  };

  const handleSaveCalibration = async () => {
    if (!isAdmin) return;
    const latestBase = getTarhHadiConfigSync();
    const updated: TarhHadiCalibrationConfig = {
      ...latestBase,
      isCalibrated: true,
      isNotificationDismissed: true,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
      customMapBlobRef: customMapBlobRef ?? latestBase.customMapBlobRef,
      customLegendBlobRef: customLegendBlobRef ?? latestBase.customLegendBlobRef,
      controlPoints,
    };
    await saveTarhHadiConfig(updated);
    onConfigSaved(updated);
    onShowToast('کالیبراسیون نقشه طرح هادی کلارآباد با موفقیت ذخیره و فعال شد ✓');
  };

  const handleResetDefault = async () => {
    if (!isAdmin) return;
    setControlPoints(DEFAULT_CONTROL_POINTS);
    setActivePointId(DEFAULT_CONTROL_POINTS[0].id);
    setTestCoords({
      lat: DEFAULT_CONTROL_POINTS[2].lat,
      lng: DEFAULT_CONTROL_POINTS[2].lng,
    });
    setTestInput(DEFAULT_CONTROL_POINTS[2].rawInput || '36.651042 , 51.201089');
    const latestBase = getTarhHadiConfigSync();
    const updated: TarhHadiCalibrationConfig = {
      ...latestBase,
      isCalibrated: false,
      isNotificationDismissed: false,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
      customMapBlobRef: customMapBlobRef ?? latestBase.customMapBlobRef,
      customLegendBlobRef: customLegendBlobRef ?? latestBase.customLegendBlobRef,
      controlPoints: DEFAULT_CONTROL_POINTS,
    };
    await saveTarhHadiConfig(updated);
    onConfigSaved(updated);
    onShowToast('نقاط مرجع طرح هادی کلارآباد به حالت استاندارد بازنشانی شد');
  };

  const hasCustomMap = hasCustomPlanMapAsset(previewConfig);
  const hasCustomLegend = hasCustomPlanLegendAsset(previewConfig);

  return (
    <div
      id="kelarabad-tarh-hadi-settings"
      className="p-4 rounded-2xl bg-[#161f34]/85 border border-[#f1cb83]/40 shadow-xl space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#f1cb83]/15 border border-[#f1cb83]/40 flex items-center justify-center text-[#f1cb83] shrink-0">
            <span className="material-symbols-outlined text-[22px]">map</span>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#f1cb83] flex items-center gap-2">
              <span>طرح هادی کلارآباد (کالیبراسیون و کاربری اراضی)</span>
            </h3>
            <p className="text-[11px] text-[#b8c5f5]/80">
              تطبیق نقاط مرجع نقشه کاربری اراضی و خط‌چین سرخابی محدوده پیشنهادی کلارآباد
            </p>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 border ${
            config.isCalibrated
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
          }`}
        >
          {config.isCalibrated ? 'کالیبره‌شده ✓' : 'نیازمند کالیبراسیون'}
        </span>
      </div>

      {!isAdmin && (
        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-200 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">lock</span>
          <span>ویرایش نقاط کالیبراسیون طرح هادی مخصوص نقش «مدیر» است (حالت مشاهده).</span>
        </div>
      )}

      {/* Hidden File Inputs for Real Source Files */}
      <input
        ref={mapFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleUploadCustomAsset(e, 'map')}
      />
      <input
        ref={legendFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleUploadCustomAsset(e, 'legend')}
      />

      {/* Dedicated Image Upload Buttons (Plan & Legend) — Always accessible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => mapFileInputRef.current?.click()}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-[#091224]/90 hover:bg-[#f1cb83]/15 border border-[#f1cb83]/40 text-slate-100 text-xs font-extrabold flex items-center justify-between gap-2 cursor-pointer transition-all"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-[18px] text-[#f1cb83] shrink-0">
              upload_file
            </span>
            <span className="truncate">بارگذاری تصویر نقشه طرح هادی</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
              hasCustomMap
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-[#f1cb83]/20 text-[#f1cb83]'
            }`}
          >
            {hasCustomMap ? 'ذخیره‌شده ✓' : 'انتخاب تصویر'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => legendFileInputRef.current?.click()}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-[#091224]/90 hover:bg-[#f1cb83]/15 border border-[#f1cb83]/40 text-slate-100 text-xs font-extrabold flex items-center justify-between gap-2 cursor-pointer transition-all"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-[18px] text-[#f1cb83] shrink-0">
              image
            </span>
            <span className="truncate">بارگذاری تصویر راهنمای نقشه (Legend)</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
              hasCustomLegend
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-[#f1cb83]/20 text-[#f1cb83]'
            }`}
          >
            {hasCustomLegend ? 'ذخیره‌شده ✓' : 'انتخاب تصویر'}
          </span>
        </button>
      </div>

      {/* Interactive Map Canvas with Reference Point Pins + Live Test Pin */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs flex-wrap gap-1.5">
          <span className="text-slate-200 font-bold">
            ۱. انتخاب محل نقاط مرجع روی نقشه طرح هادی کلارآباد:
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTestPinOnPreview((v) => !v)}
              className={`min-h-[32px] px-2.5 py-0.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                showTestPinOnPreview
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                  : 'bg-white/5 border-white/15 text-slate-400'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">my_location</span>
              <span>نمایش پین تست روی نقشه</span>
            </button>
          </div>
        </div>

        {mapLoadError ? (
          <div className="p-5 rounded-xl border-2 border-dashed border-amber-400/50 bg-[#050b17] text-center space-y-3">
            <span className="material-symbols-outlined text-[34px] text-[#f1cb83]">upload_file</span>
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-extrabold text-[#f1cb83]">
                تصویر نقشه طرح هادی کلارآباد و راهنمای نقشه
              </h4>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                لطفاً فایل تصویر نقشه طرح هادی کلارآباد و راهنمای نقشه را انتخاب فرمایید تا در حافظه دائمی برنامه (IndexedDB) ذخیره شوند:
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => mapFileInputRef.current?.click()}
                className="gold-cta-sheen min-h-[44px] px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">map</span>
                <span>انتخاب تصویر نقشه طرح هادی</span>
              </button>
              <button
                type="button"
                onClick={() => legendFileInputRef.current?.click()}
                className="min-h-[44px] px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-[#f1cb83]/40 text-[#f1cb83] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">legend_toggle</span>
                <span>انتخاب تصویر راهنمای نقشه</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={previewBoxRef}
            dir="ltr"
            onPointerDown={(e) => {
              if (!isAdmin || draggingPointId) return;
              updatePointUVFromClientXY(activePointId, e.clientX, e.clientY, true);
            }}
            onPointerMove={(e) => {
              if (!isAdmin || !draggingPointId) return;
              updatePointUVFromClientXY(draggingPointId, e.clientX, e.clientY, false);
            }}
            onPointerUp={(e) => {
              if (!isAdmin || !draggingPointId) return;
              updatePointUVFromClientXY(draggingPointId, e.clientX, e.clientY, true);
              setDraggingPointId(null);
            }}
            onPointerCancel={() => setDraggingPointId(null)}
            className={`relative rounded-xl overflow-hidden border-2 border-[#f1cb83]/40 bg-[#050b17] select-none touch-none leading-none ${
              isAdmin ? 'cursor-crosshair' : 'cursor-default'
            }`}
          >
            <img
              ref={previewImgRef}
              src={mapUrl}
              alt="نقشه طرح هادی کلارآباد"
              draggable={false}
              onLoad={() => {
                setMapLoadError(false);
                ensurePlanPixelCacheLoaded(mapUrl);
              }}
              onError={() => setMapLoadError(true)}
              className="w-full h-auto block pointer-events-none"
            />

            {/* Exact Image-Bounds Overlay Layer */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Render Reference Control Point Pins (1, 2, 3, 4, ...) anchored with w-0 h-0 at exact (imageX, imageY) */}
              {controlPoints.map((cp, index) => {
                const isSelected = cp.id === activePointId;
                return (
                  <div
                    key={cp.id}
                    style={{
                      left: `${cp.imageX * 100}%`,
                      top: `${cp.imageY * 100}%`,
                    }}
                    className="absolute w-0 h-0 z-10 pointer-events-auto"
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setActivePointId(cp.id);
                        if (isAdmin && previewBoxRef.current) {
                          previewBoxRef.current.setPointerCapture(e.pointerId);
                          setDraggingPointId(cp.id);
                        }
                      }}
                      className={`absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full font-extrabold text-xs flex items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#f1cb83] text-[#070d1a] border-2 border-white ring-4 ring-[#f1cb83]/40 shadow-[0_0_18px_rgba(241,203,131,0.95)]'
                          : 'bg-[#070d1a]/95 text-[#f1cb83] border-2 border-[#f1cb83]'
                      }`}
                      title={cp.label}
                    >
                      {toPersianDigits(index + 1)}
                    </button>
                  </div>
                );
              })}

              {/* Render Live Calibration Test Pin on Settings Preview (zero-offset w-0 h-0 anchor) */}
              {showTestPinOnPreview && !testResult.isOutsideImageFrame && (
                <div
                  style={{
                    left: `${testResult.imageUV.u * 100}%`,
                    top: `${testResult.imageUV.v * 100}%`,
                  }}
                  className="absolute w-0 h-0 z-20 pointer-events-none"
                >
                  <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-emerald-400/25 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_16px_rgba(52,211,153,0.9)]">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#070d1a]" />
                  </div>
                  <div
                    dir="rtl"
                    className="absolute left-0 bottom-5 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-[#070d1a]/95 border border-emerald-400 text-emerald-300 text-[10px] font-extrabold whitespace-nowrap shadow-lg"
                  >
                    پین تست ({Math.round(testResult.imageUV.u * 100)}%,{' '}
                    {Math.round(testResult.imageUV.v * 100)}%)
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {pointNotice && (
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold text-center">
            {pointNotice}
          </div>
        )}

        {/* Quick View Fullscreen Map, Legend & Satellite Overlay Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setViewerTab('map');
              setViewerOpen(true);
            }}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-[#f1cb83]/15 border border-[#f1cb83]/30 text-[#f1cb83] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">fullscreen</span>
            <span>نمایش کامل نقشه طرح هادی</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewerTab('legend');
              setViewerOpen(true);
            }}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">
              legend_toggle
            </span>
            <span>مشاهده راهنمای نقشه (Legend)</span>
          </button>
          {onOpenSatelliteMapWithOverlay && (
            <button
              type="button"
              onClick={onOpenSatelliteMapWithOverlay}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[#f1cb83]/15 hover:bg-[#f1cb83]/25 border border-[#f1cb83]/45 text-[#f1cb83] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
              <span>انطباق روی نقشه ماهواره‌ای</span>
            </button>
          )}
        </div>
      </div>

      {/* Reference Control Points List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-200">
            ۲. مختصات جغرافیایی یا لینک نقشه نقاط مرجع ({toPersianDigits(controlPoints.length)} نقطه):
          </span>
          {isAdmin && (
            <button
              type="button"
              onClick={handleAddControlPoint}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#f1cb83]/15 hover:bg-[#f1cb83]/25 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold cursor-pointer"
            >
              + افزودن نقطه مرجع جدید
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {controlPoints.map((cp, idx) => {
            const isSelected = cp.id === activePointId;
            return (
              <div
                key={cp.id}
                onClick={() => setActivePointId(cp.id)}
                className={`p-3 rounded-xl border transition-all space-y-2 cursor-pointer ${
                  isSelected
                    ? 'bg-[#0a1328] border-[#f1cb83] shadow-[0_0_15px_rgba(241,203,131,0.15)]'
                    : 'bg-[#091224]/70 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-6 h-6 rounded-full bg-[#f1cb83] text-[#070d1a] font-extrabold text-xs flex items-center justify-center shrink-0">
                      {toPersianDigits(idx + 1)}
                    </span>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={cp.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        const next = controlPoints.map((item) =>
                          item.id === cp.id ? { ...item, label: val } : item
                        );
                        setControlPoints(next);
                      }}
                      onBlur={() => persistControlPointsChange(controlPoints)}
                      className="bg-transparent text-xs font-bold text-slate-100 outline-none w-full truncate"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <span
                      className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-white/5"
                      dir="ltr"
                    >
                      X:{Math.round(cp.imageX * 100)}% Y:{Math.round(cp.imageY * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTestCoords({ lat: cp.lat, lng: cp.lng });
                        setTestInput(`${cp.lat.toFixed(6)} , ${cp.lng.toFixed(6)}`);
                        setShowTestPinOnPreview(true);
                        setPointNotice(
                          `مختصات نقطه مرجع ${toPersianDigits(idx + 1)} در بخش تست نقطه‌یاب قرار گرفت ✓`
                        );
                      }}
                      className="min-h-[36px] px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      title="تست تطابق دقیق پین تست با این نقطه مرجع"
                    >
                      <span className="material-symbols-outlined text-[14px]">ads_click</span>
                      <span>تست نقطه</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePointId(cp.id);
                        setViewerTab('map');
                        setViewerOpen(true);
                      }}
                      className="min-h-[36px] px-2 py-1 rounded-lg bg-[#f1cb83]/15 border border-[#f1cb83]/35 text-[#f1cb83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      title="بزرگ‌نمایی نقشه طرح هادی و تعیین دقیق این نقطه مرجع"
                    >
                      <span className="material-symbols-outlined text-[15px]">zoom_in_map</span>
                      <span>روی نقشه بزرگ</span>
                    </button>
                    {isAdmin && controlPoints.length > 2 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveControlPoint(cp.id);
                        }}
                        className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center cursor-pointer"
                        title="حذف نقطه"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Coordinate / Map-link input reusing mapLinkParser */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                  <input
                    type="text"
                    dir="ltr"
                    disabled={!isAdmin}
                    value={cp.rawInput ?? `${cp.lat.toFixed(6)} , ${cp.lng.toFixed(6)}`}
                    onChange={(e) => handlePointCoordInput(cp.id, e.target.value)}
                    placeholder="36.688500 , 51.254500 یا لینک گوگل‌مپ / نشان / بلد"
                    className="glass-field flex-1 min-w-[180px] min-h-[44px] px-3 rounded-xl text-xs font-mono text-slate-100 text-left"
                  />
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePasteForPoint(cp.id);
                      }}
                      className="min-h-[44px] px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {resolvingPointId === cp.id ? 'progress_activity' : 'content_paste'}
                      </span>
                      <span>چسباندن</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGpsForPoint(cp.id);
                      }}
                      className="min-h-[44px] px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      title="ثبت موقعیت GPS فعلی برای این نقطه مرجع"
                    >
                      <span className="material-symbols-outlined text-[16px]">my_location</span>
                      <span>GPS</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSatellitePickTarget({
                          type: 'control-point',
                          pointId: cp.id,
                          initialCoords: { lat: cp.lat, lng: cp.lng },
                          label: `انتخاب موقعیت «${cp.label}» روی نقشه ماهواره‌ای`,
                        });
                      }}
                      className="min-h-[44px] px-2.5 rounded-xl bg-[#f1cb83]/15 hover:bg-[#f1cb83]/25 border border-[#f1cb83]/40 text-[#f1cb83] text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      title="انتخاب موقعیت این نقطه مرجع از روی نقشه ماهواره‌ای"
                    >
                      <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                      <span>از نقشه</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openMapChooser(cp.lat, cp.lng, {
                        title: cp.label,
                      });
                    }}
                    className="min-h-[44px] px-2.5 rounded-xl bg-white/5 border border-white/15 text-[#f1cb83] text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    title="نمایش در برنامه‌های نقشه"
                  >
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Calibration Tester inside Settings */}
      <div className="p-3.5 rounded-xl bg-[#091224]/90 border border-[#f1cb83]/30 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold text-[#f1cb83]">
            ۳. تست زنده نقطه‌یاب طرح هادی کلارآباد:
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {controlPoints.map((cp, idx) => (
              <button
                key={cp.id}
                type="button"
                onClick={() => {
                  setTestCoords({ lat: cp.lat, lng: cp.lng });
                  setTestInput(`${cp.lat.toFixed(6)} , ${cp.lng.toFixed(6)}`);
                  setShowTestPinOnPreview(true);
                }}
                className="min-h-[30px] px-2 py-0.5 rounded-lg bg-white/5 hover:bg-[#f1cb83]/20 border border-white/15 text-[10px] font-bold text-slate-200 cursor-pointer"
              >
                تست نقطه {toPersianDigits(idx + 1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
          <input
            type="text"
            dir="ltr"
            value={testInput}
            onChange={(e) => handleTestInputChange(e.target.value)}
            placeholder="مختصات یا لینک نقشه برای تست..."
            className="glass-field flex-1 min-w-[180px] min-h-[44px] px-3 rounded-xl text-xs font-mono text-slate-100 text-left"
          />
          <button
            type="button"
            onClick={handlePasteTestInput}
            className="min-h-[44px] px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              {isResolvingTestInput ? 'progress_activity' : 'content_paste'}
            </span>
            <span>چسباندن</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setSatellitePickTarget({
                type: 'test-pin',
                initialCoords: testCoords,
              })
            }
            className="min-h-[44px] px-2.5 rounded-xl bg-[#f1cb83]/15 hover:bg-[#f1cb83]/25 border border-[#f1cb83]/40 text-[#f1cb83] text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            title="انتخاب نقطه تست از روی نقشه ماهواره‌ای"
          >
            <span className="material-symbols-outlined text-[16px]">satellite_alt</span>
            <span>از نقشه</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewerTab('map');
              setViewerOpen(true);
            }}
            className="min-h-[44px] px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            title="مشاهده محل دقیق پین تست روی نقشه بزرگ طرح هادی"
          >
            <span className="material-symbols-outlined text-[16px]">zoom_in_map</span>
            <span>روی نقشه طرح</span>
          </button>
        </div>

        <div className="p-2.5 rounded-xl bg-[#050b17] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-5 h-5 rounded-md border border-white/40 shrink-0"
              style={{ backgroundColor: testResult.landUseColor }}
            />
            <span className="font-bold text-slate-100 truncate">{testResult.landUseTitle}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!testResult.isOutsideImageFrame && (
              <span
                className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono text-[#f1cb83]"
                dir="ltr"
              >
                X:{Math.round(testResult.imageUV.u * 100)}% Y:{Math.round(testResult.imageUV.v * 100)}%
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                testResult.isOutsideImageFrame
                  ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                  : testResult.isInsideBoundary
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              {testResult.isOutsideImageFrame
                ? 'خارج از کادر نقشه'
                : testResult.isInsideBoundary
                ? 'داخل محدوده پیشنهادی ✓'
                : 'خارج از محدوده'}
            </span>
          </div>
        </div>
      </div>

      {/* Save & Reset Buttons */}
      {isAdmin && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={handleSaveCalibration}
            className="gold-cta-sheen flex-1 min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">verified</span>
            <span>ذخیره کالیبراسیون طرح هادی کلارآباد</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefault}
            className="min-h-[46px] py-2.5 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            <span>بازنشانی نقاط</span>
          </button>
        </div>
      )}

      {/* Shared Fullscreen Plan Viewer Modal */}
      <KelarabadTarhHadiViewerModal
        isOpen={viewerOpen}
        initialTab={viewerTab}
        onClose={() => setViewerOpen(false)}
        checkResult={testResult}
        propertyCode="پین تست کالیبراسیون"
        controlPoints={controlPoints}
        activeControlPointId={activePointId}
        showReferencePointsByDefault={true}
        editableReferencePoints={isAdmin}
        allowPropertyPinPlacement={true}
        onSelectControlPoint={(id) => setActivePointId(id)}
        onUpdateControlPointUV={(id, u, v) => {
          const next = controlPoints.map((cp) =>
            cp.id === id ? { ...cp, imageX: u, imageY: v } : cp
          );
          persistControlPointsChange(next);
        }}
        onPickPropertyOnPlan={(evaluated) => {
          setTestCoords(evaluated.coordinates);
          setTestInput(
            `${evaluated.coordinates.lat.toFixed(6)} , ${evaluated.coordinates.lng.toFixed(6)}`
          );
        }}
        onAddControlPoint={handleAddControlPoint}
      />

      {/* In-Place Interactive Satellite Map Picker Modal (for Reference Points or Test Pin) */}
      {satellitePickTarget && (
        <MapView
          properties={[]}
          onOpenPropertyDetail={() => {}}
          onBack={() => setSatellitePickTarget(null)}
          pickMode={true}
          initialCoords={satellitePickTarget.initialCoords}
          calibratingPointId={
            satellitePickTarget.type === 'control-point'
              ? satellitePickTarget.pointId
              : undefined
          }
          pickLabel={
            satellitePickTarget.type === 'control-point'
              ? satellitePickTarget.label
              : 'انتخاب موقعیت برای تست زنده نقطه‌یاب طرح هادی'
          }
          onConfirmPickLocation={async (coords) => {
            if (satellitePickTarget.type === 'control-point') {
              const targetId = satellitePickTarget.pointId;
              const formatted = `${coords.lat.toFixed(6)} , ${coords.lng.toFixed(6)}`;
              const nextPoints = controlPoints.map((cp) =>
                cp.id === targetId
                  ? { ...cp, lat: coords.lat, lng: coords.lng, rawInput: formatted }
                  : cp
              );
              await persistControlPointsChange(nextPoints);
              const idx = nextPoints.findIndex((cp) => cp.id === targetId);
              setPointNotice(
                `مختصات نقطه مرجع ${toPersianDigits(
                  idx >= 0 ? idx + 1 : 1
                )} از روی نقشه ماهواره‌ای ثبت شد: ${formatted} ✓`
              );
              onShowToast('مختصات نقطه مرجع از روی نقشه ماهواره‌ای ثبت شد ✓');
            } else {
              const formatted = `${coords.lat.toFixed(6)} , ${coords.lng.toFixed(6)}`;
              setTestCoords(coords);
              setTestInput(formatted);
              setShowTestPinOnPreview(true);
              setPointNotice(`مختصات تست از روی نقشه ماهواره‌ای انتخاب شد: ${formatted} ✓`);
            }
            setSatellitePickTarget(null);
          }}
        />
      )}
    </div>
  );
};
