import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TarhHadiCheckResult } from '../types';
import {
  KELARABAD_LEGEND_ITEMS,
  TarhHadiControlPoint,
  TarhHadiCalibrationConfig,
  getActiveTarhHadiMapUrl,
  getActiveTarhHadiLegendUrl,
  getTarhHadiConfigSync,
  saveTarhHadiConfig,
  subscribeTarhHadiConfig,
  evaluateTarhHadiCoordinates,
  evaluateTarhHadiAtImageUV,
  generateAnnotatedTarhHadiSnapshot,
  ensurePlanPixelCacheLoaded,
  uploadAndSaveTarhHadiAsset,
  hasCustomPlanMapAsset,
  hasCustomPlanLegendAsset,
} from '../services/kelarabadTarhHadi';
import { toPersianDigits } from '../utils/jalali';

interface KelarabadTarhHadiViewerModalProps {
  isOpen: boolean;
  initialTab?: 'map' | 'legend';
  onClose: () => void;
  checkResult?: TarhHadiCheckResult | null;
  propertyCode?: string;
  propertyTitle?: string;
  onAssetsUpdated?: () => void;
  // Reference points (Settings calibration & fullscreen inspection)
  controlPoints?: TarhHadiControlPoint[];
  activeControlPointId?: string;
  showReferencePointsByDefault?: boolean;
  editableReferencePoints?: boolean;
  onSelectControlPoint?: (pointId: string) => void;
  onUpdateControlPointUV?: (pointId: string, u: number, v: number) => void;
  onAddControlPoint?: () => void;
  // Property / Test pin interactive placement
  allowPropertyPinPlacement?: boolean;
  onPickPropertyOnPlan?: (result: TarhHadiCheckResult) => void;
}

export const KelarabadTarhHadiViewerModal: React.FC<KelarabadTarhHadiViewerModalProps> = ({
  isOpen,
  initialTab = 'map',
  onClose,
  checkResult,
  propertyCode,
  propertyTitle,
  onAssetsUpdated,
  controlPoints: propControlPoints,
  activeControlPointId: propActivePointId,
  showReferencePointsByDefault = false,
  editableReferencePoints = false,
  onSelectControlPoint,
  onUpdateControlPointUV,
  onAddControlPoint,
  allowPropertyPinPlacement = false,
  onPickPropertyOnPlan,
}) => {
  const [activeTab, setActiveTab] = useState<'map' | 'legend'>(initialTab);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);

  const [mapLoadError, setMapLoadError] = useState(false);
  const [legendLoadError, setLegendLoadError] = useState(false);
  const [liveConfig, setLiveConfig] = useState<TarhHadiCalibrationConfig>(() =>
    getTarhHadiConfigSync()
  );
  const [showRefPoints, setShowRefPoints] = useState<boolean>(
    showReferencePointsByDefault || editableReferencePoints
  );
  const [tapTargetMode, setTapTargetMode] = useState<'ref-point' | 'property-pin'>(
    editableReferencePoints ? 'ref-point' : 'property-pin'
  );
  const [internalActivePointId, setInternalActivePointId] = useState<string>(
    propActivePointId || liveConfig.controlPoints[0]?.id || 'cp-1'
  );
  const [viewerNotice, setViewerNotice] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageBoxRef = useRef<HTMLDivElement | null>(null);
  const mapImgRef = useRef<HTMLImageElement | null>(null);
  const mapInputRef = useRef<HTMLInputElement | null>(null);
  const legendInputRef = useRef<HTMLInputElement | null>(null);

  // Gesture tracking refs for pan + pinch-to-zoom + tap/marker-drag
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    movedDistance: number;
    draggingMarker:
      | { type: 'control-point'; id: string }
      | { type: 'property-pin' }
      | null;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    movedDistance: 0,
    draggingMarker: null,
  });

  const pinchStateRef = useRef<{
    active: boolean;
    initialDist: number;
    initialZoom: number;
    initialMidX: number;
    initialMidY: number;
    initialPanX: number;
    initialPanY: number;
  }>({
    active: false,
    initialDist: 0,
    initialZoom: 1,
    initialMidX: 0,
    initialMidY: 0,
    initialPanX: 0,
    initialPanY: 0,
  });

  // Subscribe to central Tarh Hadi config updates
  useEffect(() => {
    setLiveConfig(getTarhHadiConfigSync());
    return subscribeTarhHadiConfig((updated) => {
      setLiveConfig(updated);
    });
  }, []);

  useEffect(() => {
    if (propActivePointId) {
      setInternalActivePointId(propActivePointId);
    }
  }, [propActivePointId]);

  const mapUrl = getActiveTarhHadiMapUrl(liveConfig);
  const legendUrl = getActiveTarhHadiLegendUrl(liveConfig);

  useEffect(() => {
    setMapLoadError(false);
  }, [mapUrl]);

  useEffect(() => {
    setLegendLoadError(false);
  }, [legendUrl]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setMapLoadError(false);
      setLegendLoadError(false);
      setShowRefPoints(showReferencePointsByDefault || editableReferencePoints);
      setTapTargetMode(editableReferencePoints ? 'ref-point' : 'property-pin');
      setLiveConfig(getTarhHadiConfigSync());
    }
  }, [isOpen, initialTab, showReferencePointsByDefault, editableReferencePoints]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const showTempViewerNotice = useCallback((msg: string) => {
    setViewerNotice(msg);
    setTimeout(() => {
      setViewerNotice((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  /**
   * Clamps pan offsets (x, y) so at any zoom level the user can pan smoothly across
   * the entire zoomed image right up to all four image borders without losing the image.
   */
  const clampPan = useCallback(
    (nextX: number, nextY: number, targetZoom: number): { x: number; y: number } => {
      if (targetZoom <= 1) {
        return { x: 0, y: 0 };
      }
      const stageEl = stageRef.current;
      const boxEl = imageBoxRef.current;
      const stageW = stageEl?.clientWidth || 360;
      const stageH = stageEl?.clientHeight || 480;
      const baseW = boxEl?.offsetWidth || stageW;
      const baseH = boxEl?.offsetHeight || stageH;

      const scaledW = baseW * targetZoom;
      const scaledH = baseH * targetZoom;

      const maxX = Math.max((scaledW - stageW) / 2 + 48, (baseW * (targetZoom - 1)) / 2);
      const maxY = Math.max((scaledH - stageH) / 2 + 48, (baseH * (targetZoom - 1)) / 2);

      return {
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      };
    },
    []
  );

  const applyZoom = useCallback(
    (nextZoomRaw: number, focalClientX?: number, focalClientY?: number) => {
      const nextZoom = Math.max(1, Math.min(5, Number(nextZoomRaw.toFixed(2))));
      setZoom((prevZoom) => {
        if (nextZoom <= 1) {
          setPan({ x: 0, y: 0 });
          return 1;
        }
        setPan((prevPan) => {
          if (
            focalClientX !== undefined &&
            focalClientY !== undefined &&
            stageRef.current
          ) {
            const rect = stageRef.current.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const offsetX = focalClientX - cx;
            const offsetY = focalClientY - cy;
            const scaleRatio = nextZoom / prevZoom;
            const adjustedX = offsetX - (offsetX - prevPan.x) * scaleRatio;
            const adjustedY = offsetY - (offsetY - prevPan.y) * scaleRatio;
            return clampPan(adjustedX, adjustedY, nextZoom);
          }
          const ratio = nextZoom / prevZoom;
          return clampPan(prevPan.x * ratio, prevPan.y * ratio, nextZoom);
        });
        return nextZoom;
      });
    },
    [clampPan]
  );

  if (!isOpen) return null;

  const effectiveControlPoints =
    propControlPoints && propControlPoints.length >= 2
      ? propControlPoints
      : liveConfig.controlPoints;
  const activePointId = propActivePointId || internalActivePointId;

  const selectControlPoint = (pointId: string) => {
    setInternalActivePointId(pointId);
    onSelectControlPoint?.(pointId);
  };

  /**
   * Computes normalized (u, v) on the plan image from a client (X, Y) pointer event,
   * using the actual rendered <img> element's bounding rect (accounting for zoom + pan)
   * and clamped strictly within the image borders [0, 1].
   */
  const clientXYToImageUV = (
    clientX: number,
    clientY: number
  ): { u: number; v: number } | null => {
    const targetEl = mapImgRef.current || imageBoxRef.current;
    if (!targetEl) return null;
    const rect = targetEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const rawU = (clientX - rect.left) / rect.width;
    const rawV = (clientY - rect.top) / rect.height;
    return {
      u: Number(Math.max(0, Math.min(1, rawU)).toFixed(4)),
      v: Number(Math.max(0, Math.min(1, rawV)).toFixed(4)),
    };
  };

  const updateControlPointUVAtClient = async (
    pointId: string,
    clientX: number,
    clientY: number,
    showFeedback = false
  ) => {
    const uv = clientXYToImageUV(clientX, clientY);
    if (!uv) return;

    if (onUpdateControlPointUV) {
      onUpdateControlPointUV(pointId, uv.u, uv.v);
    } else {
      const nextPoints = effectiveControlPoints.map((cp) =>
        cp.id === pointId ? { ...cp, imageX: uv.u, imageY: uv.v } : cp
      );
      const nextCfg: TarhHadiCalibrationConfig = {
        ...liveConfig,
        controlPoints: nextPoints,
        updatedAt: new Date().toISOString(),
      };
      await saveTarhHadiConfig(nextCfg);
    }

    if (showFeedback) {
      const idx = effectiveControlPoints.findIndex((p) => p.id === pointId);
      showTempViewerNotice(
        `نقطه مرجع ${toPersianDigits(idx >= 0 ? idx + 1 : 1)} روی نقشه ثبت شد (X:${toPersianDigits(
          Math.round(uv.u * 100)
        )}% , Y:${toPersianDigits(Math.round(uv.v * 100))}%) ✓`
      );
    }
  };

  const updatePropertyPinAtClient = (
    clientX: number,
    clientY: number,
    showFeedback = false
  ) => {
    if (!allowPropertyPinPlacement || !onPickPropertyOnPlan) return;
    const uv = clientXYToImageUV(clientX, clientY);
    if (!uv) return;
    const evaluated = evaluateTarhHadiAtImageUV(uv.u, uv.v, {
      ...liveConfig,
      controlPoints: effectiveControlPoints,
    });
    onPickPropertyOnPlan(evaluated);
    if (showFeedback) {
      showTempViewerNotice(
        `موقعیت روی نقشه طرح هادی تنظیم شد (${evaluated.landUseTitle}) ✓`
      );
    }
  };

  // Pointer handlers for single-finger/mouse pan & marker dragging
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pinchStateRef.current.active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsInteracting(true);
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      movedDistance: 0,
      draggingMarker: null,
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pinchStateRef.current.active) return;
    const st = dragStateRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    st.movedDistance = Math.hypot(dx, dy);

    if (st.draggingMarker) {
      if (st.draggingMarker.type === 'control-point') {
        updateControlPointUVAtClient(st.draggingMarker.id, e.clientX, e.clientY, false);
      } else if (st.draggingMarker.type === 'property-pin') {
        updatePropertyPinAtClient(e.clientX, e.clientY, false);
      }
      return;
    }

    // Pan the viewport smoothly at any zoom > 1
    if (zoom > 1) {
      const nextPan = clampPan(st.startPanX + dx, st.startPanY + dy, zoom);
      setPan(nextPan);
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;

    if (st.draggingMarker) {
      if (st.draggingMarker.type === 'control-point') {
        updateControlPointUVAtClient(st.draggingMarker.id, e.clientX, e.clientY, true);
      } else if (st.draggingMarker.type === 'property-pin') {
        updatePropertyPinAtClient(e.clientX, e.clientY, true);
      }
    } else if (st.movedDistance < 6 && activeTab === 'map' && !mapLoadError) {
      // Clean tap (not a pan drag!) on the plan image
      if (
        editableReferencePoints &&
        showRefPoints &&
        activePointId &&
        (!allowPropertyPinPlacement || tapTargetMode === 'ref-point')
      ) {
        updateControlPointUVAtClient(activePointId, e.clientX, e.clientY, true);
      } else if (allowPropertyPinPlacement && onPickPropertyOnPlan) {
        updatePropertyPinAtClient(e.clientX, e.clientY, true);
      }
    }

    dragStateRef.current.active = false;
    dragStateRef.current.pointerId = null;
    dragStateRef.current.draggingMarker = null;
    setIsInteracting(false);
  };

  // Two-finger touch pinch-to-zoom + simultaneous pan
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;

      dragStateRef.current.active = false;
      setIsInteracting(true);
      pinchStateRef.current = {
        active: true,
        initialDist: Math.max(20, dist),
        initialZoom: zoom,
        initialMidX: midX,
        initialMidY: midY,
        initialPanX: pan.x,
        initialPanY: pan.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStateRef.current.active) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;

      const ps = pinchStateRef.current;
      const scaleFactor = dist / ps.initialDist;
      const nextZoom = Math.max(1, Math.min(5, Number((ps.initialZoom * scaleFactor).toFixed(2))));

      const dMidX = midX - ps.initialMidX;
      const dMidY = midY - ps.initialMidY;
      const zoomRatio = nextZoom / ps.initialZoom;

      const nextPan = clampPan(
        ps.initialPanX * zoomRatio + dMidX,
        ps.initialPanY * zoomRatio + dMidY,
        nextZoom
      );

      setZoom(nextZoom);
      setPan(nextPan);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pinchStateRef.current.active && e.touches.length < 2) {
      pinchStateRef.current.active = false;
      setIsInteracting(false);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.3 : -0.3;
    applyZoom(zoom + delta, e.clientX, e.clientY);
  };

  const handleAttachRealFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'map' | 'legend'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAndSaveTarhHadiAsset(file, kind);
      if (kind === 'map') {
        setMapLoadError(false);
        showTempViewerNotice('تصویر نقشه طرح هادی کلارآباد با موفقیت بارگذاری و ذخیره شد ✓');
      } else {
        setLegendLoadError(false);
        showTempViewerNotice('تصویر راهنمای نقشه (Legend) با موفقیت بارگذاری و ذخیره شد ✓');
      }
      onAssetsUpdated?.();
    } catch {
      showTempViewerNotice('خطا در بارگذاری تصویر؛ لطفاً فایل معتبر انتخاب کنید.');
    }
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-[#050b17]/95 backdrop-blur-2xl flex flex-col justify-between text-right"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        paddingBottom: 'calc(var(--nav-h, 5rem) + env(safe-area-inset-bottom, 0px) + 10px)',
        paddingLeft: '10px',
        paddingRight: '10px',
      }}
      onClick={onClose}
    >
      <input
        ref={mapInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleAttachRealFile(e, 'map')}
      />
      <input
        ref={legendInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleAttachRealFile(e, 'legend')}
      />

      {/* Top Safe-Area Bar with Close Button, Title & Tab Switcher */}
      <div
        className="w-full max-w-4xl mx-auto flex flex-col gap-2 px-3 py-2.5 rounded-2xl bg-[#091224]/95 border border-[#f1cb83]/35 shadow-2xl shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-rose-500/25 border border-white/15 hover:border-rose-400/50 text-white flex items-center justify-center cursor-pointer active:scale-95 transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>

            <div className="min-w-0 flex-1 pr-1">
              <h3 className="text-xs sm:text-sm font-extrabold text-[#f1cb83] truncate">
                طرح هادی شهر کلارآباد {propertyCode ? `• ${propertyCode}` : ''}
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {activeTab === 'map'
                  ? 'با دو انگشت یا دکمه‌ها بزرگ‌نمایی کنید و با کشیدن در همه جهات جابه‌جا شوید'
                  : 'راهنمای نقشه طرح هادی کلارآباد (Legend)'}
              </p>
            </div>
          </div>

          {/* Segmented Tab Switcher + Reference Points Toggle */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="grid grid-cols-2 gap-1 bg-[#050b17] p-1 rounded-xl border border-white/10 flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('map');
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className={`min-h-[40px] px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'map'
                    ? 'bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">map</span>
                <span>نقشه طرح هادی</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('legend');
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className={`min-h-[40px] px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'legend'
                    ? 'bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">legend_toggle</span>
                <span>راهنمای نقشه</span>
              </button>
            </div>

            {activeTab === 'map' && (
              <button
                type="button"
                onClick={() => setShowRefPoints((prev) => !prev)}
                className={`min-h-[42px] px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0 ${
                  showRefPoints
                    ? 'bg-[#f1cb83]/20 border-[#f1cb83] text-[#f1cb83]'
                    : 'bg-white/5 border-white/15 text-slate-300 hover:text-white'
                }`}
                title="نمایش یا پنهان کردن نقاط مرجع کالیبراسیون روی نقشه"
              >
                <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                <span>نقاط مرجع ({toPersianDigits(effectiveControlPoints.length)})</span>
              </button>
            )}
          </div>
        </div>

        {/* Reference Points Selector Bar inside Full-Screen Viewer when showing/editing reference points */}
        {activeTab === 'map' && showRefPoints && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1.5 border-t border-white/10">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              <span className="text-[11px] text-slate-300 font-bold shrink-0">
                {editableReferencePoints
                  ? 'نقطه مرجع فعال:'
                  : 'نقاط مرجع کالیبراسیون:'}
              </span>
              {effectiveControlPoints.map((cp, idx) => {
                const isSelected = cp.id === activePointId;
                return (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => {
                      selectControlPoint(cp.id);
                      if (editableReferencePoints) {
                        setTapTargetMode('ref-point');
                      }
                    }}
                    className={`min-h-[38px] px-2.5 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-[#f1cb83] text-[#070d1a] border-white shadow-[0_0_12px_rgba(241,203,131,0.7)]'
                        : 'bg-[#050b17] text-[#f1cb83] border-[#f1cb83]/40 hover:bg-[#f1cb83]/15'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-black/25 flex items-center justify-center text-[11px]">
                      {toPersianDigits(idx + 1)}
                    </span>
                    <span className="text-[10px] font-mono" dir="ltr">
                      {Math.round(cp.imageX * 100)}%,{Math.round(cp.imageY * 100)}%
                    </span>
                  </button>
                );
              })}
              {editableReferencePoints && onAddControlPoint && (
                <button
                  type="button"
                  onClick={onAddControlPoint}
                  className="min-h-[38px] px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>+ نقطه جدید</span>
                </button>
              )}
            </div>

            {editableReferencePoints && allowPropertyPinPlacement && (
              <div className="flex items-center gap-1 bg-[#050b17] p-1 rounded-xl border border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={() => setTapTargetMode('ref-point')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    tapTargetMode === 'ref-point'
                      ? 'bg-[#f1cb83] text-[#070d1a]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  جابه‌جایی نقطه مرجع
                </button>
                <button
                  type="button"
                  onClick={() => setTapTargetMode('property-pin')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    tapTargetMode === 'property-pin'
                      ? 'bg-emerald-400 text-[#070d1a]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  جابه‌جایی پین تست
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive Pan + Zoom Viewport Stage */}
      <div
        ref={stageRef}
        className={`flex-1 w-full max-w-4xl mx-auto my-2 rounded-2xl bg-[#070d1a]/95 border border-white/10 overflow-hidden flex items-center justify-center relative select-none touch-none ${
          zoom > 1 ? (isInteracting ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onDoubleClick={(e) => {
          if (zoom > 1.2) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          } else {
            applyZoom(2.4, e.clientX, e.clientY);
          }
        }}
      >
        {viewerNotice && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl bg-[#091224]/95 border border-emerald-400/50 text-emerald-300 text-xs font-bold shadow-2xl pointer-events-none whitespace-nowrap">
            {viewerNotice}
          </div>
        )}

        {activeTab === 'map' ? (
          mapLoadError ? (
            <div className="max-w-md mx-auto p-6 rounded-2xl bg-[#091224] border border-amber-400/40 text-center space-y-3">
              <span className="material-symbols-outlined text-[36px] text-[#f1cb83]">upload_file</span>
              <h4 className="text-sm font-extrabold text-[#f1cb83]">
                تصویر نقشه طرح هادی کلارآباد بارگذاری نشده است
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                لطفاً فایل تصویر نقشه طرح هادی کلارآباد (
                <code className="text-[#f1cb83] font-mono">kelarabad_tarh_hadi_map.jpg</code>) را انتخاب فرمایید تا در حافظه دائمی برنامه ذخیره شود.
              </p>
              <button
                type="button"
                onClick={() => mapInputRef.current?.click()}
                className="gold-cta-sheen w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
                <span>بارگذاری تصویر نقشه طرح هادی</span>
              </button>
            </div>
          ) : (
            <div
              ref={imageBoxRef}
              dir="ltr"
              className="relative inline-flex leading-none max-w-full max-h-full"
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isInteracting ? 'none' : 'transform 140ms ease-out',
              }}
            >
              <img
                ref={mapImgRef}
                src={mapUrl}
                alt="نقشه طرح هادی کلارآباد"
                draggable={false}
                onLoad={() => {
                  setMapLoadError(false);
                  ensurePlanPixelCacheLoaded(mapUrl);
                }}
                onError={() => setMapLoadError(true)}
                className="max-w-full max-h-[68dvh] w-auto h-auto rounded-xl border border-[#f1cb83]/30 shadow-2xl block select-none pointer-events-none"
              />

              {/* Exact Image-Bounds Marker Overlay Layer (0..1 matches rendered <img> 100%) */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Numbered Reference Point Markers (1, 2, 3, 4, ...) anchored with w-0 h-0 at exact (imageX, imageY) */}
                {showRefPoints &&
                  !mapLoadError &&
                  effectiveControlPoints.map((cp, index) => {
                    const isSelected = cp.id === activePointId;
                    return (
                      <div
                        key={cp.id}
                        style={{
                          left: `${cp.imageX * 100}%`,
                          top: `${cp.imageY * 100}%`,
                          transform: `scale(${1 / zoom})`,
                        }}
                        className="absolute w-0 h-0 z-30 pointer-events-auto"
                      >
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            selectControlPoint(cp.id);
                            if (editableReferencePoints && stageRef.current) {
                              stageRef.current.setPointerCapture(e.pointerId);
                              setIsInteracting(true);
                              dragStateRef.current = {
                                active: true,
                                pointerId: e.pointerId,
                                startX: e.clientX,
                                startY: e.clientY,
                                startPanX: pan.x,
                                startPanY: pan.y,
                                movedDistance: 0,
                                draggingMarker: { type: 'control-point', id: cp.id },
                              };
                            }
                          }}
                          className={`absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-9 h-9 min-w-[36px] min-h-[36px] rounded-full font-extrabold text-xs flex items-center justify-center transition-colors ${
                            editableReferencePoints ? 'cursor-move' : 'cursor-pointer'
                          } ${
                            isSelected
                              ? 'bg-[#f1cb83] text-[#070d1a] border-2 border-white shadow-[0_0_20px_rgba(241,203,131,0.95)] ring-4 ring-[#f1cb83]/40'
                              : 'bg-[#070d1a]/95 text-[#f1cb83] border-2 border-[#f1cb83] shadow-lg'
                          }`}
                          title={`${cp.label} (${cp.lat.toFixed(5)}, ${cp.lng.toFixed(5)})`}
                        >
                          <span>{toPersianDigits(index + 1)}</span>
                        </button>
                      </div>
                    );
                  })}

                {/* Property / Calibration Test Pin Overlay anchored with w-0 h-0 at exact (u, v) so label never shifts center */}
                {checkResult && !checkResult.isOutsideImageFrame && !mapLoadError && (
                  <div
                    style={{
                      left: `${checkResult.imageUV.u * 100}%`,
                      top: `${checkResult.imageUV.v * 100}%`,
                      transform: `scale(${1 / zoom})`,
                    }}
                    className={`absolute w-0 h-0 z-40 ${
                      allowPropertyPinPlacement ? 'pointer-events-auto cursor-move' : 'pointer-events-none'
                    }`}
                  >
                    {/* Exact Center Circle & Precision Target Dot at (0,0) */}
                    <div
                      onPointerDown={(e) => {
                        if (!allowPropertyPinPlacement || !stageRef.current) return;
                        e.stopPropagation();
                        stageRef.current.setPointerCapture(e.pointerId);
                        setIsInteracting(true);
                        dragStateRef.current = {
                          active: true,
                          pointerId: e.pointerId,
                          startX: e.clientX,
                          startY: e.clientY,
                          startPanX: pan.x,
                          startPanY: pan.y,
                          movedDistance: 0,
                          draggingMarker: { type: 'property-pin' },
                        };
                      }}
                      className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-emerald-400/25 border-2 border-[#f1cb83] flex items-center justify-center shadow-[0_0_22px_rgba(241,203,131,0.95)]"
                    >
                      <div className="w-3.5 h-3.5 rounded-full bg-[#f1cb83] border-2 border-[#070d1a] shadow-sm" />
                    </div>

                    {/* Floating Label Pill strictly ABOVE the (0,0) anchor so it never shifts the pin center */}
                    <div
                      dir="rtl"
                      className="absolute left-0 bottom-6 -translate-x-1/2 px-2.5 py-1 rounded-xl bg-[#070d1a]/95 border-2 border-[#f1cb83] text-[#f1cb83] text-[11px] font-extrabold whitespace-nowrap shadow-[0_6px_20px_rgba(0,0,0,0.95)] flex items-center gap-1.5 pointer-events-none"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/40"
                        style={{ backgroundColor: checkResult.landUseColor }}
                      />
                      <span>{propertyCode || 'موقعیت ملک'}</span>
                      <span className="text-slate-300 font-normal">•</span>
                      <span
                        className={
                          checkResult.isInsideBoundary ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {checkResult.isInsideBoundary ? 'داخل طرح' : 'خارج طرح'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        ) : legendLoadError ? (
          <div className="max-w-md mx-auto p-6 rounded-2xl bg-[#091224] border border-amber-400/40 text-center space-y-3">
            <span className="material-symbols-outlined text-[36px] text-[#f1cb83]">image</span>
            <h4 className="text-sm font-extrabold text-[#f1cb83]">
              تصویر راهنمای نقشه (Legend) بارگذاری نشده است
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              لطفاً فایل تصویر راهنمای نقشه طرح هادی (
              <code className="text-[#f1cb83] font-mono">kelarabad_legend.png</code>) را انتخاب فرمایید.
            </p>
            <button
              type="button"
              onClick={() => legendInputRef.current?.click()}
              className="gold-cta-sheen w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">folder_open</span>
              <span>بارگذاری تصویر راهنمای نقشه (Legend)</span>
            </button>
          </div>
        ) : (
          <div
            ref={imageBoxRef}
            dir="ltr"
            className="relative inline-flex leading-none max-w-full max-h-full"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isInteracting ? 'none' : 'transform 140ms ease-out',
            }}
          >
            <img
              src={legendUrl}
              alt="راهنمای نقشه طرح هادی کلارآباد"
              draggable={false}
              onLoad={() => setLegendLoadError(false)}
              onError={() => setLegendLoadError(true)}
              className="max-w-full max-h-[68dvh] w-auto h-auto rounded-xl border border-[#f1cb83]/30 shadow-2xl block select-none pointer-events-none mx-auto"
            />
          </div>
        )}

        {/* Outside Image Frame Warning Banner in Full-Screen Viewer */}
        {activeTab === 'map' && checkResult?.isOutsideImageFrame && !mapLoadError && (
          <div className="absolute bottom-3 inset-x-3 z-30 p-3 rounded-xl bg-rose-950/95 border border-rose-400/50 text-rose-200 text-xs font-bold flex items-center justify-between gap-2 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-rose-400">
                wrong_location
              </span>
              <span>
                مختصات خارج از مرزهای تصویر نقشه طرح هادی کلارآباد قرار دارد (خارج از کادر نقشه).
              </span>
            </div>
            {allowPropertyPinPlacement && (
              <span className="text-[11px] text-[#f1cb83] shrink-0">
                برای تعیین دستی، روی نقشه لمس کنید
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Safe-Area Controls Bar */}
      <div
        className="w-full max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-2xl bg-[#091224]/95 border border-[#f1cb83]/35 shadow-2xl shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => applyZoom(zoom + 0.45)}
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-white/10 hover:bg-[#f1cb83]/20 border border-white/15 text-[#f1cb83] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">zoom_in</span>
            <span>بزرگ‌نمایی</span>
          </button>
          <button
            type="button"
            onClick={() => applyZoom(zoom - 0.45)}
            disabled={zoom <= 1}
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 border border-white/15 text-slate-200 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">zoom_out</span>
            <span>کوچک‌نمایی</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="min-h-[44px] px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-mono cursor-pointer flex items-center gap-1"
            title="بازنشانی بزرگ‌نمایی و مرکزیت تصویر"
          >
            <span className="material-symbols-outlined text-[15px] text-[#f1cb83]">
              center_focus_strong
            </span>
            <span>{toPersianDigits(Math.round(zoom * 100))}٪</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => mapInputRef.current?.click()}
            className="min-h-[44px] px-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
            title="بارگذاری یا جایگزینی تصویر نقشه طرح هادی"
          >
            <span className="material-symbols-outlined text-[17px] text-[#f1cb83]">map</span>
            <span>
              {hasCustomPlanMapAsset(liveConfig) ? 'تغییر نقشه طرح' : 'بارگذاری نقشه طرح'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => legendInputRef.current?.click()}
            className="min-h-[44px] px-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
            title="بارگذاری یا جایگزینی تصویر راهنمای نقشه (Legend)"
          >
            <span className="material-symbols-outlined text-[17px] text-[#f1cb83]">
              legend_toggle
            </span>
            <span>
              {hasCustomPlanLegendAsset(liveConfig) ? 'تغییر راهنما' : 'بارگذاری راهنما'}
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl bg-[#f1cb83] text-[#070d1a] text-xs font-extrabold flex items-center justify-center cursor-pointer active:scale-95"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};

interface KelarabadTarhHadiCardProps {
  mode: 'form' | 'detail';
  coords: { lat: number; lng: number } | null;
  savedCheck?: TarhHadiCheckResult;
  propertyCode?: string;
  propertyTitle?: string;
  onChangeCheck?: (result: TarhHadiCheckResult) => void;
  onUpdateCoordsFromPlan?: (coords: { lat: number; lng: number }) => void;
  onApplyToFormFields?: (zoningStatus: string, landUsage: string) => void;
  onAddSnapshotToGallery?: (dataUrl: string, caption: string) => Promise<void> | void;
  onOpenSettings?: () => void;
}

export const KelarabadTarhHadiCard: React.FC<KelarabadTarhHadiCardProps> = ({
  mode,
  coords,
  savedCheck,
  propertyCode,
  propertyTitle,
  onChangeCheck,
  onUpdateCoordsFromPlan,
  onApplyToFormFields,
  onAddSnapshotToGallery,
}) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTab, setViewerTab] = useState<'map' | 'legend'>('map');
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [mapPreviewError, setMapPreviewError] = useState(false);
  const [liveConfig, setLiveConfig] = useState<TarhHadiCalibrationConfig>(() =>
    getTarhHadiConfigSync()
  );

  const inlineMapUploadRef = useRef<HTMLInputElement | null>(null);
  const inlineLegendUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLiveConfig(getTarhHadiConfigSync());
    return subscribeTarhHadiConfig((cfg) => {
      setLiveConfig(cfg);
    });
  }, []);

  const mapUrl = getActiveTarhHadiMapUrl(liveConfig);

  useEffect(() => {
    setMapPreviewError(false);
  }, [mapUrl]);

  /**
   * Always evaluate using the current liveConfig so that any calibration update in Settings
   * immediately updates the pin position (imageUV) and boundary status in both Form and Detail views.
   */
  const checkResult: TarhHadiCheckResult | null = React.useMemo(() => {
    const effectiveCoords =
      coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
        ? coords
        : savedCheck?.coordinates &&
          Number.isFinite(savedCheck.coordinates.lat) &&
          Number.isFinite(savedCheck.coordinates.lng)
        ? savedCheck.coordinates
        : null;

    if (effectiveCoords) {
      const live = evaluateTarhHadiCoordinates(
        effectiveCoords.lat,
        effectiveCoords.lng,
        liveConfig
      );
      // Preserve explicit manual land-use override ONLY when point is still inside the image frame
      if (
        savedCheck &&
        !live.isOutsideImageFrame &&
        Math.abs(savedCheck.coordinates.lat - effectiveCoords.lat) < 0.00001 &&
        Math.abs(savedCheck.coordinates.lng - effectiveCoords.lng) < 0.00001 &&
        savedCheck.landUseCode &&
        savedCheck.landUseCode !== 'outside'
      ) {
        return {
          ...live,
          boundaryStatus: savedCheck.boundaryStatus,
          isInsideBoundary: savedCheck.isInsideBoundary,
          boundaryStatusText: savedCheck.boundaryStatusText,
          landUseCode: savedCheck.landUseCode,
          landUseTitle: savedCheck.landUseTitle,
          landUseColor: savedCheck.landUseColor,
          landUseDescription: savedCheck.landUseDescription,
        };
      }
      return live;
    }
    return savedCheck || null;
  }, [coords?.lat, coords?.lng, savedCheck, liveConfig]);

  useEffect(() => {
    if (mode === 'form' && checkResult && onChangeCheck) {
      if (
        !savedCheck ||
        savedCheck.coordinates.lat !== checkResult.coordinates.lat ||
        savedCheck.coordinates.lng !== checkResult.coordinates.lng ||
        savedCheck.imageUV.u !== checkResult.imageUV.u ||
        savedCheck.imageUV.v !== checkResult.imageUV.v ||
        savedCheck.isOutsideImageFrame !== checkResult.isOutsideImageFrame
      ) {
        onChangeCheck(checkResult);
      }
    }
  }, [
    mode,
    checkResult?.coordinates?.lat,
    checkResult?.coordinates?.lng,
    checkResult?.imageUV?.u,
    checkResult?.imageUV?.v,
    checkResult?.isOutsideImageFrame,
  ]);

  const showTempMessage = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => {
      setActionToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleInlineUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'map' | 'legend'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAndSaveTarhHadiAsset(file, kind);
      if (kind === 'map') {
        setMapPreviewError(false);
        showTempMessage('تصویر نقشه طرح هادی کلارآباد بارگذاری و ذخیره شد ✓');
      } else {
        showTempMessage('تصویر راهنمای نقشه (Legend) بارگذاری و ذخیره شد ✓');
      }
    } catch {
      showTempMessage('خطا در بارگذاری فایل تصویر');
    }
    e.target.value = '';
  };

  const handleManualLandUseChange = (landUseCode: string) => {
    if (!checkResult || !onChangeCheck) return;
    if (landUseCode === 'outside') {
      const updated: TarhHadiCheckResult = {
        ...checkResult,
        boundaryStatus: 'outside',
        isInsideBoundary: false,
        boundaryStatusText: 'خارج از محدوده پیشنهادی طرح هادی (خارج بافت / حریم)',
        landUseCode: 'outside',
        landUseTitle: 'خارج از محدوده پیشنهادی (اراضی آزاد / حریم)',
        landUseColor: '#475569',
        landUseDescription:
          'این موقعیت در خارج از خط‌چین سرخابی محدوده پیشنهادی طرح هادی کلارآباد قرار دارد.',
      };
      onChangeCheck(updated);
      showTempMessage('وضعیت به «خارج از محدوده پیشنهادی» تغییر یافت ✓');
      return;
    }
    const found = KELARABAD_LEGEND_ITEMS.find((i) => i.code === landUseCode);
    if (!found) return;
    const updated: TarhHadiCheckResult = {
      ...checkResult,
      landUseCode: found.code,
      landUseTitle: found.title,
      landUseColor: found.color,
      landUseDescription: found.description,
    };
    onChangeCheck(updated);
    showTempMessage(`کاربری طرح هادی به «${found.title}» تغییر یافت ✓`);
  };

  const handleManualBoundaryChange = (status: 'inside' | 'border' | 'outside') => {
    if (!checkResult || !onChangeCheck) return;
    const updated: TarhHadiCheckResult = {
      ...checkResult,
      boundaryStatus: status,
      isInsideBoundary: status === 'inside' || status === 'border',
      boundaryStatusText:
        status === 'inside'
          ? 'داخل محدوده پیشنهادی طرح هادی کلارآباد ✓'
          : status === 'border'
          ? 'روی مرز / مجاور خط‌چین محدوده پیشنهادی طرح هادی'
          : 'خارج از محدوده پیشنهادی طرح هادی (خارج بافت / حریم)',
    };
    onChangeCheck(updated);
  };

  const handleApplyToFields = () => {
    if (!checkResult || !onApplyToFormFields) return;
    const legendItem = KELARABAD_LEGEND_ITEMS.find((i) => i.code === checkResult.landUseCode);
    const suggestedZoning = checkResult.isInsideBoundary
      ? legendItem?.suggestedZoningStatus || 'داخل بافت مسکونی ۱۰۰٪'
      : checkResult.boundaryStatus === 'border'
      ? 'الحاق به بافت با تعهد معتبر'
      : 'خارج از بافت';
    const suggestedUsage = legendItem?.suggestedLandUsage || 'مسکونی ویلایی';
    onApplyToFormFields(suggestedZoning, suggestedUsage);
    showTempMessage('وضعیت بافت و کاربری زمین در فرم ملک اعمال شد ✓');
  };

  const handleSaveSnapshot = async () => {
    if (!checkResult || !onAddSnapshotToGallery) return;
    setIsSavingSnapshot(true);
    try {
      const dataUrl = await generateAnnotatedTarhHadiSnapshot(
        checkResult,
        propertyCode || 'جدید',
        propertyTitle
      );
      if (dataUrl) {
        await onAddSnapshotToGallery(
          dataUrl,
          `نقشه طرح هادی کلارآباد - ${checkResult.landUseTitle}`
        );
        showTempMessage('تصویر موقعیت ملک روی نقشه طرح هادی به گالری اضافه شد ✓');
      } else {
        showTempMessage('ابتدا تصویر نقشه طرح هادی را بارگذاری کنید');
      }
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  return (
    <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#0b152b]/95 to-[#070d1a]/95 border border-[#f1cb83]/35 shadow-lg space-y-3">
      <input
        ref={inlineMapUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleInlineUpload(e, 'map')}
      />
      <input
        ref={inlineLegendUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleInlineUpload(e, 'legend')}
      />

      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#f1cb83]/15 border border-[#f1cb83]/35 flex items-center justify-center text-[#f1cb83] shrink-0">
            <span className="material-symbols-outlined text-[20px]">layers</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-extrabold text-[#f1cb83] truncate">
              بررسی طرح هادی کلارآباد
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              بررسی قرارگیری در خط‌چین سرخابی محدوده پیشنهادی و کاربری اراضی
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setViewerTab('legend');
            setViewerOpen(true);
          }}
          className="min-h-[44px] px-2.5 py-1 rounded-xl bg-white/5 hover:bg-[#f1cb83]/15 border border-[#f1cb83]/30 text-[#f1cb83] text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[15px]">legend_toggle</span>
          <span>راهنمای نقشه</span>
        </button>
      </div>

      {actionToast && (
        <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-bold text-center">
          {actionToast}
        </div>
      )}

      {!checkResult ? (
        <div className="p-4 rounded-xl bg-[#091224]/80 border border-white/10 text-center space-y-2.5">
          <p className="text-xs text-slate-300 leading-relaxed">
            {mode === 'form'
              ? 'برای بررسی خودکار وضعیت قرارگیری ملک در طرح هادی کلارآباد، مختصات یا لینک نقشه ملک را در کادر بالا وارد کنید یا با دکمه زیر مستقیم از روی نقشه طرح هادی انتخاب نمایید.'
              : 'مختصات جغرافیایی برای این پرونده ثبت نشده است. با لمس دکمه زیر می‌توانید نقشه طرح هادی کلارآباد را مشاهده کنید.'}
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setViewerTab('map');
                setViewerOpen(true);
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">map</span>
              <span>{mode === 'form' ? 'انتخاب روی نقشه طرح هادی' : 'بررسی طرح هادی'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewerTab('legend');
                setViewerOpen(true);
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">palette</span>
              <span>راهنمای نقشه</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 1. Boundary Status Banner */}
          <div
            className={`p-3 rounded-xl border flex items-start justify-between gap-2.5 ${
              checkResult.isOutsideImageFrame
                ? 'bg-rose-950/50 border-rose-500/50 text-rose-300'
                : checkResult.boundaryStatus === 'inside'
                ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-300'
                : checkResult.boundaryStatus === 'border'
                ? 'bg-amber-500/12 border-amber-400/40 text-amber-300'
                : 'bg-rose-500/12 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
                {checkResult.isOutsideImageFrame
                  ? 'wrong_location'
                  : checkResult.boundaryStatus === 'inside'
                  ? 'verified'
                  : checkResult.boundaryStatus === 'border'
                  ? 'warning'
                  : 'cancel'}
              </span>
              <div className="space-y-0.5 min-w-0">
                <span className="text-xs font-extrabold block">
                  {checkResult.boundaryStatusText}
                </span>
                <span className="text-[11px] opacity-90 block">
                  بخش: {checkResult.subZoneLabel}
                </span>
              </div>
            </div>
            <span
              className="px-2 py-0.5 rounded-md bg-black/30 text-[10px] font-mono shrink-0"
              dir="ltr"
            >
              {checkResult.coordinates.lat.toFixed(5)}, {checkResult.coordinates.lng.toFixed(5)}
            </span>
          </div>

          {/* 2. Detected Land-Use Box */}
          <div className="p-3 rounded-xl bg-[#091224]/90 border border-white/10 flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl border-2 border-white/60 shrink-0 shadow-md flex items-center justify-center"
              style={{ backgroundColor: checkResult.landUseColor }}
              title={checkResult.landUseTitle}
            >
              <span className="material-symbols-outlined text-black/80 text-[20px] font-bold">
                domain
              </span>
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">کاربری اراضی در طرح هادی:</span>
                <span className="text-[10px] text-[#f1cb83] font-mono" dir="ltr">
                  X:{Math.round(checkResult.imageUV.u * 100)}% Y:{Math.round(checkResult.imageUV.v * 100)}%
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-extrabold text-slate-100 truncate">
                {checkResult.landUseTitle}
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {checkResult.landUseDescription}
              </p>
            </div>
          </div>

          {/* 3. Uncropped Exact-Coordinate Map Preview with Zero-Offset w-0 h-0 Pin Overlay */}
          {!mapPreviewError ? (
            <div
              onClick={() => {
                setViewerTab('map');
                setViewerOpen(true);
              }}
              className="relative rounded-xl overflow-hidden border border-[#f1cb83]/35 bg-[#050b17] cursor-pointer group"
            >
              <div className="relative w-full leading-none" dir="ltr">
                <img
                  src={mapUrl}
                  alt="موقعیت ملک روی نقشه طرح هادی کلارآباد"
                  onLoad={() => {
                    setMapPreviewError(false);
                    ensurePlanPixelCacheLoaded(mapUrl);
                  }}
                  onError={() => setMapPreviewError(true)}
                  className="w-full h-auto block select-none"
                />

                {/* Property Pin Overlay anchored with w-0 h-0 at exact (u%, v%) */}
                <div className="absolute inset-0 pointer-events-none">
                  {!checkResult.isOutsideImageFrame ? (
                    <div
                      className="absolute w-0 h-0 z-10"
                      style={{
                        left: `${checkResult.imageUV.u * 100}%`,
                        top: `${checkResult.imageUV.v * 100}%`,
                      }}
                    >
                      {/* Center Target Circle & Dot locked to (0,0) */}
                      <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-emerald-400/25 border-2 border-[#f1cb83] flex items-center justify-center shadow-[0_0_16px_rgba(241,203,131,0.95)]">
                        <div className="w-3 h-3 rounded-full bg-[#f1cb83] border-2 border-[#070d1a]" />
                      </div>
                      {/* Floating Label Pill strictly above (0,0) so it never shifts the pin center */}
                      <div
                        dir="rtl"
                        className="absolute left-0 bottom-5 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-[#070d1a]/95 border border-[#f1cb83] text-[#f1cb83] text-[10px] font-extrabold shadow-lg whitespace-nowrap"
                      >
                        {propertyCode || 'موقعیت ملک'}
                      </div>
                    </div>
                  ) : (
                    <div
                      dir="rtl"
                      className="absolute inset-0 bg-[#050b17]/75 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center z-10"
                    >
                      <span className="material-symbols-outlined text-rose-400 text-[28px] mb-1">
                        wrong_location
                      </span>
                      <span className="text-xs font-extrabold text-rose-300">
                        مختصات خارج از کادر تصویر نقشه طرح هادی کلارآباد است
                      </span>
                      <span className="text-[11px] text-slate-300 mt-1">
                        برای مشاهده کامل نقشه یا انتخاب دستی موقعیت، لمس کنید
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-2 bg-[#070d1a]/95 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-200">
                <span className="font-bold flex items-center gap-1 text-[#f1cb83]">
                  <span className="material-symbols-outlined text-[16px]">fullscreen</span>
                  <span>
                    {mode === 'form'
                      ? 'بزرگ‌نمایی و بررسی / تنظیم دقیق روی نقشه طرح هادی'
                      : 'نمایش کامل و بزرگ‌نمایی نقشه طرح هادی'}
                  </span>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-pink-500/20 border border-pink-400/40 text-pink-200 text-[10px] font-bold shrink-0">
                  خط‌چین سرخابی: محدوده پیشنهادی
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/35 text-amber-200 text-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <span>تصویر نقشه طرح هادی کلارآباد هنوز بارگذاری نشده است.</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => inlineMapUploadRef.current?.click()}
                  className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#f1cb83] text-[#070d1a] font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  <span>بارگذاری نقشه طرح هادی</span>
                </button>
                <button
                  type="button"
                  onClick={() => inlineLegendUploadRef.current?.click()}
                  className="min-h-[44px] px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/20 text-[#f1cb83] font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">image</span>
                  <span>راهنما</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. Form-Mode Controls */}
          {mode === 'form' && (
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">
                    تنظیم وضعیت محدوده (در صورت قرارگیری روی مرز):
                  </label>
                  <select
                    value={checkResult.boundaryStatus}
                    onChange={(e) =>
                      handleManualBoundaryChange(
                        e.target.value as 'inside' | 'border' | 'outside'
                      )
                    }
                    className="glass-field w-full min-h-[44px] px-2.5 rounded-xl text-xs font-bold text-slate-100 bg-[#091224]"
                  >
                    <option value="inside">داخل محدوده پیشنهادی طرح هادی</option>
                    <option value="border">روی مرز / مجاور خط‌چین محدوده</option>
                    <option value="outside">خارج از محدوده پیشنهادی (خارج بافت)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">
                    کاربری دقیق قطعه طبق نقشه طرح هادی:
                  </label>
                  <select
                    value={checkResult.landUseCode}
                    onChange={(e) => handleManualLandUseChange(e.target.value)}
                    className="glass-field w-full min-h-[44px] px-2.5 rounded-xl text-xs font-bold text-slate-100 bg-[#091224]"
                  >
                    {KELARABAD_LEGEND_ITEMS.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.title}
                      </option>
                    ))}
                    <option value="outside">خارج از محدوده پیشنهادی (حریم / آزاد)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {onApplyToFormFields && (
                  <button
                    type="button"
                    onClick={handleApplyToFields}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[#f1cb83]/15 hover:bg-[#f1cb83]/25 border border-[#f1cb83]/45 text-[#f1cb83] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">task_alt</span>
                    <span>اعمال در وضعیت بافت و کاربری ملک</span>
                  </button>
                )}

                {onAddSnapshotToGallery && (
                  <button
                    type="button"
                    onClick={handleSaveSnapshot}
                    disabled={isSavingSnapshot}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">
                      add_photo_alternate
                    </span>
                    <span>
                      {isSavingSnapshot
                        ? 'در حال ساخت تصویر...'
                        : 'افزودن نقشه طرح هادی به گالری ملک'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Detail-Mode Snapshot Button if provided */}
          {mode === 'detail' && onAddSnapshotToGallery && !checkResult.isOutsideImageFrame && (
            <button
              type="button"
              onClick={handleSaveSnapshot}
              disabled={isSavingSnapshot}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">
                add_photo_alternate
              </span>
              <span>
                {isSavingSnapshot
                  ? 'در حال ساخت تصویر...'
                  : 'ذخیره تصویر طرح هادی در گالری این پرونده'}
              </span>
            </button>
          )}

          {/* 5. Fullscreen Map & Legend Trigger Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                setViewerTab('map');
                setViewerOpen(true);
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-[#f1cb83]/15 border border-[#f1cb83]/30 text-[#f1cb83] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">zoom_out_map</span>
              <span>بررسی طرح هادی</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewerTab('legend');
                setViewerOpen(true);
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">
                format_list_bulleted
              </span>
              <span>راهنمای نقشه (Legend)</span>
            </button>
          </div>
        </div>
      )}

      <KelarabadTarhHadiViewerModal
        isOpen={viewerOpen}
        initialTab={viewerTab}
        onClose={() => setViewerOpen(false)}
        checkResult={checkResult}
        propertyCode={propertyCode}
        propertyTitle={propertyTitle}
        allowPropertyPinPlacement={mode === 'form'}
        onPickPropertyOnPlan={(evaluated) => {
          onChangeCheck?.(evaluated);
          onUpdateCoordsFromPlan?.(evaluated.coordinates);
          showTempMessage(
            `موقعیت ملک از روی نقشه طرح هادی ثبت شد (${evaluated.landUseTitle}) ✓`
          );
        }}
      />
    </div>
  );
};
