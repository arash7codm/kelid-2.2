import React, { useState, useEffect, useRef } from 'react';
import { Property } from '../types';
import { toPersianDigits, formatPriceShort } from '../utils/jalali';
import { MapAppChooserModal } from '../components/MapAppChooserModal';
import {
  getTarhHadiConfigSync,
  getActiveTarhHadiMapUrl,
  getTarhHadiGeographicBounds,
  subscribeTarhHadiConfig,
  TarhHadiCalibrationConfig,
} from '../services/kelarabadTarhHadi';

interface MapViewProps {
  properties: Property[];
  onOpenPropertyDetail: (prop: Property) => void;
  onBack: () => void;
  pickMode?: boolean;
  pickLabel?: string;
  initialCoords?: { lat: number; lng: number };
  initialShowTarhHadiOverlay?: boolean;
  calibratingPointId?: string;
  onConfirmPickLocation?: (coords: { lat: number; lng: number }) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  properties,
  onOpenPropertyDetail,
  onBack,
  pickMode = false,
  pickLabel,
  initialCoords,
  initialShowTarhHadiOverlay = false,
  calibratingPointId,
  onConfirmPickLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletLibRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersMapRef = useRef<Record<string, any>>({});
  const pickMarkerRef = useRef<any>(null);
  const refMarkersRef = useRef<any[]>([]);
  const tarhOverlayRef = useRef<any>(null);

  const [mapLayer, setMapLayer] = useState<'satellite' | 'street'>('satellite');
  const [showTarhHadiOverlay, setShowTarhHadiOverlay] = useState<boolean>(
    initialShowTarhHadiOverlay
  );
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.72);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [highlightedPropertyId, setHighlightedPropertyId] = useState<string | null>(null);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number }>(
    initialCoords && Number.isFinite(initialCoords.lat) && Number.isFinite(initialCoords.lng)
      ? initialCoords
      : { lat: 36.651042, lng: 51.201089 }
  );
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState(false);
  const [liveTarhConfig, setLiveTarhConfig] = useState<TarhHadiCalibrationConfig>(() =>
    getTarhHadiConfigSync()
  );
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setLiveTarhConfig(getTarhHadiConfigSync());
    return subscribeTarhHadiConfig((cfg) => {
      setLiveTarhConfig(cfg);
    });
  }, []);

  useEffect(() => {
    if (
      initialCoords &&
      Number.isFinite(initialCoords.lat) &&
      Number.isFinite(initialCoords.lng)
    ) {
      setPickedCoords(initialCoords);
      if (pickMarkerRef.current) {
        pickMarkerRef.current.setLatLng([initialCoords.lat, initialCoords.lng]);
      }
      if (leafletMapRef.current) {
        leafletMapRef.current.setView([initialCoords.lat, initialCoords.lng], 16);
      }
    }
  }, [initialCoords?.lat, initialCoords?.lng]);

  // Properties with valid coordinates
  const validProps = properties.filter(
    (p) => !p.deleted && p.coordinates?.lat && p.coordinates?.lng
  );

  // Helper to build pin HTML with optional active/highlighted state
  const buildPinHtml = (prop: Property, isHighlighted: boolean) => {
    const dotColor =
      prop.status === 'فعال'
        ? '#10b981'
        : prop.status === 'در مذاکره'
        ? '#f59e0b'
        : prop.status === 'رزرو شده'
        ? '#38bdf8'
        : '#f43f5e';
    return `
      <div style="
        background: ${
          isHighlighted
            ? 'linear-gradient(135deg, #fff3d1, #f1cb83)'
            : 'linear-gradient(135deg, #f1cb83, #d4b06a)'
        };
        color: #070d1a;
        font-weight: 800;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 12px;
        border: ${isHighlighted ? '2.5px solid #ffffff' : '2px solid #ffffff'};
        box-shadow: ${
          isHighlighted
            ? '0 0 0 5px rgba(241,203,131,0.45), 0 8px 20px rgba(0,0,0,0.85), 0 0 18px rgba(241,203,131,0.95)'
            : '0 4px 14px rgba(0,0,0,0.6), 0 0 10px rgba(241,203,131,0.6)'
        };
        transform: ${isHighlighted ? 'scale(1.15)' : 'scale(1)'};
        transition: all 0.22s ease;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
      ">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: ${dotColor};"></span>
        <span>${prop.code}</span>
      </div>
    `;
  };

  // Initialize Leaflet map once per mode
  useEffect(() => {
    let mapInstance: any = null;
    markersMapRef.current = {};

    async function initMap() {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;
      const L = (await import('leaflet')).default;
      leafletLibRef.current = L;

      const startLat =
        pickMode && initialCoords?.lat
          ? initialCoords.lat
          : pickMode
          ? pickedCoords.lat
          : validProps.length > 0
          ? validProps[0].coordinates!.lat
          : 36.651042;
      const startLng =
        pickMode && initialCoords?.lng
          ? initialCoords.lng
          : pickMode
          ? pickedCoords.lng
          : validProps.length > 0
          ? validProps[0].coordinates!.lng
          : 51.201089;

      mapInstance = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([startLat, startLng], pickMode ? 16 : 14);

      const tileUrl =
        mapLayer === 'satellite'
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

      tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(mapInstance);

      if (!pickMode) {
        mapInstance.on('click', () => {
          setSelectedProperty(null);
          setHighlightedPropertyId(null);
        });

        validProps.forEach((prop) => {
          const lat = prop.coordinates!.lat;
          const lng = prop.coordinates!.lng;

          const customIcon = L.divIcon({
            className: 'custom-pin',
            html: buildPinHtml(prop, false),
            iconSize: [60, 24],
            iconAnchor: [30, 12],
          });

          const marker = L.marker([lat, lng], { icon: customIcon }).addTo(mapInstance);
          markersMapRef.current[prop.id] = { marker, prop, L };

          marker.on('click', (e: any) => {
            if (e?.originalEvent) {
              L.DomEvent.stopPropagation(e.originalEvent);
            }
            setSelectedProperty(prop);
            setHighlightedPropertyId(prop.id);
          });
        });

        if (validProps.length > 1 && !showTarhHadiOverlay) {
          const group = L.featureGroup(
            validProps.map((p) => L.marker([p.coordinates!.lat, p.coordinates!.lng]))
          );
          mapInstance.fitBounds(group.getBounds().pad(0.2));
        }
      } else {
        // Precision Target Reticle + Pin Icon anchored at exact center [22, 22]
        const pickIcon = L.divIcon({
          className: 'pick-pin',
          html: `
            <div style="
              width: 44px;
              height: 44px;
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: grab;
            ">
              <div style="
                width: 38px;
                height: 38px;
                border-radius: 50%;
                background: rgba(241, 203, 131, 0.28);
                border: 2.5px solid #f1cb83;
                box-shadow: 0 0 20px rgba(241, 203, 131, 0.9), 0 4px 12px rgba(0,0,0,0.8);
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <div style="
                  width: 12px;
                  height: 12px;
                  border-radius: 50%;
                  background: #f1cb83;
                  border: 2.5px solid #070d1a;
                "></div>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const draggableMarker = L.marker([startLat, startLng], {
          icon: pickIcon,
          draggable: true,
          zIndexOffset: 2000,
        }).addTo(mapInstance);

        pickMarkerRef.current = draggableMarker;

        draggableMarker.on('dragend', (e: any) => {
          const pos = e.target.getLatLng();
          setPickedCoords({
            lat: Number(pos.lat.toFixed(6)),
            lng: Number(pos.lng.toFixed(6)),
          });
        });

        mapInstance.on('click', (e: any) => {
          draggableMarker.setLatLng(e.latlng);
          setPickedCoords({
            lat: Number(e.latlng.lat.toFixed(6)),
            lng: Number(e.latlng.lng.toFixed(6)),
          });
        });
      }

      leafletMapRef.current = mapInstance;
    }

    initMap();

    return () => {
      tarhOverlayRef.current = null;
      pickMarkerRef.current = null;
      refMarkersRef.current = [];
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [pickMode, validProps.length]);

  // Dynamically switch base tile layer without destroying map or losing zoom/pan/pickedCoords
  useEffect(() => {
    const mapInstance = leafletMapRef.current;
    const L = leafletLibRef.current;
    if (!mapInstance || !L) return;

    if (tileLayerRef.current) {
      mapInstance.removeLayer(tileLayerRef.current);
    }
    const tileUrl =
      mapLayer === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(mapInstance);
  }, [mapLayer]);

  // Dynamically manage georeferenced Kelarabad Tarh Hadi overlay & reference point markers without resetting map
  useEffect(() => {
    const mapInstance = leafletMapRef.current;
    const L = leafletLibRef.current;
    if (!mapInstance || !L) return;

    if (tarhOverlayRef.current) {
      mapInstance.removeLayer(tarhOverlayRef.current);
      tarhOverlayRef.current = null;
    }

    refMarkersRef.current.forEach((m) => mapInstance.removeLayer(m));
    refMarkersRef.current = [];

    if (showTarhHadiOverlay) {
      const mapUrl = getActiveTarhHadiMapUrl(liveTarhConfig);
      const bounds = getTarhHadiGeographicBounds(liveTarhConfig);
      const overlay = L.imageOverlay(mapUrl, bounds, {
        opacity: overlayOpacity,
        interactive: false,
      }).addTo(mapInstance);
      tarhOverlayRef.current = overlay;
    }

    // Show numbered Reference Point markers on satellite map when calibrating or when Tarh Hadi overlay is shown
    if (showTarhHadiOverlay || calibratingPointId) {
      liveTarhConfig.controlPoints.forEach((cp, idx) => {
        if (pickMode && calibratingPointId === cp.id) return;
        const refIcon = L.divIcon({
          className: 'tarh-ref-pin',
          html: `
            <div style="
              width: 28px;
              height: 28px;
              border-radius: 50%;
              background: #070d1a;
              color: #f1cb83;
              border: 2px solid #f1cb83;
              font-weight: 800;
              font-size: 11px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 10px rgba(0,0,0,0.8);
            ">${toPersianDigits(idx + 1)}</div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const m = L.marker([cp.lat, cp.lng], {
          icon: refIcon,
          interactive: false,
        }).addTo(mapInstance);
        refMarkersRef.current.push(m);
      });
    }
  }, [showTarhHadiOverlay, liveTarhConfig, calibratingPointId, pickMode]);

  // Update overlay opacity dynamically
  useEffect(() => {
    if (tarhOverlayRef.current && typeof tarhOverlayRef.current.setOpacity === 'function') {
      tarhOverlayRef.current.setOpacity(overlayOpacity);
    }
  }, [overlayOpacity]);

  // Update pin highlight state whenever highlightedPropertyId or selectedProperty changes
  useEffect(() => {
    const activeId = highlightedPropertyId || selectedProperty?.id || null;
    Object.values(markersMapRef.current).forEach(({ marker, prop, L }: any) => {
      const isHighlighted = prop.id === activeId;
      const updatedIcon = L.divIcon({
        className: 'custom-pin',
        html: buildPinHtml(prop, isHighlighted),
        iconSize: [60, 24],
        iconAnchor: [30, 12],
      });
      marker.setIcon(updatedIcon);
      marker.setZIndexOffset(isHighlighted ? 1000 : 0);
    });
  }, [highlightedPropertyId, selectedProperty]);

  // Escape key closes the selected property card first, or closes the map screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedProperty) {
          setSelectedProperty(null);
          setHighlightedPropertyId(null);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProperty, onBack]);

  const handleFlyToSelectedProperty = () => {
    if (!selectedProperty?.coordinates) return;
    const { lat, lng } = selectedProperty.coordinates;
    setHighlightedPropertyId(selectedProperty.id);
    if (leafletMapRef.current) {
      leafletMapRef.current.flyTo([lat, lng], 18, {
        animate: true,
        duration: 0.9,
      });
    }
  };

  const handlePickMyGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatusMsg('مرورگر از موقعیت‌یاب GPS پشتیبانی نمی‌کند.');
      return;
    }
    setGpsStatusMsg('در حال دریافت موقعیت GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setPickedCoords({ lat, lng });
        if (pickMarkerRef.current) {
          pickMarkerRef.current.setLatLng([lat, lng]);
        }
        if (leafletMapRef.current) {
          leafletMapRef.current.flyTo([lat, lng], 17, { animate: true, duration: 0.8 });
        }
        setGpsStatusMsg('موقعیت فعلی GPS روی نقشه ثبت شد ✓');
        setTimeout(() => setGpsStatusMsg(null), 2500);
      },
      () => {
        setGpsStatusMsg('خطا در دریافت GPS؛ لطفاً روی نقشه لمس کنید.');
        setTimeout(() => setGpsStatusMsg(null), 2500);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleUseMapCenterForPick = () => {
    if (!leafletMapRef.current) return;
    const c = leafletMapRef.current.getCenter();
    const lat = Number(c.lat.toFixed(6));
    const lng = Number(c.lng.toFixed(6));
    setPickedCoords({ lat, lng });
    if (pickMarkerRef.current) {
      pickMarkerRef.current.setLatLng([lat, lng]);
    }
  };

  const statusDotColor =
    selectedProperty?.status === 'فعال'
      ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
      : selectedProperty?.status === 'در مذاکره'
      ? 'bg-[#f1cb83] shadow-[0_0_6px_#f1cb83]'
      : selectedProperty?.status === 'رزرو شده'
      ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]'
      : 'bg-rose-400 shadow-[0_0_6px_#fb7185]';

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-[#070d1a] text-right">
      {/* Map Top Bar (Always-visible Close / Back button + Title + Tarh Hadi Toggle + Layer Toggle) */}
      <div
        className="absolute top-0 inset-x-0 z-[1000] px-3 pb-3 flex flex-col gap-2 bg-gradient-to-b from-[#070d1a]/95 via-[#070d1a]/75 to-transparent pointer-events-none"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 pointer-events-auto min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="بستن نقشه و بازگشت"
              className="min-h-[44px] h-11 px-3.5 rounded-xl bg-[#091224]/85 hover:bg-[#0d1830] backdrop-blur-xl border border-[#f1cb83]/45 text-slate-100 hover:text-[#f1cb83] shadow-[0_6px_20px_rgba(0,0,0,0.65)] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[20px] text-[#f1cb83]">
                arrow_forward
              </span>
              <span className="text-xs font-extrabold">بازگشت</span>
            </button>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#091224]/80 backdrop-blur-xl border border-white/15 shadow-md min-w-0">
              <span className="material-symbols-outlined text-[16px] text-[#f1cb83] shrink-0">
                satellite_alt
              </span>
              <span className="text-xs font-bold text-slate-100 truncate">
                {pickMode
                  ? pickLabel || 'انتخاب موقعیت روی نقشه ماهواره‌ای'
                  : 'نقشه جامع و ماهواره‌ای فایل‌ها'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
            {/* Kelarabad Tarh Hadi Overlay Toggle */}
            <button
              type="button"
              onClick={() => setShowTarhHadiOverlay((v) => !v)}
              className={`min-h-[44px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 backdrop-blur-xl shadow-[0_6px_20px_rgba(0,0,0,0.65)] transition-all cursor-pointer ${
                showTarhHadiOverlay
                  ? 'bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] border-white'
                  : 'bg-[#091224]/85 border-[#f1cb83]/40 text-[#f1cb83] hover:bg-[#0d1830]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">layers</span>
              <span>طرح هادی</span>
            </button>

            {/* Layer Toggle */}
            <div className="flex p-1 rounded-xl bg-[#091224]/85 border border-[#f1cb83]/35 backdrop-blur-xl shadow-[0_6px_20px_rgba(0,0,0,0.65)]">
              <button
                type="button"
                onClick={() => setMapLayer('satellite')}
                className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mapLayer === 'satellite'
                    ? 'bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] shadow-sm'
                    : 'text-slate-200 hover:text-white'
                }`}
              >
                ماهواره‌ای
              </button>
              <button
                type="button"
                onClick={() => setMapLayer('street')}
                className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mapLayer === 'street'
                    ? 'bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] shadow-sm'
                    : 'text-slate-200 hover:text-white'
                }`}
              >
                نقشه
              </button>
            </div>

            {/* Dedicated 44x44 Close (×) button on top-left */}
            <button
              type="button"
              onClick={onBack}
              aria-label="بستن نقشه"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-[#091224]/85 hover:bg-rose-500/20 backdrop-blur-xl border border-[#f1cb83]/40 hover:border-rose-400/50 text-slate-100 hover:text-rose-200 shadow-[0_6px_20px_rgba(0,0,0,0.65)] flex items-center justify-center active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Opacity Slider Bar when Tarh Hadi Overlay is Active */}
        {showTarhHadiOverlay && (
          <div className="pointer-events-auto max-w-md mx-auto w-full px-3 py-2 rounded-xl bg-[#091224]/90 backdrop-blur-xl border border-[#f1cb83]/40 flex items-center justify-between gap-3 shadow-lg">
            <span className="text-[11px] font-bold text-[#f1cb83] whitespace-nowrap">
              شفافیت طرح هادی کلارآباد: {toPersianDigits(Math.round(overlayOpacity * 100))}٪
            </span>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              className="w-full accent-[#f1cb83] cursor-pointer"
            />
          </div>
        )}

        {gpsStatusMsg && (
          <div className="pointer-events-none max-w-sm mx-auto px-3 py-2 rounded-xl bg-[#091224]/95 border border-emerald-400/40 text-emerald-300 text-xs font-bold text-center shadow-lg">
            {gpsStatusMsg}
          </div>
        )}
      </div>

      {/* Map Leaflet Container */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Pick Mode Bottom Confirm Bar */}
      {pickMode && (
        <div
          className="fixed inset-x-3 sm:inset-x-4 max-w-[540px] mx-auto z-[1000] p-3.5 rounded-2xl glass-panel border border-[#f1cb83]/50 shadow-2xl flex flex-col gap-2.5"
          style={{
            bottom: 'calc(var(--nav-h, 80px) + env(safe-area-inset-bottom, 0px) + 12px)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col text-xs min-w-0">
              <span className="text-slate-300 text-[11px] font-bold truncate">
                {pickLabel || 'روی نقشه لمس کنید یا نشانگر طلایی را بکشید:'}
              </span>
              <span className="text-[#f1cb83] font-mono font-bold text-xs" dir="ltr">
                {pickedCoords.lat.toFixed(6)}, {pickedCoords.lng.toFixed(6)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleUseMapCenterForPick}
                className="min-h-[44px] px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                title="انتقال نشانگر به مرکز دید فعلی نقشه"
              >
                <span className="material-symbols-outlined text-[16px] text-[#f1cb83]">
                  filter_center_focus
                </span>
                <span>مرکز صفحه</span>
              </button>
              <button
                type="button"
                onClick={handlePickMyGpsLocation}
                className="min-h-[44px] px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                title="ثبت موقعیت GPS فعلی شما"
              >
                <span className="material-symbols-outlined text-[16px] text-[#f1cb83]">
                  my_location
                </span>
                <span>GPS</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onConfirmPickLocation?.({
                    lat: Number(pickedCoords.lat.toFixed(6)),
                    lng: Number(pickedCoords.lng.toFixed(6)),
                  })
                }
                className="gold-cta-sheen min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-xs shadow-md cursor-pointer shrink-0"
              >
                تأیید موقعیت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pin Tap Bottom Property Card (Positioned strictly above BottomNavigationBar) */}
      {selectedProperty && !pickMode && (
        <div
          key={selectedProperty.id}
          className="fixed inset-x-3 sm:inset-x-4 max-w-[520px] mx-auto z-[1000] p-4 rounded-2xl glass-panel border border-[#f1cb83]/40 border-t-2 border-t-[#f1cb83]/85 shadow-[0_-10px_35px_rgba(0,0,0,0.8)] space-y-2.5 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-200"
          style={{
            bottom: 'calc(var(--nav-h, 80px) + env(safe-area-inset-bottom, 0px) + 12px)',
            maxHeight: '40dvh',
          }}
        >
          {/* Header Row: Code chip + status dot on right, 44x44 close button on left */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-[#f1cb83]/35">
              <span className={`w-2 h-2 rounded-full ${statusDotColor}`} />
              <span className="text-xs font-mono font-bold text-[#f1cb83]">
                {selectedProperty.code}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedProperty(null);
                setHighlightedPropertyId(null);
              }}
              aria-label="بستن کارت ملک"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center text-slate-300 hover:text-white text-lg leading-none active:scale-95 transition-all cursor-pointer shrink-0"
            >
              ×
            </button>
          </div>

          {/* Title & Area/Price */}
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white leading-snug">
              {selectedProperty.title}
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>{toPersianDigits(selectedProperty.area)} متر</span>
              <span>•</span>
              <span>{formatPriceShort(selectedProperty.totalPrice)}</span>
            </p>
          </div>

          {/* Question */}
          <div className="text-xs font-semibold text-slate-200 pt-0.5">
            «می‌خواهی روی نقشه نشانت بدهم یا فایلش را بیاورم؟»
          </div>

          {/* Two Equal-Width Action Buttons (48px height, 10px gap) */}
          <div className="grid grid-cols-2 gap-[10px] pt-1">
            <button
              type="button"
              onClick={handleFlyToSelectedProperty}
              className="gold-cta-sheen h-[48px] min-h-[44px] rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-xs shadow-[0_4px_16px_rgba(241,203,131,0.35)] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">my_location</span>
              <span>نشانم بده</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenPropertyDetail(selectedProperty)}
              className="h-[48px] min-h-[44px] rounded-xl bg-[#0a1328]/85 backdrop-blur-md border border-[#f1cb83]/45 hover:border-[#f1cb83] text-slate-100 font-bold text-xs shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">
                description
              </span>
              <span>فایلش را بیاور</span>
            </button>
          </div>
        </div>
      )}

      {/* Routing Chooser */}
      {selectedProperty && (
        <MapAppChooserModal
          isOpen={isRoutingModalOpen}
          onClose={() => setIsRoutingModalOpen(false)}
          lat={selectedProperty.coordinates!.lat}
          lng={selectedProperty.coordinates!.lng}
          title={selectedProperty.title}
        />
      )}
    </div>
  );
};
