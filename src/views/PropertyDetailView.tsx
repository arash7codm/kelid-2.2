import React, { useState, useEffect, useRef } from 'react';
import { Property, Applicant, PropertyMediaItem, PropertyDocumentItem } from '../types';
import { Logo } from '../components/Logo';
import { MapAppChooserModal, openMapChooser } from '../components/MapAppChooserModal';
import {
  formatPriceInWords,
  formatAreaInWords,
  formatWithCommas,
  toPersianDigits,
  formatPersianNumber,
  formatPriceShort,
  formatDurationPersian,
} from '../utils/jalali';
import { findMatchesForProperty } from '../services/matching';
import { resolveBlobUrl, preloadAllBlobs } from '../db';
import { KelarabadTarhHadiCard } from '../components/KelarabadTarhHadiModal';

interface PropertyDetailViewProps {
  property: Property;
  applicants: Applicant[];
  onBack: () => void;
  onEdit: (prop: Property) => void;
  onDelete?: (propertyId: string) => void;
  onUpdateProperty?: (updatedProp: Property) => void;
  onOpenMap: (coords?: { lat: number; lng: number }) => void;
  onOpenApplicantDetail: (app: Applicant) => void;
  onOpenMediaViewer?: (item: any) => void;
  currentUserRole?: string;
}

export const PropertyDetailView: React.FC<PropertyDetailViewProps> = ({
  property,
  applicants,
  onBack,
  onEdit,
  onDelete,
  onUpdateProperty,
  onOpenMap,
  onOpenApplicantDetail,
  currentUserRole = 'مدیر',
}) => {
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [voiceCurrentTime, setVoiceCurrentTime] = useState(0);
  const [voiceTotalDuration, setVoiceTotalDuration] = useState<number>(
    property.voiceNote?.durationSeconds || 0
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState(false);
  const [copiedCoordsToast, setCopiedCoordsToast] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [, setBlobTick] = useState(0);

  // In-app Lightbox state for Media & Documents
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
  const [activeDocPreview, setActiveDocPreview] = useState<{
    name: string;
    type: string;
    url: string;
  } | null>(null);

  // Normalize media items from property.media or property.images BEFORE any useEffect references resolvedMedia
  const rawMedia: PropertyMediaItem[] = Array.isArray(property.media) && property.media.length > 0
    ? property.media
    : Array.isArray(property.images) && property.images.length > 0
    ? property.images
    : [];

  const resolvedMedia = rawMedia
    .filter(Boolean)
    .map((m) => ({
      ...m,
      resolvedUrl: resolveBlobUrl(m.ref || m.url),
      isDrone: Boolean(m.type === 'drone' || m.isHelicopterShot),
    }))
    .filter((m) => Boolean(m.resolvedUrl));

  const droneShotsCount = resolvedMedia.filter((m) => m.isDrone).length;

  // Voice Note URL resolution
  const resolvedVoiceUrl = resolveBlobUrl(
    property.voiceNote?.audioRef || (property as any).voiceNotes?.[0]?.audioUrl
  );
  const voiceTranscript =
    property.voiceNote?.transcriptText ||
    (property as any).voiceNotes?.[0]?.transcript ||
    property.address ||
    '';

  // Documents list
  const documentsList: PropertyDocumentItem[] = Array.isArray(property.documents)
    ? property.documents
    : [];

  useEffect(() => {
    preloadAllBlobs().then(() => setBlobTick((t) => t + 1));
  }, [property.id, property.updatedAt]);

  useEffect(() => {
    setVoiceTotalDuration(property.voiceNote?.durationSeconds || 0);
    setVoiceCurrentTime(0);
    setIsVoicePlaying(false);
  }, [property.id, property.voiceNote?.audioRef, property.voiceNote?.durationSeconds]);

  // Close fullscreen media or document viewer on Escape key, and navigate with Arrow keys
  useEffect(() => {
    if (activeLightboxIndex === null && activeDocPreview === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveLightboxIndex(null);
        setActiveDocPreview(null);
      } else if (activeLightboxIndex !== null && resolvedMedia.length > 1) {
        if (e.key === 'ArrowRight') {
          setActiveLightboxIndex((prev) =>
            prev !== null ? (prev - 1 + resolvedMedia.length) % resolvedMedia.length : null
          );
        } else if (e.key === 'ArrowLeft') {
          setActiveLightboxIndex((prev) =>
            prev !== null ? (prev + 1) % resolvedMedia.length : null
          );
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLightboxIndex, activeDocPreview, resolvedMedia.length]);

  // Matched applicants
  const matchedApplicants = findMatchesForProperty(property, applicants, 70);

  // Coordinates
  const hasCoords = Boolean(property.coordinates?.lat && property.coordinates?.lng);
  const lat = property.coordinates?.lat || 36.651042;
  const lng = property.coordinates?.lng || 51.201089;

  const handleCopyCoords = () => {
    navigator.clipboard?.writeText(`${lat}, ${lng}`);
    setCopiedCoordsToast(true);
    setTimeout(() => setCopiedCoordsToast(false), 2000);
  };

  const isAdmin = currentUserRole === 'مدیر' || currentUserRole === 'admin';

  const handleToggleVoicePlay = () => {
    if (!audioRef.current || !resolvedVoiceUrl) return;
    if (isVoicePlaying) {
      audioRef.current.pause();
      setIsVoicePlaying(false);
    } else {
      audioRef.current.play().catch((err) => {
        console.error('Audio play error:', err);
      });
      setIsVoicePlaying(true);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
    if (bytes < 1024 * 1024) return `${toPersianDigits(Math.round(bytes / 1024))} کیلوبایت`;
    return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
  };

  // Utilities state
  const hasWater = Boolean(property.utilities?.water);
  const hasElectricity = Boolean(property.utilities?.electricity ?? property.utilities?.power);
  const hasGas = Boolean(property.utilities?.gas);
  const hasFiber = Boolean(property.utilities?.fiber);

  const activeUtilitiesList = [
    hasWater && 'آب',
    hasElectricity && 'برق',
    hasGas && 'گاز',
    hasFiber && 'فیبر نوری',
  ].filter(Boolean) as string[];

  const statusDotColor =
    property.status === 'فعال'
      ? 'bg-emerald-400'
      : property.status === 'در مذاکره'
      ? 'bg-[#f1cb83]'
      : property.status === 'رزرو شده'
      ? 'bg-sky-400'
      : property.status === 'فروخته‌شده'
      ? 'bg-rose-400'
      : 'bg-slate-400';

  const commissionDisplay = property.commissionRate || property.commissionText || 'ثبت نشده';
  const settlementDisplay = property.paymentMethod || property.settlementMethod || 'ثبت نشده';
  const negotiableDisplay = (property.isNegotiable ?? (property as any).negotiable) ? 'امکان‌پذیر' : 'مقطوع';
  const accessRouteDisplay = property.accessPath || property.accessRoute || '';

  // Extra Section C items if filled
  const extraTechnicalSpecs = [
    (property as any).builtArea ? { label: 'زیربنا / بنا', value: `${formatPersianNumber((property as any).builtArea)} متر مربع` } : null,
    (property as any).frontageWidth ? { label: 'بر ملک', value: `${formatPersianNumber((property as any).frontageWidth)} متر` } : null,
    (property as any).buildingAge ? { label: 'سن بنا', value: (property as any).buildingAge } : null,
    (property as any).bedroomsCount ? { label: 'تعداد خواب', value: `${formatPersianNumber((property as any).bedroomsCount)} خواب` } : null,
    (property as any).unitsCount ? { label: 'تعداد واحد / طبقات', value: `${formatPersianNumber((property as any).unitsCount)}` } : null,
    (property as any).PoolType ? { label: 'استخر و جکوزی', value: (property as any).PoolType } : null,
    (property as any).HeatingCooling ? { label: 'تاسیسات گرمایش و سرمایش', value: (property as any).HeatingCooling } : null,
    (property as any).SoilType ? { label: 'نوع خاک و مقاومت', value: (property as any).SoilType } : null,
    (property as any).topography ? { label: 'توپوگرافی زمین', value: (property as any).topography } : null,
    (property as any).adjacentType ? { label: 'نوع همسایگی و مجاورت', value: (property as any).adjacentType } : null,
    (property as any).coastDistance ? { label: 'فاصله تا ساحل دریا', value: `${formatPersianNumber((property as any).coastDistance)} متر` } : null,
    (property as any).forestDistance ? { label: 'فاصله تا جنگل / کوهپایه', value: `${formatPersianNumber((property as any).forestDistance)} متر` } : null,
    (property as any).mainRoadDistance ? { label: 'فاصله تا جاده اصلی', value: `${formatPersianNumber((property as any).mainRoadDistance)} متر` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="flex flex-col w-full pb-44 text-right">
      {/* 1. Sticky Header */}
      <header className="sticky top-0 z-30 pt-2 pb-3 bg-[#080d1a]/85 backdrop-blur-2xl border-b border-[#f1cb83]/20 shadow-md">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              aria-label="بازگشت"
              className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f1cb83]/10 border border-[#f1cb83]/30">
              <span className={`w-2 h-2 rounded-full ${statusDotColor} animate-pulse`} />
              <span className="text-xs font-bold text-[#f1cb83] font-mono">
                {property.status} • {property.code}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Logo className="h-10 w-auto object-contain filter drop-shadow-[0_0_10px_rgba(241,203,131,0.6)]" />
          </div>
        </div>
      </header>

      {/* 2. Title & Basic Info */}
      <div className="space-y-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-full bg-[#f1cb83]/20 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold font-mono">
              کد پرونده: {property.code}
            </span>
            {property.propertyType && (
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-200 text-xs font-semibold">
                {property.propertyType}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400">
            ثبت: {toPersianDigits(property.registrationDate || '')}
          </span>
        </div>

        <h1 className="text-lg font-extrabold text-slate-100 leading-snug">
          {property.title}
        </h1>
        <p className="text-xs text-slate-400 flex items-center gap-1 flex-wrap">
          <span className="material-symbols-outlined text-[16px] text-[#f1cb83]">pin_drop</span>
          <span>
            {[property.province, property.city, property.district].filter(Boolean).join('، ')}
            {accessRouteDisplay ? ` — ${accessRouteDisplay}` : ''}
          </span>
        </p>

        {/* Quick Badges */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          {property.deedType && (
            <span className="px-3 py-1 rounded-xl glass-panel-subtle text-xs text-[#f1cb83] font-semibold flex items-center gap-1 shrink-0">
              <span className="material-symbols-outlined text-[15px]">workspace_premium</span>
              {property.deedType}
            </span>
          )}
          {property.zoningStatus && (
            <span className="px-3 py-1 rounded-xl glass-panel-subtle text-xs text-emerald-300 font-semibold flex items-center gap-1 shrink-0">
              <span className="material-symbols-outlined text-[15px]">verified</span>
              {property.zoningStatus}
            </span>
          )}
          {property.permitStatus && (
            <span className="px-3 py-1 rounded-xl glass-panel-subtle text-xs text-sky-300 font-semibold flex items-center gap-1 shrink-0">
              <span className="material-symbols-outlined text-[15px]">assignment_turned_in</span>
              {property.permitStatus}
            </span>
          )}
          {(property.isNegotiable ?? (property as any).negotiable) && (
            <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-400/30 text-xs text-amber-300 font-semibold flex items-center gap-1 shrink-0">
              <span className="material-symbols-outlined text-[15px]">handshake</span>
              قابل مذاکره
            </span>
          )}
        </div>
      </div>

      {/* 3. Valuation Vault Card (§9 item 1) */}
      <div className="rounded-2xl glass-panel p-4 my-3 border border-[#f1cb83]/30 shadow-xl space-y-3 relative overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs text-slate-400 font-medium block">ارزش‌گذاری کل کارشناسی</span>
            <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
              <span className="text-2xl font-black text-[#f1cb83] font-mono">
                {formatPersianNumber(property.totalPrice)}
              </span>
              <span className="text-xs text-[#f1cb83] font-bold">تومان</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#f1cb83]/15 text-[#f1cb83] font-bold">
                {formatPriceShort(property.totalPrice)}
              </span>
            </div>
            <p className="text-xs text-[#f1cb83]/90 font-medium mt-1">
              معادل: {formatPriceInWords(property.totalPrice)}
            </p>
          </div>

          <div className="p-2.5 rounded-xl glass-panel-subtle text-center border border-[#f1cb83]/20 shadow-sm shrink-0">
            <span className="text-[10px] text-slate-400 block">مساحت عرصه</span>
            <span className="text-base font-bold text-slate-100 font-mono block">
              {formatPersianNumber(property.area)} <span className="text-xs font-normal">متر مربع</span>
            </span>
            <span className="text-[10px] text-[#f1cb83]/80 block mt-0.5">
              {formatAreaInWords(property.area)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
          <div className="p-2.5 rounded-xl glass-panel-subtle">
            <span className="text-[10px] text-slate-400 block">بهای هر متر مربع</span>
            <span className="text-sm font-bold text-slate-100 font-mono block mt-0.5">
              {property.pricePerMeter > 0 ? `${formatPersianNumber(property.pricePerMeter)} تومان` : 'ثبت نشده'}
            </span>
            {property.pricePerMeter > 0 && (
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {formatPriceInWords(property.pricePerMeter)}
              </span>
            )}
          </div>

          <div className="p-2.5 rounded-xl glass-panel-subtle">
            <span className="text-[10px] text-slate-400 block">حق کمیسیون / شیرینی</span>
            <span className="text-sm font-bold text-[#f1cb83] block mt-0.5">
              {commissionDisplay}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">توافق کمیسیون پرونده</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 text-xs text-slate-300 flex-wrap gap-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#f1cb83]" />
            نحوه تسویه: <strong className="text-slate-100">{settlementDisplay}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            مذاکره و تخفیف: <strong className="text-slate-100">{negotiableDisplay}</strong>
          </span>
        </div>
      </div>

      {/* 4. مستندات تصویری و هوایی (§9 item 2) */}
      <div className="space-y-2 my-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">photo_camera</span>
            <h3 className="text-sm font-bold text-slate-100">مستندات تصویری و هوایی</h3>
          </div>
          <span className="text-xs text-slate-400">
            {resolvedMedia.length > 0
              ? `${toPersianDigits(resolvedMedia.length)} تصویر${
                  droneShotsCount > 0 ? ` (${toPersianDigits(droneShotsCount)} هلی‌شات)` : ''
                }`
              : 'بدون تصویر ثبت‌شده'}
          </span>
        </div>

        {resolvedMedia.length === 0 ? (
          <div className="rounded-2xl glass-panel p-5 border border-white/10 text-center space-y-2">
            <span className="material-symbols-outlined text-3xl text-slate-500">hide_image</span>
            <p className="text-xs text-slate-400">
              هنوز تصویر یا هلی‌شاتی برای این پرونده بارگذاری نشده است.
            </p>
            <button
              type="button"
              onClick={() => onEdit(property)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#f1cb83]/15 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
              <span>افزودن تصویر / هلی‌شات در ویرایش</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {/* Primary Card */}
            <div
              onClick={() => setActiveLightboxIndex(0)}
              className={`${
                resolvedMedia.length === 1 ? 'col-span-3 h-48' : 'col-span-2 h-40'
              } relative rounded-2xl overflow-hidden glass-panel border border-[#f1cb83]/30 cursor-pointer shadow-md group`}
            >
              <img
                src={resolvedMedia[0].resolvedUrl}
                alt={resolvedMedia[0].caption || property.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5 justify-between">
                <span className="text-xs font-bold text-white truncate">
                  {resolvedMedia[0].caption || property.title}
                </span>
                {resolvedMedia[0].isDrone && (
                  <span className="px-2 py-0.5 rounded bg-black/75 text-[#f1cb83] border border-[#f1cb83]/40 font-mono text-[10px] font-bold flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined text-[12px]">flight</span>
                    هلی‌شات
                  </span>
                )}
              </div>
            </div>

            {/* Side Media */}
            {resolvedMedia.length > 1 && (
              <div className="flex flex-col gap-2">
                <div
                  onClick={() => setActiveLightboxIndex(1)}
                  className={`relative ${
                    resolvedMedia.length > 2 ? 'h-[76px]' : 'h-40'
                  } rounded-xl overflow-hidden glass-panel border border-white/10 cursor-pointer group`}
                >
                  <img
                    src={resolvedMedia[1].resolvedUrl}
                    alt={resolvedMedia[1].caption || 'تصویر دوم'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <span className="absolute bottom-1 right-1.5 text-[10px] font-semibold text-white bg-black/70 px-1.5 py-0.5 rounded truncate max-w-[90%]">
                    {resolvedMedia[1].isDrone
                      ? 'هلی‌شات'
                      : resolvedMedia[1].caption || 'نمای ملک'}
                  </span>
                </div>

                {resolvedMedia.length > 2 && (
                  <div
                    onClick={() => setActiveLightboxIndex(2)}
                    className="relative h-[76px] rounded-xl overflow-hidden glass-panel border border-[#f1cb83]/30 flex items-center justify-center cursor-pointer bg-black/60 group"
                  >
                    <img
                      src={resolvedMedia[2].resolvedUrl}
                      alt="سایر تصاویر"
                      className="absolute inset-0 w-full h-full object-cover opacity-35 group-hover:scale-105 transition-transform"
                    />
                    <span className="relative z-10 text-xs font-bold text-[#f1cb83]">
                      +{toPersianDigits(resolvedMedia.length - 2)} تصویر دیگر
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. شناسنامه فنی و کاربری و انشعابات (§9 item 3) */}
      <div className="space-y-2.5 my-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">architecture</span>
          <h3 className="text-sm font-bold text-slate-100">شناسنامه فنی، کاربری و انشعابات</h3>
        </div>

        {/* 4 Utilities Tiles Row */}
        <div className="p-3 rounded-2xl glass-panel border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#f1cb83]">bolt</span>
              وضعیت انشعابات و زیرساخت‌ها
            </span>
            {property.utilitiesLocation && (
              <span className="text-[11px] px-2 py-0.5 rounded-lg bg-[#f1cb83]/15 text-[#f1cb83] font-semibold">
                محل انشعاب: {property.utilitiesLocation}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'آب', active: hasWater, icon: 'water_drop' },
              { label: 'برق', active: hasElectricity, icon: 'bolt' },
              { label: 'گاز', active: hasGas, icon: 'local_fire_department' },
              { label: 'فیبر نوری', active: hasFiber, icon: 'router' },
            ].map((u) => (
              <div
                key={u.label}
                className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center gap-1 ${
                  u.active
                    ? 'bg-[#f1cb83]/15 border-[#f1cb83]/50 text-[#f1cb83]'
                    : 'bg-white/[0.02] border-white/10 text-slate-500'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{u.icon}</span>
                <span className="text-[11px] font-bold">{u.label}</span>
                <span className="text-[9px] font-semibold">
                  {u.active ? 'متصل / موجود' : 'ندارد'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl glass-panel space-y-1">
            <span className="text-[10px] text-slate-400 block">تعداد بر و معبر</span>
            <span className="text-xs font-bold text-slate-100 block">
              {property.frontageCount || 'ثبت نشده'}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {property.passageWidth
                ? `عرض معبر: ${formatPersianNumber(property.passageWidth)} متر`
                : (property as any).passageType || '—'}
            </span>
          </div>

          <div className="p-3 rounded-xl glass-panel space-y-1">
            <span className="text-[10px] text-slate-400 block">ابعاد و قواره</span>
            <span className="text-xs font-bold text-slate-100 block font-mono">
              {property.length || property.width
                ? `${property.length ? formatPersianNumber(property.length) : '—'} × ${
                    property.width ? formatPersianNumber(property.width) : '—'
                  } متر`
                : 'ثبت نشده'}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {property.lotShape ? `شکل هندسی: ${property.lotShape}` : '—'}
            </span>
          </div>

          <div className="p-3 rounded-xl glass-panel space-y-1">
            <span className="text-[10px] text-slate-400 block">جهت و چشم‌انداز</span>
            <span className="text-xs font-bold text-slate-100 block">
              {property.orientation || 'ثبت نشده'}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {(property as any).views && (property as any).views.length > 0
                ? (property as any).views.join('، ')
                : '—'}
            </span>
          </div>

          <div className="p-3 rounded-xl glass-panel space-y-1">
            <span className="text-[10px] text-slate-400 block">نوع کاربری و بافت</span>
            <span className="text-xs font-bold text-[#f1cb83] block">
              {property.landUsage || property.propertyType || 'ثبت نشده'}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {property.zoningStatus || property.permitStatus || '—'}
            </span>
          </div>

          <div className="p-3 rounded-xl glass-panel space-y-1">
            <span className="text-[10px] text-slate-400 block">خلاصه انشعابات</span>
            <span className="text-xs font-bold text-slate-100 block">
              {property.utilitiesLocation || (activeUtilitiesList.length > 0 ? 'موجود' : 'ثبت نشده')}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {activeUtilitiesList.length > 0 ? activeUtilitiesList.join('، ') : 'انشعابی انتخاب نشده'}
            </span>
          </div>

          <div className="p-3 rounded-xl glass-panel space-y-1">
            <span className="text-[10px] text-slate-400 block">وضعیت سازه و حصار</span>
            <span className="text-xs font-bold text-slate-100 block">
              {property.structureStatus || 'ثبت نشده'}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {(property as any).enclosureStatus || '—'}
            </span>
          </div>

          {extraTechnicalSpecs.map((spec, idx) => (
            <div key={idx} className="p-3 rounded-xl glass-panel space-y-1">
              <span className="text-[10px] text-slate-400 block">{spec.label}</span>
              <span className="text-xs font-bold text-slate-100 block">{spec.value}</span>
            </div>
          ))}
        </div>

        {/* Special Features, Description, Legal Notes if present */}
        {(((property as any).specialFeatures && (property as any).specialFeatures.length > 0) ||
          (property as any).description ||
          (property as any).legalNotes ||
          (property as any).propertyAdvantages) && (
          <div className="p-3.5 rounded-2xl glass-panel border border-white/10 space-y-2.5">
            {(property as any).specialFeatures && (property as any).specialFeatures.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] text-[#f1cb83] font-bold block">امکانات و ویژگی‌های شاخص:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(property as any).specialFeatures.map((feat: string, i: number) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-[#f1cb83]/10 border border-[#f1cb83]/25 text-[11px] font-semibold text-[#f1cb83]"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(property as any).propertyAdvantages && (
              <div className="space-y-1">
                <span className="text-[11px] text-emerald-300 font-bold block">مزایای رقابتی ملک:</span>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {(property as any).propertyAdvantages}
                </p>
              </div>
            )}

            {(property as any).legalNotes && (
              <div className="space-y-1">
                <span className="text-[11px] text-sky-300 font-bold block">ملاحظات ثبتی و حقوقی:</span>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {(property as any).legalNotes}
                </p>
              </div>
            )}

            {(property as any).description && (
              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 font-bold block">توضیحات تکمیلی پرونده:</span>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {(property as any).description}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. موقعیت مکانی، آدرس و یادداشت صوتی مشاور (§9 item 5) */}
      <div className="rounded-2xl glass-panel p-4 my-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">map</span>
            <h3 className="text-sm font-bold text-slate-100">موقعیت مکانی و مسیر دسترسی</h3>
          </div>
          <button
            type="button"
            onClick={handleCopyCoords}
            className="min-h-[36px] flex items-center gap-1 px-2.5 py-1 rounded-lg glass-panel-subtle text-xs font-mono text-[#f1cb83] hover:bg-[#f1cb83]/15 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">content_copy</span>
            <span>
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </span>
          </button>
        </div>

        {copiedCoordsToast && (
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs text-center font-bold">
            مختصات در کلیپ‌بورد کپی شد ✓
          </div>
        )}

        {/* Static Map visual preview with pin */}
        <div
          onClick={() =>
            openMapChooser(lat, lng, {
              title: property.title,
              onOpenInternalMap: () => onOpenMap({ lat, lng }),
            })
          }
          className="relative h-40 rounded-xl overflow-hidden border border-white/10 cursor-pointer shadow-inner group"
          style={{
            backgroundImage: `url('https://static-maps.yandex.ru/1.x/?lang=en-US&ll=${lng},${lat}&z=15&l=sat&size=450,220')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-[#070d1a]/20 group-hover:bg-transparent transition-colors" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-[#f1cb83] text-[#070d1a] flex items-center justify-center shadow-2xl animate-bounce">
              <span className="material-symbols-outlined text-[24px]">location_on</span>
            </div>
          </div>
          <div className="absolute bottom-2 inset-x-2 p-2 rounded-lg bg-[#070d1a]/85 backdrop-blur-md flex items-center justify-between text-xs gap-2">
            <span className="text-slate-200 truncate">
              {property.address || accessRouteDisplay || `${property.city}، ${property.district}`}
            </span>
            <span className="text-[#f1cb83] font-bold shrink-0">
              {hasCoords ? 'نمایش در مپ' : 'مختصات پیش‌فرض شهر'}
            </span>
          </div>
        </div>

        {(property.address || accessRouteDisplay) && (
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1 text-xs">
            {accessRouteDisplay && (
              <div className="text-slate-300">
                <span className="text-slate-400">مسیر دسترسی: </span>
                <strong className="text-slate-100">{accessRouteDisplay}</strong>
              </div>
            )}
            {property.address && (
              <div className="text-slate-300 leading-relaxed">
                <span className="text-slate-400">نشانی دقیق و کروکی متنی: </span>
                <span className="text-slate-100">{property.address}</span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            openMapChooser(lat, lng, {
              title: property.title,
              onOpenInternalMap: () => onOpenMap({ lat, lng }),
            })
          }
          className="w-full min-h-[44px] py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-[#f1cb83]/30 text-[#f1cb83] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">directions</span>
          <span>مسیریابی در گوگلمپ و برنامه‌های نقشه</span>
        </button>

        {/* Kelarabad Master Plan (طرح هادی کلارآباد) Status & Map Card */}
        <KelarabadTarhHadiCard
          mode="detail"
          coords={hasCoords && property.coordinates ? property.coordinates : null}
          savedCheck={property.tarhHadiCheck}
          propertyCode={property.code}
          propertyTitle={property.title}
          onAddSnapshotToGallery={
            onUpdateProperty
              ? (blobRef, caption) => {
                  const newMediaItem: PropertyMediaItem = {
                    id: `media_tarh_${Date.now()}`,
                    ref: blobRef,
                    url: blobRef,
                    caption,
                    type: 'drone',
                    isHelicopterShot: true,
                  };
                  const nextMedia = [...rawMedia, newMediaItem];
                  onUpdateProperty({
                    ...property,
                    media: nextMedia,
                    images: nextMedia,
                    updatedAt: new Date().toISOString(),
                  });
                }
              : undefined
          }
        />

        {/* Advisor Voice Note Player (§9 item 5) */}
        <div className="p-3 rounded-xl bg-[#091224]/80 border border-[#f1cb83]/20 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#f1cb83] text-[16px]">mic</span>
              توضیح صوتی مشاور درباره مسیر و مشخصات
            </span>
            <span className="font-mono text-[#f1cb83] text-[11px]">
              {resolvedVoiceUrl
                ? isVoicePlaying
                  ? `${formatDurationPersian(voiceCurrentTime)} / ${formatDurationPersian(
                      voiceTotalDuration
                    )}`
                  : formatDurationPersian(voiceTotalDuration)
                : 'بدون فایل صوتی'}
            </span>
          </div>

          {resolvedVoiceUrl && (
            <audio
              ref={audioRef}
              src={resolvedVoiceUrl}
              onLoadedMetadata={(e) => {
                const audio = e.currentTarget;
                if (audio.duration === Infinity) {
                  audio.currentTime = 1e101;
                  const fixDur = () => {
                    audio.removeEventListener('timeupdate', fixDur);
                    audio.currentTime = 0;
                    if (Number.isFinite(audio.duration) && audio.duration > 0) {
                      setVoiceTotalDuration(Math.round(audio.duration));
                    }
                  };
                  audio.addEventListener('timeupdate', fixDur);
                } else if (Number.isFinite(audio.duration) && audio.duration > 0) {
                  setVoiceTotalDuration(Math.round(audio.duration));
                }
              }}
              onTimeUpdate={(e) => {
                setVoiceCurrentTime(Math.floor(e.currentTarget.currentTime));
              }}
              onEnded={() => {
                setIsVoicePlaying(false);
                setVoiceCurrentTime(0);
              }}
              onPause={() => setIsVoicePlaying(false)}
              onPlay={() => setIsVoicePlaying(true)}
              className="hidden"
            />
          )}

          <div className="flex items-center gap-3">
            {resolvedVoiceUrl ? (
              <button
                type="button"
                onClick={handleToggleVoicePlay}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] flex items-center justify-center shadow-md active:scale-95 transition-all shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[22px]">
                  {isVoicePlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
            ) : (
              <div className="w-11 h-11 rounded-full bg-white/5 border border-white/10 text-slate-500 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">mic_off</span>
              </div>
            )}
            <div className="flex-1 space-y-1.5">
              {resolvedVoiceUrl && (
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[#f1cb83] rounded-full transition-all duration-200"
                    style={{
                      width: `${
                        voiceTotalDuration > 0
                          ? Math.min(100, Math.round((voiceCurrentTime / voiceTotalDuration) * 100))
                          : isVoicePlaying
                          ? 50
                          : 0
                      }%`,
                    }}
                  />
                </div>
              )}
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {voiceTranscript || 'توضیح صوتی برای این پرونده ثبت نشده است.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 7. اسناد، مدارک و فایل‌های پیوست */}
      {documentsList.length > 0 && (
        <div className="rounded-2xl glass-panel p-4 my-2 border border-white/10 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">folder_special</span>
              <h3 className="text-sm font-bold text-slate-100">اسناد، استعلامات و مدارک پیوست</h3>
            </div>
            <span className="text-xs font-bold text-[#f1cb83]">
              {toPersianDigits(documentsList.length)} مدرک
            </span>
          </div>

          <div className="space-y-2">
            {documentsList.map((doc) => {
              const docUrl = resolveBlobUrl(doc.ref || (doc as any).fileUrl || doc.url);
              return (
                <div
                  key={doc.id}
                  className="p-3 rounded-xl bg-[#091224]/80 border border-white/10 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="material-symbols-outlined text-[#f1cb83] text-[22px] shrink-0">
                      description
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-100 block truncate">
                        {doc.name || (doc as any).title}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {[doc.type, formatFileSize(doc.sizeBytes)].filter(Boolean).join(' • ')}
                      </span>
                    </div>
                  </div>
                  {docUrl && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDocPreview({
                            name: doc.name || (doc as any).title,
                            type: doc.type || '',
                            url: docUrl,
                          })
                        }
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#f1cb83]/15 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold cursor-pointer"
                      >
                        مشاهده
                      </button>
                      <a
                        href={docUrl}
                        download={doc.name || (doc as any).title}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 8. اطلاعات مالک و معرف (محرمانه • فقط مدیر) (§9 item 6) */}
      {isAdmin && (
        <div className="rounded-2xl glass-panel p-4 my-2 border-amber-500/40 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-[20px]">lock</span>
              <div>
                <h3 className="text-sm font-bold text-slate-100">اطلاعات محرمانه مالک و معرف</h3>
                <span className="text-[10px] text-slate-400">دسترسی انحصاری کارشناس ارشد و مدیر</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold border border-amber-400/30">
              محرمانه
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-[#091224]/80 gap-2">
            <div>
              <span className="text-[10px] text-slate-400 block">مالک مستقیم</span>
              <span className="text-xs font-bold text-slate-100 block">
                {property.ownerName || 'ثبت نشده'}
              </span>
              <span className="text-xs font-mono text-slate-400" dir="ltr">
                {property.ownerPhone || '—'}
              </span>
            </div>
            {property.ownerPhone && (
              <div className="flex items-center gap-2">
                <a
                  href={`sms:${property.ownerPhone}`}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center"
                >
                  پیامک
                </a>
                <a
                  href={`tel:${property.ownerPhone}`}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 shadow-md"
                >
                  <span className="material-symbols-outlined text-[16px]">call</span>
                  تماس مستقیم
                </a>
              </div>
            )}
          </div>

          {((property as any).collaboratorName || (property as any).collaboratorPhone) && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#091224]/60 border border-white/5 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 block">همکار / معرف پرونده</span>
                <span className="text-xs font-bold text-slate-200 block">
                  {(property as any).collaboratorName || '—'}
                </span>
                {(property as any).collaboratorPhone && (
                  <span className="text-xs font-mono text-slate-400" dir="ltr">
                    {(property as any).collaboratorPhone}
                  </span>
                )}
              </div>
              {(property as any).collaboratorPhone && (
                <a
                  href={`tel:${(property as any).collaboratorPhone}`}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#f1cb83]/15 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">call</span>
                  تماس با معرف
                </a>
              )}
            </div>
          )}

          {(property as any).confidentialNotes && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/20 text-xs text-amber-200 leading-relaxed whitespace-pre-wrap">
              <strong className="block text-[10px] text-amber-300 mb-0.5">یادداشت محرمانه مدیر:</strong>
              {(property as any).confidentialNotes}
            </div>
          )}
        </div>
      )}

      {/* 9. Matched Applicants List */}
      {matchedApplicants.length > 0 && (
        <div className="rounded-2xl glass-panel p-4 my-2 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">person_search</span>
              <h3 className="text-sm font-bold text-slate-100">متقاضیان منطبق با این ملک</h3>
            </div>
            <span className="text-xs font-bold text-[#f1cb83]">
              {toPersianDigits(matchedApplicants.length)} مشتری
            </span>
          </div>

          <div className="space-y-2">
            {matchedApplicants.map((m, idx) => (
              <div
                key={idx}
                onClick={() => onOpenApplicantDetail(m.applicant)}
                className="p-3 rounded-xl bg-[#091224]/80 border border-white/10 flex items-center justify-between cursor-pointer hover:border-[#f1cb83]/50 transition-all"
              >
                <div>
                  <span className="text-xs font-bold text-slate-100 block">
                    {m.applicant.fullName} ({m.applicant.code})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    سقف بودجه: {formatPriceShort(m.applicant.maxBudget)} تومان
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                  {toPersianDigits(m.percentage)}٪ تطبیق
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 10. Sticky Action Bottom Bar ABOVE BottomNavigationBar */}
      <aside
        className="fixed inset-x-0 z-30 bg-[#080d1a]/95 backdrop-blur-2xl border-t border-[#f1cb83]/35 px-3 py-2.5 shadow-[0_-10px_30px_rgba(0,0,0,0.85)]"
        style={{
          bottom: 'var(--nav-h, calc(5rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            onClick={() => onEdit(property)}
            className="gold-cta-sheen flex-1 h-12 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(241,203,131,0.4)] active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">edit</span>
            <span>ویرایش فایل</span>
          </button>
          {onDelete && (
            <button
              onClick={() => setShowDeleteConfirmModal(true)}
              className="h-12 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/45 font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>حذف ملک</span>
            </button>
          )}
          <button
            onClick={onBack}
            className="w-24 h-12 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs border border-white/10 cursor-pointer"
          >
            بستن
          </button>
        </div>
      </aside>

      {/* In-App Lightbox Modal for Photos & Helicopter Shots */}
      {activeLightboxIndex !== null && resolvedMedia[activeLightboxIndex] && (
        <div
          className="fixed inset-0 z-[90] bg-[#050b17]/95 backdrop-blur-2xl flex flex-col justify-between overflow-hidden"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            paddingBottom: 'calc(var(--nav-h, 80px) + env(safe-area-inset-bottom, 0px) + 12px)',
            paddingLeft: '16px',
            paddingRight: '16px',
          }}
          onClick={() => setActiveLightboxIndex(null)}
        >
          {/* Top Bar (safe-area aware, ≥44x44 close button with «بستن» label) */}
          <div
            className="relative z-20 flex items-center justify-between max-w-2xl w-full mx-auto px-3 py-2 rounded-2xl bg-[#091224]/90 backdrop-blur-md border border-[#f1cb83]/35 shadow-lg shrink-0 gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="px-3 py-1 rounded-full bg-[#f1cb83]/20 border border-[#f1cb83]/45 text-[#f1cb83] text-xs font-bold">
                تصویر {toPersianDigits(activeLightboxIndex + 1)} از {toPersianDigits(resolvedMedia.length)}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-[#f1cb83]">
                  {resolvedMedia[activeLightboxIndex].isDrone ? 'flight' : 'photo_camera'}
                </span>
                <span>
                  {resolvedMedia[activeLightboxIndex].isDrone ? 'هلی‌شات هوایی' : 'تصویر ملک'}
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveLightboxIndex(null)}
              aria-label="بستن نمایشگر تصویر"
              className="min-h-[44px] h-11 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-200 text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0 shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
              <span>بستن</span>
            </button>
          </div>

          {/* Center Media Area (fills remaining space between top and bottom bars, object-contain) */}
          <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center my-3 overflow-hidden">
            <img
              key={resolvedMedia[activeLightboxIndex].id || activeLightboxIndex}
              src={resolvedMedia[activeLightboxIndex].resolvedUrl}
              alt={resolvedMedia[activeLightboxIndex].caption || property.title}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full object-contain rounded-2xl border border-[#f1cb83]/25 shadow-[0_12px_40px_rgba(0,0,0,0.85)] transition-all duration-200"
            />
          </div>

          {/* Bottom Bar (sits above BottomNavigationBar with 12px gap, includes explicit «بستن» button) */}
          <div
            className="relative z-20 max-w-2xl w-full mx-auto p-3 rounded-2xl bg-[#091224]/90 backdrop-blur-md border border-[#f1cb83]/30 shadow-2xl space-y-2.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-xs sm:text-sm font-bold text-slate-100 truncate px-2">
              {resolvedMedia[activeLightboxIndex].caption || property.title}
            </p>

            <div className="flex items-center justify-center flex-wrap gap-2">
              {resolvedMedia.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveLightboxIndex(
                      (activeLightboxIndex - 1 + resolvedMedia.length) % resolvedMedia.length
                    )
                  }
                  className="min-h-[44px] h-11 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-100 text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  <span>قبلی</span>
                </button>
              )}

              <a
                href={resolvedMedia[activeLightboxIndex].resolvedUrl}
                download={
                  (resolvedMedia[activeLightboxIndex].caption || property.code || 'kelid-media') +
                  '.jpg'
                }
                className="min-h-[44px] h-11 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>دانلود</span>
              </a>

              {resolvedMedia.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveLightboxIndex((activeLightboxIndex + 1) % resolvedMedia.length)
                  }
                  className="min-h-[44px] h-11 px-3.5 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] text-xs font-extrabold flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <span>بعدی</span>
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveLightboxIndex(null)}
                className="min-h-[44px] h-11 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-200 text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
                <span>بستن</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Document Preview Modal */}
      {activeDocPreview && (
        <div
          className="fixed inset-0 z-[90] bg-[#050b17]/95 backdrop-blur-2xl flex flex-col justify-between overflow-hidden"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            paddingBottom: 'calc(var(--nav-h, 80px) + env(safe-area-inset-bottom, 0px) + 12px)',
            paddingLeft: '16px',
            paddingRight: '16px',
          }}
          onClick={() => setActiveDocPreview(null)}
        >
          {/* Top Bar */}
          <div
            className="relative z-20 flex items-center justify-between max-w-2xl w-full mx-auto px-3.5 py-2 rounded-2xl bg-[#091224]/85 backdrop-blur-md border border-[#f1cb83]/30 shadow-lg gap-3 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2.5 py-1 rounded-full bg-[#f1cb83]/20 border border-[#f1cb83]/40 text-[#f1cb83] text-[11px] font-bold shrink-0">
                مدرک پیوست
              </span>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                  {activeDocPreview.name}
                </h4>
                <span className="text-[10px] text-slate-400 block truncate">
                  {activeDocPreview.type}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveDocPreview(null)}
              aria-label="بستن پیش‌نمایش مدرک"
              className="min-h-[44px] h-11 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-200 text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
              <span>بستن</span>
            </button>
          </div>

          {/* Center Content Area */}
          <div
            className="relative z-10 flex-1 min-h-0 flex items-center justify-center my-3 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {activeDocPreview.url.startsWith('data:image/') ||
            /\.(png|jpe?g|webp|gif)$/i.test(activeDocPreview.name) ? (
              <img
                src={activeDocPreview.url}
                alt={activeDocPreview.name}
                className="max-h-full max-w-full object-contain rounded-2xl border border-[#f1cb83]/25 shadow-2xl"
              />
            ) : (
              <iframe
                src={activeDocPreview.url}
                title={activeDocPreview.name}
                className="w-full max-w-2xl h-full rounded-2xl bg-white border border-white/20 shadow-2xl"
              />
            )}
          </div>

          {/* Bottom Bar (strictly above BottomNavigationBar) */}
          <div
            className="relative z-20 max-w-2xl w-full mx-auto p-3 rounded-2xl bg-[#091224]/90 backdrop-blur-md border border-[#f1cb83]/30 shadow-2xl flex items-center justify-between gap-2.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs font-bold text-slate-200 truncate px-1">
              {activeDocPreview.name}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={activeDocPreview.url}
                download={activeDocPreview.name}
                className="min-h-[44px] h-11 px-4 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>دانلود فایل مدرک</span>
              </a>
              <button
                type="button"
                onClick={() => setActiveDocPreview(null)}
                className="min-h-[44px] h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 text-xs font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl glass-panel p-6 border border-rose-500/50 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">delete_forever</span>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-100">حذف پرونده ملک {property.code}</h3>
              <p className="text-xs text-rose-300 font-semibold leading-relaxed">
                آیا مطمئن هستید؟ این عمل قابل بازگشت نیست
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  onDelete?.(property.id);
                }}
                className="min-h-[44px] py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg cursor-pointer"
              >
                بله، حذف شود
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                className="min-h-[44px] py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Routing Chooser Modal */}
      <MapAppChooserModal
        isOpen={isRoutingModalOpen}
        onClose={() => setIsRoutingModalOpen(false)}
        lat={lat}
        lng={lng}
        title={property.title}
      />
    </div>
  );
};
