import React, { useState, useEffect, useRef } from 'react';
import { Property, TarhHadiCheckResult } from '../types';
import { getNextPropertyCode, saveBlob, resolveBlobUrl, preloadAllBlobs } from '../db';
import {
  INITIAL_CITIES,
  PROPERTY_TYPES,
  PROPERTY_STATUSES,
  DEED_TYPES,
  ZONING_STATUSES,
} from '../services/taxonomy';
import {
  getTodayJalali,
  formatPriceInWords,
  formatAreaInWords,
  formatWithCommas,
  parseTomanNumber,
  toPersianDigits,
  normalizeDigits,
  formatDurationPersian,
} from '../utils/jalali';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { ComboboxField } from '../components/ComboboxField';
import { openMapChooser } from '../components/MapAppChooserModal';
import { parseMapLocationSync, resolveAndParseMapInput } from '../utils/mapLinkParser';
import { MapView } from './MapView';
import { KelarabadTarhHadiCard } from '../components/KelarabadTarhHadiModal';

interface PropertyFormViewProps {
  initialProperty?: Property | null;
  onSave: (prop: Property) => void | Promise<void>;
  onDelete?: (propertyId: string) => void | Promise<void>;
  onCancel: () => void;
  onOpenMapPicker: (coords: { lat: number; lng: number }) => void;
  currentUserRole?: string;
}

const QUICK_DEED_CHIPS = ['ششدانگ', 'مشاعی', 'بنچاق', 'شورایی معتبر'] as const;

const DEED_COMBOBOX_OPTIONS = Array.from(
  new Set([
    ...QUICK_DEED_CHIPS,
    ...DEED_TYPES,
  ])
);

const LOT_SHAPE_OPTIONS = [
  'مستطیل منظم',
  'مربع',
  'ال‌شکل (پرچمی)',
  'ذوزنقه',
  'دارای قناسی',
];

const FRONTAGE_COUNT_OPTIONS = [
  '۱ بر (تک‌گذر)',
  '۲ بر (نبش معبر)',
  '۳ بر (سه‌طرف باز)',
  '۴ بر (میدانی / جزیره‌ای)',
];

const ORIENTATION_OPTIONS = [
  'شمالی - جنوبی',
  'شمالی (ورودی از حیاط)',
  'جنوبی (ورودی از ساختمان)',
  'شرقی - غربی',
  'دو نبش شمالی-شرقی',
  'دو نبش شمالی-غربی',
];

const LAND_USAGE_OPTIONS = [
  'مسکونی ویلایی',
  'باغ‌ویلا',
  'تجاری - مسکونی',
  'تجاری و خدماتی',
  'گردشگری و توریستی',
  'کشاورزی و باغی',
];

const STRUCTURE_STATUS_OPTIONS = [
  'زمین خام',
  'چهاردیواری محصور',
  'فونداسیون و اسکلت',
  'ویلا نوساز کلیدنخورده',
  'بنای قابل سکونت',
  'کلنگی قابل بازسازی',
];

const PERMIT_STAGE_OPTIONS = [
  'جواز ساخت رسمی فعال',
  'پروانه ساخت در دست اقدام',
  'دارای پایان کار شهرداری',
  'موافقت اصولی و استعلام کامل',
  'فاقد جواز ساخت',
];

const UTILITIES_LOCATION_OPTIONS = [
  'کنتور نصب داخل ملک',
  'سر ملک (پای زمین)',
  'فاصله کمتر از ۵۰ متر',
  'نیازمند انشعاب اختصاصی',
];

const PERMIT_STATUS_OPTIONS = [
  'پاک و بلامانع',
  'تایید شده توسط دهیاری / شهرداری',
  'در مرحله استعلام',
  'نیازمند تمدید اعتبار',
];

const PAYMENT_METHOD_OPTIONS = [
  'نقد',
  'نقد و اقساط',
  'قابل معاوضه (تهاتر)',
  'شرایطی توافقی',
];

const COMMISSION_RATE_OPTIONS = [
  'کمیسیون قانونی اتحادیه',
  '۱٪ از هر طرف',
  '۲٪ توافقی',
  'شیرینی ویژه توافقی',
  '۵۰/۵۰ با همکار',
];

export const PropertyFormView: React.FC<PropertyFormViewProps> = ({
  initialProperty,
  onSave,
  onDelete,
  onCancel,
  onOpenMapPicker,
  currentUserRole = 'مدیر',
}) => {
  const isEdit = !!initialProperty;
  const today = getTodayJalali();

  // Basic info states (empty on new property so placeholders are used, preserved on edit)
  const [code, setCode] = useState(initialProperty?.code || '');
  const [title, setTitle] = useState(initialProperty?.title || '');
  const [propertyType, setPropertyType] = useState<Property['propertyType']>(
    initialProperty?.propertyType || 'زمین'
  );
  const [status, setStatus] = useState<Property['status']>(
    initialProperty?.status || 'فعال'
  );
  const [registrationDate] = useState(initialProperty?.registrationDate || today.formatted);
  const [city, setCity] = useState(initialProperty?.city || 'کلارآباد');
  const [district, setDistrict] = useState(initialProperty?.district || '');
  const [deedType, setDeedType] = useState(initialProperty?.deedType || '');
  const [deedCustomText] = useState(initialProperty?.deedCustomText || '');
  const [zoningStatus, setZoningStatus] = useState(initialProperty?.zoningStatus || '');
  const [zoningCustomText] = useState(initialProperty?.zoningCustomText || '');

  // Pricing & Area states (0 when empty on new property so true placeholders show)
  const [area, setArea] = useState<number>(initialProperty?.area ?? 0);
  const [pricePerMeter, setPricePerMeter] = useState<number>(initialProperty?.pricePerMeter ?? 0);
  const [totalPrice, setTotalPrice] = useState<number>(initialProperty?.totalPrice ?? 0);
  const [isNegotiable, setIsNegotiable] = useState(initialProperty?.isNegotiable ?? true);
  const [lockedField, setLockedField] = useState<'ppm' | 'total'>('total');

  // Extended Details Collapsible (Section C)
  const [isExtendedOpen, setIsExtendedOpen] = useState(false);
  const [province, setProvince] = useState(initialProperty?.province || '');
  const [accessPath, setAccessPath] = useState(initialProperty?.accessPath || '');
  const [lotLabel, setLotLabel] = useState(initialProperty?.lotLabel || '');
  const [length, setLength] = useState<number>(initialProperty?.length ?? 0);
  const [width, setWidth] = useState<number>(initialProperty?.width ?? 0);
  const [lotShape, setLotShape] = useState(initialProperty?.lotShape || '');
  const [frontageCount, setFrontageCount] = useState(initialProperty?.frontageCount || '');
  const [passageWidth, setPassageWidth] = useState<number>(initialProperty?.passageWidth ?? 0);
  const [orientation, setOrientation] = useState(initialProperty?.orientation || '');
  const [landUsage, setLandUsage] = useState(initialProperty?.landUsage || '');
  const [structureStatus, setStructureStatus] = useState(initialProperty?.structureStatus || '');
  const [zoningAuthorities] = useState<string[]>(initialProperty?.zoningAuthorities || []);
  const [fencingNotes, setFencingNotes] = useState(initialProperty?.fencingNotes || '');
  const [densityPercent, setDensityPercent] = useState(initialProperty?.densityPercent || '');
  const [maxLotCoverage, setMaxLotCoverage] = useState(initialProperty?.maxLotCoverage || '');
  const [floorsCount, setFloorsCount] = useState(initialProperty?.floorsCount || '');
  const [permitStageType, setPermitStageType] = useState(initialProperty?.permitStageType || '');
  const [utilitiesLocation, setUtilitiesLocation] = useState(
    initialProperty?.utilitiesLocation || ''
  );
  const [utilities, setUtilities] = useState<{
    water: boolean;
    electricity?: boolean;
    power: boolean;
    gas: boolean;
    phone?: boolean;
    fiber: boolean;
  }>({
    water: initialProperty?.utilities?.water ?? false,
    electricity: initialProperty?.utilities?.electricity ?? initialProperty?.utilities?.power ?? false,
    power: initialProperty?.utilities?.power ?? initialProperty?.utilities?.electricity ?? false,
    gas: initialProperty?.utilities?.gas ?? false,
    phone: initialProperty?.utilities?.phone ?? false,
    fiber: initialProperty?.utilities?.fiber ?? false,
  });
  const [utilityNotes, setUtilityNotes] = useState(initialProperty?.utilityNotes || '');
  const [permitStatus, setPermitStatus] = useState(initialProperty?.permitStatus || '');
  const [permitNumber, setPermitNumber] = useState(initialProperty?.permitNumber || '');
  const [substructureArea, setSubstructureArea] = useState<number>(
    initialProperty?.substructureArea ?? 0
  );
  const [permitIssueDate, setPermitIssueDate] = useState(initialProperty?.permitIssueDate || '');
  const [permitExpiryDate, setPermitExpiryDate] = useState(
    initialProperty?.permitExpiryDate || ''
  );
  const [commissionRate, setCommissionRate] = useState(
    initialProperty?.commissionRate || initialProperty?.commissionText || ''
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialProperty?.paymentMethod || initialProperty?.settlementMethod || ''
  );
  const [paymentTerms, setPaymentTerms] = useState(initialProperty?.paymentTerms || '');
  const [contactPartner, setContactPartner] = useState(initialProperty?.contactPartner || '');
  const [contactSource, setContactSource] = useState(initialProperty?.contactSource || '');
  const [lastContactDate, setLastContactDate] = useState(initialProperty?.lastContactDate || '');
  const [nextFollowupDate, setNextFollowupDate] = useState(
    initialProperty?.nextFollowupDate || ''
  );
  const [internalNotes, setInternalNotes] = useState(initialProperty?.internalNotes || '');

  // GPS, Coordinates & Voice Note states (Section D)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialProperty?.coordinates || null
  );
  const [coordsInput, setCoordsInput] = useState<string>(
    initialProperty?.coordinates
      ? `${initialProperty.coordinates.lat.toFixed(6)} , ${initialProperty.coordinates.lng.toFixed(6)}`
      : ''
  );
  const [address, setAddress] = useState(
    initialProperty?.address ?? initialProperty?.voiceNote?.transcriptText ?? ''
  );
  const [voiceNote, setVoiceNote] = useState<Property['voiceNote']>(
    initialProperty?.voiceNote || undefined
  );
  const latestVoiceNoteRef = useRef<Property['voiceNote']>(
    initialProperty?.voiceNote || undefined
  );
  const [isPlayingFormVoice, setIsPlayingFormVoice] = useState(false);
  const [formVoiceCurrentTime, setFormVoiceCurrentTime] = useState(0);
  const [, setBlobTick] = useState(0);
  const formAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    preloadAllBlobs().then(() => setBlobTick((t) => t + 1));
  }, [initialProperty?.id]);
  const [isInternalMapPickerOpen, setIsInternalMapPickerOpen] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const coordsInputRef = useRef<HTMLInputElement | null>(null);
  const [tarhHadiCheck, setTarhHadiCheck] = useState<TarhHadiCheckResult | undefined>(
    initialProperty?.tarhHadiCheck
  );

  // Media & Gallery states (Section E)
  const [mediaList, setMediaList] = useState<Property['media']>(
    initialProperty?.media || initialProperty?.images || []
  );
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [isPhotoSourceSheetOpen, setIsPhotoSourceSheetOpen] = useState(false);
  const [uploadMediaCategory, setUploadMediaCategory] = useState<'photo' | 'drone'>('photo');
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Documents (Section F) - empty by default on new property, no hardcoded fake items
  const [documents, setDocuments] = useState<Property['documents']>(
    initialProperty?.documents || []
  );
  const [docError, setDocError] = useState<string | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);

  // Owner confidential info (Section G) - empty by default on new property
  const [ownerName, setOwnerName] = useState(initialProperty?.ownerName ?? '');
  const [ownerPhone, setOwnerPhone] = useState(initialProperty?.ownerPhone ?? '');

  // Dirty state tracking, Validation Errors, Delete & Cancel Modals
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showUnsavedExitModal, setShowUnsavedExitModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Field Refs for auto-scroll on validation failure
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  // Initialize auto F-code if creating new
  useEffect(() => {
    if (!isEdit && !code) {
      getNextPropertyCode().then((c) => setCode(c));
    }
  }, [isEdit, code]);

  // Warn before browser tab close if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const showGpsMessage = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setGpsNotice({ text, type });
    setTimeout(() => {
      setGpsNotice((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const clearFieldError = (fieldKey: string) => {
    if (errors[fieldKey]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
  };

  // Bidirectional calculations (run ONLY on real typed numbers > 0)
  const handleAreaChange = (rawStr: string) => {
    setIsDirty(true);
    clearFieldError('area');
    const clean = normalizeDigits(rawStr).replace(/[^0-9]/g, '');
    const val = parseInt(clean, 10) || 0;
    setArea(val);

    if (val > 0) {
      if (lockedField === 'ppm' && pricePerMeter > 0) {
        const nextTotal = val * pricePerMeter;
        setTotalPrice(nextTotal);
        if (nextTotal > 0) clearFieldError('totalPrice');
      } else if (lockedField === 'total' && totalPrice > 0) {
        const nextPpm = Math.round(totalPrice / val);
        setPricePerMeter(nextPpm);
        if (nextPpm > 0) clearFieldError('pricePerMeter');
      } else if (pricePerMeter > 0) {
        const nextTotal = val * pricePerMeter;
        setTotalPrice(nextTotal);
        if (nextTotal > 0) clearFieldError('totalPrice');
      } else if (totalPrice > 0) {
        const nextPpm = Math.round(totalPrice / val);
        setPricePerMeter(nextPpm);
        if (nextPpm > 0) clearFieldError('pricePerMeter');
      }
    }
  };

  const handlePricePerMeterChange = (val: number) => {
    setIsDirty(true);
    clearFieldError('pricePerMeter');
    setPricePerMeter(val);
    setLockedField('ppm');
    if (area > 0 && val > 0) {
      const nextTotal = area * val;
      setTotalPrice(nextTotal);
      if (nextTotal > 0) clearFieldError('totalPrice');
    } else if (val === 0) {
      setTotalPrice(0);
    }
  };

  const handleTotalPriceChange = (val: number) => {
    setIsDirty(true);
    clearFieldError('totalPrice');
    setTotalPrice(val);
    setLockedField('total');
    if (area > 0 && val > 0) {
      const nextPpm = Math.round(val / area);
      setPricePerMeter(nextPpm);
      if (nextPpm > 0) clearFieldError('pricePerMeter');
    } else if (val === 0) {
      setPricePerMeter(0);
    }
  };

  // Check if a deed quick-chip matches the current deedType field value
  const isDeedChipActive = (chip: string): boolean => {
    const cleanVal = deedType.trim();
    if (!cleanVal) return false;
    if (cleanVal === chip) return true;
    if (chip === 'ششدانگ' && cleanVal === 'تک‌برگ عرصه و اعیان (ششدانگ)') return true;
    if (chip === 'شورایی معتبر' && cleanVal === 'شورایی با اصالت معتبر') return true;
    return false;
  };

  // GPS Geolocation Handler
  const handleGetMyLocation = () => {
    setIsDirty(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
          };
          setCoords(next);
          setCoordsInput(`${next.lat.toFixed(6)} , ${next.lng.toFixed(6)}`);
          showGpsMessage('موقعیت GPS گوشی با موفقیت دریافت و ثبت شد ✓', 'success');
        },
        () => {
          const fallback = { lat: 36.654812, lng: 51.20874 };
          setCoords(fallback);
          setCoordsInput(`${fallback.lat.toFixed(6)} , ${fallback.lng.toFixed(6)}`);
          showGpsMessage('دسترسی GPS محدود بود؛ موقعیت پیش‌فرض منطقه ثبت شد.', 'info');
        }
      );
    } else {
      showGpsMessage('مرورگر شما از موقعیت‌یاب GPS پشتیبانی نمی‌کند.', 'error');
    }
  };

  // Parse typed or pasted map link / coordinates in the coordinates input box
  const handleCoordsTextChange = async (rawText: string) => {
    setIsDirty(true);
    setCoordsInput(rawText);

    if (!rawText.trim()) {
      setCoords(null);
      return;
    }

    // Try synchronous parse first
    const syncResult = parseMapLocationSync(rawText);
    if (syncResult.success && syncResult.coords) {
      setCoords(syncResult.coords);
      // Only auto-replace text if input looks like a URL (so we don't interrupt normal manual digit typing)
      if (/https?:\/\/|geo:|@/i.test(rawText)) {
        setCoordsInput(syncResult.formatted!);
        showGpsMessage('لینک نقشه به مختصات دقیق تبدیل شد ✓', 'success');
      }
      return;
    }

    // If it contains a shortened map link, resolve it via backend endpoint
    if (/https?:\/\//i.test(rawText)) {
      setIsResolvingLink(true);
      const resolved = await resolveAndParseMapInput(rawText);
      setIsResolvingLink(false);
      if (resolved.success && resolved.coords) {
        setCoords(resolved.coords);
        setCoordsInput(resolved.formatted!);
        showGpsMessage('لینک نقشه بازگشایی و مختصات ثبت شد ✓', 'success');
      } else {
        showGpsMessage(
          resolved.errorMessage ||
            'لینک کوتاه بازگشایی نشد؛ لطفاً لینک را باز کرده و مختصات یا آدرس کامل را بچسبانید.',
          'error'
        );
      }
    }
  };

  // "چسباندن" (Paste) button handler
  const handlePasteCoords = async () => {
    setIsDirty(true);
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      coordsInputRef.current?.focus();
      showGpsMessage(
        'مرورگر اجازه خواندن خودکار کلیپ‌بورد را نداد؛ لطفاً در کادر مختصات نگه دارید و Paste را بزنید.',
        'info'
      );
      return;
    }

    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        coordsInputRef.current?.focus();
        showGpsMessage('کلیپ‌بورد خالی است؛ لطفاً ابتدا مختصات یا لینک نقشه را کپی کنید.', 'info');
        return;
      }

      setIsResolvingLink(true);
      const result = await resolveAndParseMapInput(clipText);
      setIsResolvingLink(false);

      if (result.success && result.coords) {
        setCoords(result.coords);
        setCoordsInput(result.formatted!);
        showGpsMessage('مختصات از کلیپ‌بورد استخراج و ثبت شد ✓', 'success');
      } else {
        // Insert raw copied text into the field and show short Persian message so user can edit it
        setCoordsInput(clipText.trim());
        coordsInputRef.current?.focus();
        showGpsMessage(
          result.errorMessage ||
            'فرمت متن کپی‌شده به عنوان مختصات یا لینک نقشه شناسایی نشد؛ می‌توانید آن را در کادر زیر ویرایش کنید.',
          'error'
        );
      }
    } catch {
      // Clipboard permission denied
      coordsInputRef.current?.focus();
      showGpsMessage(
        'دسترسی به کلیپ‌بورد رد شد؛ لطفاً لینک یا مختصات را مستقیماً در کادر مختصات زیر بچسبانید.',
        'info'
      );
    }
  };

  // Handle "روی نقشه" / "نمایش در مپ" via shared MapAppChooserModal
  const handleOpenMapChooser = () => {
    openMapChooser(coords?.lat, coords?.lng, {
      title: title.trim() || `ملک ${code || 'کلید'}`,
      onOpenInternalMap: () => setIsInternalMapPickerOpen(true),
    });
  };

  // Section E: Handle Image / Heli-shot file selection (Camera or Gallery) -> Stored in IndexedDB blobs
  const handleImageFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
    category: 'photo' | 'drone'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsDirty(true);
    setIsPhotoSourceSheetOpen(false);

    const newMediaItems: Property['media'] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });

      if (dataUrl) {
        const blobRef = await saveBlob(dataUrl, file.type);
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        newMediaItems.push({
          id: `media_${Date.now()}_${i}`,
          ref: blobRef,
          url: blobRef,
          caption:
            category === 'drone'
              ? `هلی‌شات: ${cleanName || 'نمای هوایی ملک'}`
              : cleanName || 'تصویر ملک',
          type: category,
          isHelicopterShot: category === 'drone',
          isCover: mediaList.length === 0 && i === 0,
        });
      }
    }

    if (newMediaItems.length > 0) {
      setMediaList((prev) => {
        const updated = [...prev, ...newMediaItems];
        setActiveMediaIndex(updated.length - 1);
        return updated;
      });
    }

    e.target.value = '';
  };

  const handleRemoveMediaItem = (indexToRemove: number) => {
    setIsDirty(true);
    setMediaList((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      if (activeMediaIndex >= next.length) {
        setActiveMediaIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  // Section F: Handle Document Uploads (PDF, Images, Word; 10MB max per file) -> Stored in IndexedDB blobs
  const handleDocumentFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setDocError(null);
    const maxBytes = 10 * 1024 * 1024; // 10 MB
    const addedDocs: Property['documents'] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxBytes) {
        setDocError(
          `حجم فایل «${file.name}» (${(file.size / (1024 * 1024)).toFixed(1)} مگابایت) بیشتر از سقف مجاز ۱۰ مگابایت است.`
        );
        continue;
      }

      const sizeMb = Math.max(0.01, file.size / (1024 * 1024)).toFixed(2);
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });

      const blobRef = dataUrl ? await saveBlob(dataUrl, file.type) : undefined;

      addedDocs.push({
        id: `doc_${Date.now()}_${i}`,
        name: file.name,
        type: file.type || file.name.split('.').pop() || 'document',
        sizeBytes: file.size,
        ref: blobRef,
        size: `${sizeMb} MB`,
        status: 'تایید شده',
        url: blobRef,
        isConfidential: true,
      });
    }

    if (addedDocs.length > 0) {
      setIsDirty(true);
      setDocuments((prev) => [...prev, ...addedDocs]);
    }

    e.target.value = '';
  };

  const handleDeleteDocument = (docId: string) => {
    setIsDirty(true);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const getDocumentIcon = (fileName: string): string => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'picture_as_pdf';
    if (lower.endsWith('.doc') || lower.endsWith('.docx')) return 'description';
    if (/\.(jpg|jpeg|png|webp|heic|gif)$/i.test(lower)) return 'image';
    return 'insert_drive_file';
  };

  // Validate required fields and scroll to first invalid field
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'وارد کردن عنوان آگهی و فایل ملک الزامی است.';
    }
    if (!city.trim()) {
      newErrors.city = 'انتخاب شهر الزامی است.';
    }
    if (!district.trim()) {
      newErrors.district = 'وارد کردن نام محله یا منطقه الزامی است.';
    }
    if (!area || area <= 0) {
      newErrors.area = 'متراژ زمین باید عددی بزرگ‌تر از صفر باشد.';
    }
    if (!pricePerMeter || pricePerMeter <= 0) {
      newErrors.pricePerMeter = 'قیمت هر متر مربع را وارد کنید.';
    }
    if (!totalPrice || totalPrice <= 0) {
      newErrors.totalPrice = 'قیمت کل ملک را وارد کنید.';
    }
    if (!ownerName.trim()) {
      newErrors.ownerName = 'وارد کردن نام و نام خانوادگی مالک الزامی است.';
    }
    if (!ownerPhone.trim()) {
      newErrors.ownerPhone = 'وارد کردن شماره تماس مالک الزامی است.';
    }

    setErrors(newErrors);

    const errorKeys = Object.keys(newErrors);
    if (errorKeys.length > 0) {
      const firstKey = errorKeys[0];
      const targetEl = fieldRefs.current[firstKey];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inputEl = targetEl.querySelector('input, textarea, select') as HTMLElement | null;
        inputEl?.focus();
      }
      return false;
    }

    return true;
  };

  // Save handler
  const handleFormSubmit = async () => {
    if (isSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const syncedUtilities = {
        water: !!utilities.water,
        electricity: !!(utilities.power || utilities.electricity),
        power: !!(utilities.power || utilities.electricity),
        gas: !!utilities.gas,
        phone: !!utilities.phone,
        fiber: !!utilities.fiber,
      };

      const activeVoiceNote = latestVoiceNoteRef.current ?? voiceNote;
      const finalVoiceNote =
        activeVoiceNote?.audioRef || activeVoiceNote?.durationSeconds
          ? {
              audioRef: activeVoiceNote.audioRef,
              transcriptText: address.trim() || activeVoiceNote.transcriptText || '',
              durationSeconds: activeVoiceNote.durationSeconds || 0,
            }
          : undefined;

      const newProp: Property = {
        id: initialProperty?.id || `prop_${Date.now()}`,
        code: code || 'F-001',
        title: title.trim(),
        propertyType,
        status,
        registrationDate,
        registrationDateIso: initialProperty?.registrationDateIso || new Date().toISOString(),
        province: province.trim() || 'مازندران',
        city: city.trim(),
        district: district.trim(),
        accessPath: accessPath.trim(),
        accessRoute: accessPath.trim(),
        lotLabel: lotLabel.trim(),
        deedType: deedType.trim(),
        deedCustomText,
        zoningStatus: zoningStatus.trim(),
        zoningCustomText,
        area,
        pricePerMeter,
        totalPrice,
        isNegotiable,
        length: length || undefined,
        width: width || undefined,
        lotShape: lotShape.trim() || undefined,
        frontageCount: frontageCount.trim() || undefined,
        passageWidth: passageWidth || undefined,
        orientation: orientation.trim() || undefined,
        landUsage: landUsage.trim() || undefined,
        structureStatus: structureStatus.trim() || undefined,
        zoningAuthorities,
        fencingNotes: fencingNotes.trim() || undefined,
        densityPercent: densityPercent.trim() || undefined,
        maxLotCoverage: maxLotCoverage.trim() || undefined,
        floorsCount: floorsCount.trim() || undefined,
        permitStageType: permitStageType.trim() || undefined,
        utilitiesLocation: utilitiesLocation.trim() || undefined,
        utilities: syncedUtilities,
        utilityNotes: utilityNotes.trim() || undefined,
        permitStatus: permitStatus.trim() || permitStageType.trim() || undefined,
        permitNumber: permitNumber.trim() || undefined,
        substructureArea: substructureArea || undefined,
        permitIssueDate: permitIssueDate.trim() || undefined,
        permitExpiryDate: permitExpiryDate.trim() || undefined,
        commissionRate: commissionRate.trim() || undefined,
        commissionText: commissionRate.trim() || undefined,
        paymentMethod: paymentMethod.trim() || undefined,
        settlementMethod: paymentMethod.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        contactPartner: contactPartner.trim() || undefined,
        contactSource: contactSource.trim() || undefined,
        lastContactDate: lastContactDate.trim() || undefined,
        nextFollowupDate: nextFollowupDate.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
        coordinates: coords || undefined,
        tarhHadiCheck: coords ? tarhHadiCheck : undefined,
        address: address.trim(),
        advisorVoiceTranscript: finalVoiceNote?.transcriptText || initialProperty?.advisorVoiceTranscript,
        voiceNote: finalVoiceNote,
        media: mediaList,
        images: mediaList,
        documents,
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        createdAt: initialProperty?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: (initialProperty?.version || 0) + 1,
      };

      setIsDirty(false);
      await onSave(newProp);
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel / Back handler with unsaved changes check
  const handleRequestCancel = () => {
    if (isDirty) {
      setShowUnsavedExitModal(true);
    } else {
      onCancel();
    }
  };

  // Delete confirmed handler
  const handleConfirmDelete = async () => {
    if (!initialProperty || !onDelete) return;
    setShowDeleteConfirmModal(false);
    setIsDirty(false);
    await onDelete(initialProperty.id);
  };

  return (
    <div className="flex flex-col w-full pb-44 text-right">
      {/* 1. Header & Title Banner */}
      <section className="glass-panel p-4 mb-4 relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRequestCancel}
              aria-label="انصراف و بازگشت"
              className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <div>
              <h1 className="text-base font-extrabold text-slate-100">
                {isEdit ? 'ویرایش پرونده ملک' : 'ثبت ملک جدید'}
              </h1>
              <p className="text-[11px] text-slate-400 font-normal">
                محاسبات هوشمند مالی و متراژ دقیق
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-emerald-950/80 border border-amber-400/35 text-emerald-300 font-mono text-xs font-bold shadow-sm">
              {code || 'F-...'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f1cb83]/15 text-[#f1cb83] font-bold border border-[#f1cb83]/30">
              {currentUserRole}
            </span>
          </div>
        </div>
      </section>

      {/* 2. SECTION A: مشخصات پایه ملک */}
      <section className="glass-panel p-4 space-y-4 mb-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#f1cb83]/20">
          <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">apartment</span>
          <h2 className="text-xs font-bold text-slate-300">A. مشخصات پایه ملک</h2>
        </div>

        {/* Title */}
        <div
          ref={(el) => {
            fieldRefs.current.title = el;
          }}
          className="space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-200">
              عنوان آگهی و فایل ملک <span className="text-rose-400">*</span>
            </label>
            <VoiceInputButton
              value={title}
              onChange={(val) => {
                setIsDirty(true);
                setTitle(val);
                if (val.trim()) clearFieldError('title');
              }}
              label="تایپ صوتی عنوان"
              variant="pill"
            />
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setIsDirty(true);
              setTitle(e.target.value);
              if (e.target.value.trim()) clearFieldError('title');
            }}
            placeholder="مثال: زمین مسکونی ۳۰۰ متری دو بر در خوشامیان"
            className={`glass-field w-full h-12 px-3 rounded-xl text-xs font-bold text-slate-100 ${
              errors.title ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
            }`}
          />
          {errors.title && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-0.5">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.title}</span>
            </p>
          )}
        </div>

        {/* Property Type & Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">نوع ملک</label>
            <select
              value={propertyType}
              onChange={(e) => {
                setIsDirty(true);
                setPropertyType(e.target.value as any);
              }}
              className="glass-field w-full h-12 px-3 rounded-xl text-xs font-bold text-slate-100 appearance-none cursor-pointer"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t.key} value={t.short} className="bg-[#0a1328]">
                  {t.short}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">وضعیت فایل</label>
            <select
              value={status}
              onChange={(e) => {
                setIsDirty(true);
                setStatus(e.target.value as any);
              }}
              className="glass-field w-full h-12 px-3 rounded-xl text-xs font-bold text-slate-100 appearance-none cursor-pointer"
            >
              {PROPERTY_STATUSES.map((s) => (
                <option key={s.key} value={s.value} className="bg-[#0a1328]">
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* City & District */}
        <div className="grid grid-cols-2 gap-3">
          <div
            ref={(el) => {
              fieldRefs.current.city = el;
            }}
          >
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              شهر <span className="text-rose-400">*</span>
            </label>
            <select
              value={city}
              onChange={(e) => {
                setIsDirty(true);
                setCity(e.target.value);
                clearFieldError('city');
              }}
              className="glass-field w-full h-12 px-3 rounded-xl text-xs font-bold text-slate-100 appearance-none cursor-pointer"
            >
              {INITIAL_CITIES.map((c) => (
                <option key={c.id} value={c.name} className="bg-[#0a1328]">
                  {c.name}
                </option>
              ))}
            </select>
            {errors.city && (
              <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{errors.city}</span>
              </p>
            )}
          </div>
          <div
            ref={(el) => {
              fieldRefs.current.district = el;
            }}
          >
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              محله / منطقه <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={district}
              onChange={(e) => {
                setIsDirty(true);
                setDistrict(e.target.value);
                if (e.target.value.trim()) clearFieldError('district');
              }}
              placeholder="مثال: خوشامیان"
              className={`glass-field w-full h-12 px-3 rounded-xl text-xs font-bold text-slate-100 ${
                errors.district ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
              }`}
            />
            {errors.district && (
              <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{errors.district}</span>
              </p>
            )}
          </div>
        </div>

        {/* 1) نوع سند مالکیت (Combobox + synced quick-select chips) */}
        <div className="space-y-2.5 pt-2 border-t border-white/5">
          <label className="block text-xs font-bold text-slate-300">نوع سند مالکیت</label>
          <ComboboxField
            value={deedType}
            onChange={(val) => {
              setIsDirty(true);
              setDeedType(val);
            }}
            options={DEED_COMBOBOX_OPTIONS}
            placeholder="انتخاب از لیست یا تایپ دستی (مثال: تک‌برگ عرصه و اعیان)"
            ariaLabel="نوع سند مالکیت"
          />
          <div className="grid grid-cols-4 gap-1.5 pt-0.5">
            {QUICK_DEED_CHIPS.map((chip) => {
              const active = isDeedChipActive(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setDeedType(chip);
                  }}
                  className={`min-h-[44px] px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center text-center cursor-pointer active:scale-95 border ${
                    active
                      ? 'bg-[#f1cb83]/25 border-[#f1cb83] text-[#f1cb83] shadow-[0_0_14px_rgba(241,203,131,0.35)]'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2) وضعیت بافت شهرداری و دهیاری (Combobox) */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <label className="block text-xs font-bold text-slate-300">
            وضعیت بافت شهرداری و دهیاری <span className="text-amber-400">*</span>
          </label>
          <ComboboxField
            value={zoningStatus}
            onChange={(val) => {
              setIsDirty(true);
              setZoningStatus(val);
            }}
            options={ZONING_STATUSES}
            placeholder="انتخاب از لیست یا تایپ دستی (مثال: داخل بافت مسکونی ۱۰۰٪)"
            ariaLabel="وضعیت بافت شهرداری و دهیاری"
          />
        </div>
      </section>

      {/* 3. SECTION B: متراژ و قیمت دوطرفه */}
      <section className="glass-panel p-4 space-y-4 mb-4 border-[#f1cb83]/30 shadow-lg">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">calculate</span>
            <h2 className="text-xs font-bold text-slate-200">B. متراژ و محاسبات مالی دوطرفه</h2>
          </div>
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-[#f1cb83]">lock</span>
            قفل محاسباتی فعال
          </span>
        </div>

        {/* Area */}
        <div
          ref={(el) => {
            fieldRefs.current.area = el;
          }}
        >
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-bold text-slate-300">
              متراژ زمین (مترمربع) <span className="text-rose-400">*</span>
            </label>
            <span className="text-[10px] text-[#f1cb83] font-bold">
              {area > 0 ? formatAreaInWords(area) : ''}
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={area > 0 ? toPersianDigits(area) : ''}
              onChange={(e) => handleAreaChange(e.target.value)}
              placeholder="۳۰۰"
              className={`glass-field w-full h-12 pr-4 pl-12 rounded-xl text-base font-extrabold text-slate-100 ${
                errors.area ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
              }`}
            />
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-slate-400 pointer-events-none">
              متر²
            </span>
          </div>
          {errors.area && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.area}</span>
            </p>
          )}
        </div>

        {/* Price Per Meter */}
        <div
          ref={(el) => {
            fieldRefs.current.pricePerMeter = el;
          }}
        >
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-bold text-slate-300">
              قیمت هر متر (تومان) <span className="text-rose-400">*</span>
            </label>
            <span className="text-[10px] text-emerald-400 font-bold">
              {pricePerMeter > 0 ? formatPriceInWords(pricePerMeter) : ''}
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={pricePerMeter > 0 ? formatWithCommas(pricePerMeter) : ''}
              onChange={(e) => handlePricePerMeterChange(parseTomanNumber(e.target.value))}
              placeholder="۴۰,۰۰۰,۰۰۰"
              className={`glass-field w-full h-12 pr-4 pl-16 rounded-xl text-base font-bold text-emerald-400 ${
                errors.pricePerMeter ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
              }`}
            />
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-slate-400 pointer-events-none">
              تومان
            </span>
          </div>
          {errors.pricePerMeter && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.pricePerMeter}</span>
            </p>
          )}
        </div>

        {/* Total Price */}
        <div
          ref={(el) => {
            fieldRefs.current.totalPrice = el;
          }}
        >
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-bold text-slate-300">
              قیمت کل (تومان) <span className="text-rose-400">*</span>
            </label>
            <span className="text-[10px] text-[#f1cb83] font-bold">
              {totalPrice > 0 ? formatPriceInWords(totalPrice) : ''}
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={totalPrice > 0 ? formatWithCommas(totalPrice) : ''}
              onChange={(e) => handleTotalPriceChange(parseTomanNumber(e.target.value))}
              placeholder="۱۲,۰۰۰,۰۰۰,۰۰۰"
              className={`glass-field w-full h-12 pr-4 pl-16 rounded-xl text-base font-black text-[#f1cb83] ${
                errors.totalPrice ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
              }`}
            />
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-slate-400 pointer-events-none">
              تومان
            </span>
          </div>
          {errors.totalPrice && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.totalPrice}</span>
            </p>
          )}
        </div>

        {/* Negotiable Toggle */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-bold text-slate-300">قیمت قابل مذاکره و تخفیف؟</span>
          <input
            type="checkbox"
            checked={isNegotiable}
            onChange={(e) => {
              setIsDirty(true);
              setIsNegotiable(e.target.checked);
            }}
            className="w-5 h-5 rounded accent-[#f1cb83] cursor-pointer"
          />
        </div>
      </section>

      {/* 4. SECTION C: جزئیات بیشتر ملک و مشخصات تکمیلی */}
      <section className="glass-panel p-4 mb-4">
        <button
          type="button"
          onClick={() => setIsExtendedOpen(!isExtendedOpen)}
          className="w-full min-h-[44px] flex items-center justify-between text-right cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">tune</span>
            <div>
              <h2 className="text-xs font-bold text-slate-100">
                C. جزئیات بیشتر ملک و مشخصات تکمیلی
              </h2>
              <p className="text-[10px] text-slate-400">
                ابعاد، برها، انشعابات، مجوزها و توضیحات تکمیلی
              </p>
            </div>
          </div>
          <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">
            {isExtendedOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {isExtendedOpen && (
          <div className="space-y-4 pt-4 mt-3 border-t border-white/10">
            {/* Dimensions (Free-text / numeric inputs with faint placeholders) */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">طول (متر)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={length > 0 ? toPersianDigits(length) : ''}
                  onChange={(e) => {
                    setIsDirty(true);
                    const clean = normalizeDigits(e.target.value).replace(/[^0-9]/g, '');
                    setLength(parseInt(clean, 10) || 0);
                  }}
                  placeholder="۲۵"
                  className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">عرض / بر (متر)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={width > 0 ? toPersianDigits(width) : ''}
                  onChange={(e) => {
                    setIsDirty(true);
                    const clean = normalizeDigits(e.target.value).replace(/[^0-9]/g, '');
                    setWidth(parseInt(clean, 10) || 0);
                  }}
                  placeholder="۱۲"
                  className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">عرض معبر (متر)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={passageWidth > 0 ? toPersianDigits(passageWidth) : ''}
                  onChange={(e) => {
                    setIsDirty(true);
                    const clean = normalizeDigits(e.target.value).replace(/[^0-9]/g, '');
                    setPassageWidth(parseInt(clean, 10) || 0);
                  }}
                  placeholder="۱۰"
                  className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-slate-100"
                />
              </div>
            </div>

            {/* Shape & Frontage (Comboboxes: suggestions + custom manual typing) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">شکل هندسی</label>
                <ComboboxField
                  value={lotShape}
                  onChange={(val) => {
                    setIsDirty(true);
                    setLotShape(val);
                  }}
                  options={LOT_SHAPE_OPTIONS}
                  placeholder="مثال: مستطیل منظم"
                  inputClassName="!h-11"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">تعداد بر و جبهه</label>
                <ComboboxField
                  value={frontageCount}
                  onChange={(val) => {
                    setIsDirty(true);
                    setFrontageCount(val);
                  }}
                  options={FRONTAGE_COUNT_OPTIONS}
                  placeholder="مثال: ۲ بر (نبش معبر)"
                  inputClassName="!h-11"
                />
              </div>
            </div>

            {/* Orientation & Land Usage (Comboboxes) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">جهت ملک و نورگیری</label>
                <ComboboxField
                  value={orientation}
                  onChange={(val) => {
                    setIsDirty(true);
                    setOrientation(val);
                  }}
                  options={ORIENTATION_OPTIONS}
                  placeholder="مثال: شمالی - جنوبی"
                  inputClassName="!h-11"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">نوع کاربری زمین / ملک</label>
                <ComboboxField
                  value={landUsage}
                  onChange={(val) => {
                    setIsDirty(true);
                    setLandUsage(val);
                  }}
                  options={LAND_USAGE_OPTIONS}
                  placeholder="مثال: مسکونی ویلایی"
                  inputClassName="!h-11"
                />
              </div>
            </div>

            {/* Structure Status & Permit Stage (Comboboxes) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">وضعیت فعلی سازه و حصار</label>
                <ComboboxField
                  value={structureStatus}
                  onChange={(val) => {
                    setIsDirty(true);
                    setStructureStatus(val);
                  }}
                  options={STRUCTURE_STATUS_OPTIONS}
                  placeholder="مثال: زمین خام"
                  inputClassName="!h-11"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">وضعیت جواز و پروانه ساخت</label>
                <ComboboxField
                  value={permitStageType}
                  onChange={(val) => {
                    setIsDirty(true);
                    setPermitStageType(val);
                  }}
                  options={PERMIT_STAGE_OPTIONS}
                  placeholder="مثال: جواز ساخت رسمی فعال"
                  inputClassName="!h-11"
                />
              </div>
            </div>

            {/* Utilities Location, Payment Method & Commission Rate (Comboboxes) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">موقعیت انشعابات</label>
                <ComboboxField
                  value={utilitiesLocation}
                  onChange={(val) => {
                    setIsDirty(true);
                    setUtilitiesLocation(val);
                  }}
                  options={UTILITIES_LOCATION_OPTIONS}
                  placeholder="مثال: سر ملک"
                  inputClassName="!h-11"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">نحوه و شرایط پرداخت</label>
                <ComboboxField
                  value={paymentMethod}
                  onChange={(val) => {
                    setIsDirty(true);
                    setPaymentMethod(val);
                  }}
                  options={PAYMENT_METHOD_OPTIONS}
                  placeholder="مثال: نقد و اقساط"
                  inputClassName="!h-11"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">حق کمیسیون / شیرینی</label>
                <ComboboxField
                  value={commissionRate}
                  onChange={(val) => {
                    setIsDirty(true);
                    setCommissionRate(val);
                  }}
                  options={COMMISSION_RATE_OPTIONS}
                  placeholder="مثال: کمیسیون قانونی اتحادیه"
                  inputClassName="!h-11"
                />
              </div>
            </div>

            {/* 3) Utilities / انشعابات و زیرساخت‌ها: 4 toggle tiles in ONE single row */}
            <div className="p-3 rounded-xl bg-[#091224]/80 space-y-2.5 border border-white/5">
              <span className="text-xs font-bold text-slate-300 block">
                انشعابات و زیرساخت‌ها:
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: 'water' as const, label: 'آب', icon: 'water_drop' },
                  { key: 'power' as const, label: 'برق', icon: 'bolt' },
                  { key: 'gas' as const, label: 'گاز', icon: 'local_fire_department' },
                  { key: 'fiber' as const, label: 'فیبر نوری', icon: 'cable' },
                ].map((item) => {
                  const isActive = !!utilities[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setIsDirty(true);
                        setUtilities((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        }));
                      }}
                      className={`h-[70px] min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-1.5 px-1 transition-all duration-200 cursor-pointer select-none border active:scale-95 ${
                        isActive
                          ? 'bg-[#f1cb83]/18 border-[#f1cb83] text-[#f1cb83] shadow-[0_0_16px_rgba(241,203,131,0.28),inset_0_0_10px_rgba(241,203,131,0.12)]'
                          : 'bg-[#070d1a]/80 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[22px] transition-transform duration-200 ${
                          isActive ? 'text-[#f1cb83] scale-110' : 'text-slate-500'
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span
                        className={`text-[11px] leading-tight whitespace-nowrap ${
                          isActive ? 'font-extrabold text-[#f1cb83]' : 'font-semibold text-slate-400'
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Permit details (Free-text inputs with faint placeholders) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">شماره پروانه ساخت</label>
                <input
                  type="text"
                  value={permitNumber}
                  onChange={(e) => {
                    setIsDirty(true);
                    setPermitNumber(e.target.value);
                  }}
                  placeholder="مثال: ۱۴۰۲/۳۸۹"
                  className="glass-field w-full h-11 px-3 rounded-xl text-xs text-center text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">پایان اعتبار پروانه</label>
                <input
                  type="text"
                  value={permitExpiryDate}
                  onChange={(e) => {
                    setIsDirty(true);
                    setPermitExpiryDate(e.target.value);
                  }}
                  placeholder="مثال: ۱۴۰۵/۰۹/۲۰"
                  className="glass-field w-full h-11 px-3 rounded-xl text-xs text-center font-mono text-slate-100"
                />
              </div>
            </div>

            {/* Confidential Internal Notes with Voice Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-[#f1cb83] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">lock</span>
                  توضیحات ملک و یادداشت داخلی مشاور
                </label>
                <VoiceInputButton
                  value={internalNotes}
                  onChange={(val) => {
                    setIsDirty(true);
                    setInternalNotes(val);
                  }}
                  label="ضبط توضیحات"
                  variant="pill"
                />
              </div>
              <textarea
                value={internalNotes}
                onChange={(e) => {
                  setIsDirty(true);
                  setInternalNotes(e.target.value);
                }}
                placeholder="یادداشت‌های اختصاصی، توضیحات ملک، محدودیت‌های مالک، توافقات شفاهی..."
                rows={3}
                className="glass-field w-full p-2.5 rounded-xl text-xs text-slate-100 leading-relaxed"
              />
            </div>
          </div>
        )}
      </section>

      {/* 5. SECTION D: موقعیت، لوکیشن نقشه و آدرس صوتی */}
      <section className="glass-panel p-4 space-y-3 mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">location_on</span>
            <h2 className="text-xs font-bold text-slate-300">
              D. موقعیت، لوکیشن نقشه و آدرس صوتی
            </h2>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f1cb83]/15 text-[#f1cb83] font-bold">
            سیستم هوشمند GPS + وایس
          </span>
        </div>

        {/* 3 GPS Buttons (min-h-[44px] touch targets) */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleOpenMapChooser}
            className="min-h-[46px] px-2 rounded-xl bg-white/5 hover:bg-[#f1cb83]/20 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">map</span>
            <span>روی نقشه</span>
          </button>
          <button
            type="button"
            onClick={handleGetMyLocation}
            className="min-h-[46px] px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">my_location</span>
            <span>موقعیت من</span>
          </button>
          <button
            type="button"
            onClick={handlePasteCoords}
            disabled={isResolvingLink}
            className="min-h-[46px] px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isResolvingLink ? 'progress_activity' : 'content_paste'}
            </span>
            <span>{isResolvingLink ? 'در حال بررسی...' : 'چسباندن'}</span>
          </button>
        </div>

        {gpsNotice && (
          <div
            className={`p-2.5 rounded-xl text-xs font-bold text-center leading-relaxed border ${
              gpsNotice.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                : gpsNotice.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                : 'bg-amber-500/15 border-amber-400/35 text-[#f1cb83]'
            }`}
          >
            {gpsNotice.text}
          </div>
        )}

        {/* Coordinates & Map Link Input Box ("lat , lng" box) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>مختصات جغرافیایی یا لینک نقشه (گوگل‌مپ، نشان، بلد، ویز):</span>
            <button
              type="button"
              onClick={handleOpenMapChooser}
              className="text-[11px] text-[#f1cb83] font-bold hover:underline cursor-pointer"
            >
              نمایش در مپ
            </button>
          </div>
          <div className="relative flex items-center">
            <span
              className={`w-2.5 h-2.5 rounded-full absolute right-3.5 pointer-events-none ${
                coords ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-500/60'
              }`}
            />
            <input
              ref={coordsInputRef}
              type="text"
              dir="ltr"
              value={coordsInput}
              onChange={(e) => handleCoordsTextChange(e.target.value)}
              placeholder="36.651042 , 51.201089"
              className="glass-field w-full min-h-[46px] h-12 pr-9 pl-3 rounded-xl text-xs font-mono font-bold text-slate-100 text-left"
            />
          </div>
        </div>

        {/* Kelarabad Master Plan (طرح هادی کلارآباد) Checker Block */}
        <KelarabadTarhHadiCard
          mode="form"
          coords={coords}
          savedCheck={tarhHadiCheck}
          propertyCode={code || 'جدید'}
          propertyTitle={title}
          onChangeCheck={(result) => {
            setIsDirty(true);
            setTarhHadiCheck(result);
          }}
          onUpdateCoordsFromPlan={(pickedCoords) => {
            setIsDirty(true);
            setCoords(pickedCoords);
            setCoordsInput(`${pickedCoords.lat.toFixed(6)} , ${pickedCoords.lng.toFixed(6)}`);
          }}
          onApplyToFormFields={(suggestedZoning, suggestedUsage) => {
            setIsDirty(true);
            setZoningStatus(suggestedZoning);
            setLandUsage(suggestedUsage);
          }}
          onAddSnapshotToGallery={async (dataUrl, caption) => {
            setIsDirty(true);
            const blobRef = await saveBlob(dataUrl, 'image/jpeg');
            setMediaList((prev) => [
              ...prev,
              {
                id: `media_tarh_${Date.now()}`,
                ref: blobRef,
                url: blobRef,
                caption,
                type: 'photo',
                isHelicopterShot: false,
              },
            ]);
          }}
        />

        {/* Access Path */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">مسیر و معبر دسترسی</label>
          <input
            type="text"
            value={accessPath}
            onChange={(e) => {
              setIsDirty(true);
              setAccessPath(e.target.value);
            }}
            placeholder="مثال: کوچه ۱۰ متری بن‌بست"
            className="glass-field w-full h-12 px-3 rounded-xl text-xs text-slate-100"
          />
        </div>

        {/* Address with Real-Time Voice-to-Text & Audio Recording */}
        <div
          ref={(el) => {
            fieldRefs.current.address = el;
          }}
          className="space-y-2 pt-1"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="block text-xs font-bold text-slate-200">
              آدرس دقیق و توضیحات دسترسی ملک
            </label>
            <VoiceInputButton
              value={address}
              onChange={(newAddress) => {
                setIsDirty(true);
                setAddress(newAddress);
                if (newAddress.trim()) clearFieldError('address');
              }}
              onAudioRecorded={async (payload) => {
                setIsDirty(true);
                let audioRef = latestVoiceNoteRef.current?.audioRef || voiceNote?.audioRef;
                if (payload.dataUrl) {
                  audioRef = await saveBlob(payload.dataUrl, payload.mimeType);
                }
                const nextVoiceNote: Property['voiceNote'] = {
                  audioRef,
                  transcriptText: payload.transcriptText || address,
                  durationSeconds: payload.durationSeconds,
                };
                latestVoiceNoteRef.current = nextVoiceNote;
                setVoiceNote(nextVoiceNote);
                setFormVoiceCurrentTime(0);
              }}
              label="ثبت صوتی آدرس (وایس)"
              variant="pill"
            />
          </div>
          <textarea
            value={address}
            onChange={(e) => {
              setIsDirty(true);
              setAddress(e.target.value);
              if (e.target.value.trim()) clearFieldError('address');
            }}
            placeholder="آدرس را تایپ کنید یا روی دکمه «ثبت صوتی آدرس» بزنید و صحبت کنید (مثلاً: کلارآباد، خیابان دریا، کوچه گلها، قطعه شمالی)..."
            rows={3}
            className={`glass-field w-full p-3 rounded-xl text-xs text-slate-100 leading-relaxed ${
              errors.address ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
            }`}
          />
          {errors.address && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.address}</span>
            </p>
          )}

          {/* Recorded Voice Note Preview Bar */}
          {voiceNote?.audioRef && resolveBlobUrl(voiceNote.audioRef) && (
            <div className="p-3 rounded-xl bg-[#091224]/90 border border-[#f1cb83]/30 flex items-center justify-between gap-2.5">
              <audio
                ref={formAudioRef}
                src={resolveBlobUrl(voiceNote.audioRef)}
                preload="metadata"
                onTimeUpdate={(e) => {
                  setFormVoiceCurrentTime(Math.floor(e.currentTarget.currentTime || 0));
                }}
                onEnded={() => {
                  setIsPlayingFormVoice(false);
                  setFormVoiceCurrentTime(0);
                }}
                onPause={() => setIsPlayingFormVoice(false)}
                onPlay={() => setIsPlayingFormVoice(true)}
                className="hidden"
              />
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    const el = formAudioRef.current;
                    if (!el) return;
                    if (isPlayingFormVoice) {
                      el.pause();
                    } else {
                      el.play().catch(() => {});
                    }
                  }}
                  aria-label={isPlayingFormVoice ? 'توقف پخش صدای آدرس' : 'پخش صدای آدرس'}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 shadow-md"
                >
                  <span className="material-symbols-outlined text-[22px]">
                    {isPlayingFormVoice ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#f1cb83] truncate">
                      فایل صوتی مشاور ضبط و پیوست شد ✓
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                      {isPlayingFormVoice
                        ? `${formatDurationPersian(formVoiceCurrentTime)} / ${formatDurationPersian(
                            voiceNote.durationSeconds
                          )}`
                        : formatDurationPersian(voiceNote.durationSeconds)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-l from-[#f1cb83] to-[#d4b06a] rounded-full transition-all duration-150"
                      style={{
                        width: `${
                          voiceNote.durationSeconds && voiceNote.durationSeconds > 0
                            ? Math.min(
                                100,
                                Math.round(
                                  (formVoiceCurrentTime / voiceNote.durationSeconds) * 100
                                )
                              )
                            : isPlayingFormVoice
                            ? 50
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDirty(true);
                  formAudioRef.current?.pause();
                  setIsPlayingFormVoice(false);
                  setFormVoiceCurrentTime(0);
                  latestVoiceNoteRef.current = undefined;
                  setVoiceNote(undefined);
                }}
                aria-label="حذف فایل صوتی آدرس"
                className="min-h-[44px] h-11 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 active:scale-95"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
                <span>حذف صوت</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 6. SECTION E: گالری تصاویر و هلی‌شات */}
      <section className="glass-panel p-4 space-y-3 mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">photo_camera</span>
            <h2 className="text-xs font-bold text-slate-300">E. گالری تصاویر و هلی‌شات</h2>
          </div>
          <span className="text-[10px] text-[#f1cb83] font-bold">
            {toPersianDigits(mediaList.length)} فایل بارگذاری‌شده
          </span>
        </div>

        {/* Hidden Camera & Gallery Inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleImageFilesSelected(e, uploadMediaCategory)}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleImageFilesSelected(e, uploadMediaCategory)}
        />

        {/* Media Carousel Preview */}
        {mediaList.length > 0 && mediaList[activeMediaIndex] && (
          <div className="space-y-2.5">
            <div className="relative h-48 rounded-xl overflow-hidden border border-[#f1cb83]/30 bg-[#050b17]">
              <img
                src={resolveBlobUrl(mediaList[activeMediaIndex].ref || mediaList[activeMediaIndex].url)}
                alt={mediaList[activeMediaIndex].caption}
                className="w-full h-full object-cover"
              />
              {/* Top-left Delete button on active slide */}
              <button
                type="button"
                onClick={() => handleRemoveMediaItem(activeMediaIndex)}
                aria-label="حذف تصویر"
                className="absolute top-2.5 left-2.5 w-9 h-9 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>

              {/* Top-right Badge */}
              <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/70 border border-[#f1cb83]/40 text-[#f1cb83] text-[10px] font-bold">
                {mediaList[activeMediaIndex].isHelicopterShot || mediaList[activeMediaIndex].type === 'drone'
                  ? 'هلی‌شات هوایی'
                  : 'تصویر ملک'}
              </span>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-end p-3 justify-between">
                <span className="text-xs font-bold text-white truncate max-w-[200px]">
                  {mediaList[activeMediaIndex].caption}
                </span>
                {mediaList.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMediaIndex(
                          (activeMediaIndex - 1 + mediaList.length) % mediaList.length
                        )
                      }
                      className="w-8 h-8 rounded-full bg-black/65 text-white flex items-center justify-center text-sm cursor-pointer"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMediaIndex((activeMediaIndex + 1) % mediaList.length)
                      }
                      className="w-8 h-8 rounded-full bg-black/65 text-white flex items-center justify-center text-sm cursor-pointer"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Thumbnail Strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {mediaList.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => setActiveMediaIndex(idx)}
                  className={`relative w-16 h-16 rounded-xl overflow-hidden shrink-0 cursor-pointer border-2 transition-all ${
                    idx === activeMediaIndex
                      ? 'border-[#f1cb83] shadow-[0_0_10px_rgba(241,203,131,0.45)]'
                      : 'border-white/15 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img
                    src={resolveBlobUrl(item.ref || item.url)}
                    alt={item.caption}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveMediaItem(idx);
                    }}
                    aria-label="حذف"
                    className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-rose-600/90 text-white flex items-center justify-center text-[12px]"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Buttons for Regular Images & Heli-shots */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setUploadMediaCategory('photo');
              setIsPhotoSourceSheetOpen(true);
            }}
            className="min-h-[46px] py-2.5 px-3 rounded-xl bg-white/5 hover:bg-[#f1cb83]/15 border border-[#f1cb83]/35 text-[#f1cb83] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
            <span>بارگذاری تصویر جدید</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUploadMediaCategory('drone');
              setIsPhotoSourceSheetOpen(true);
            }}
            className="min-h-[46px] py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">
              flight_takeoff
            </span>
            <span>بارگذاری هلی‌شات</span>
          </button>
        </div>
      </section>

      {/* 7. SECTION F: اسناد، مدارک و تاییدیه‌ها */}
      <section className="glass-panel p-4 space-y-3 mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">cloud_upload</span>
            <h2 className="text-xs font-bold text-slate-300">F. اسناد، مدارک و تاییدیه‌ها</h2>
          </div>
          <button
            type="button"
            onClick={() => docFileInputRef.current?.click()}
            className="min-h-[44px] px-2 flex items-center text-xs text-[#f1cb83] font-bold cursor-pointer hover:underline"
          >
            + افزودن مدرک
          </button>
        </div>

        {/* Hidden Document File Input */}
        <input
          ref={docFileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
          className="hidden"
          onChange={handleDocumentFilesSelected}
        />

        {/* Clear Upload Button */}
        <button
          type="button"
          onClick={() => docFileInputRef.current?.click()}
          className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#091224]/90 hover:bg-[#f1cb83]/15 border border-dashed border-[#f1cb83]/45 text-[#f1cb83] text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">upload_file</span>
          <span>آپلود اسناد این ملک</span>
        </button>

        {docError && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{docError}</span>
          </div>
        )}

        {/* Uploaded Documents List */}
        {documents.length > 0 && (
          <div className="space-y-2 pt-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="p-2.5 rounded-xl bg-[#091224]/85 border border-white/10 flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-[#f1cb83]/15 border border-[#f1cb83]/30 flex items-center justify-center text-[#f1cb83] shrink-0">
                    <span className="material-symbols-outlined text-[20px]">
                      {getDocumentIcon(doc.name)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-100 font-bold truncate">{doc.name}</span>
                      <span
                        className="material-symbols-outlined text-[16px] text-emerald-400 shrink-0"
                        title="بارگذاری شده"
                      >
                        check_circle
                      </span>
                    </div>
                    <span className="text-slate-400 font-mono text-[10px] block" dir="ltr">
                      {doc.size}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteDocument(doc.id)}
                  aria-label="حذف مدرک"
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/25 text-rose-400 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 8. SECTION G: اطلاعات محرمانه مالک */}
      <section className="glass-panel p-4 space-y-3 mb-4 border-amber-500/30">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-[18px]">lock</span>
            <h2 className="text-xs font-bold text-slate-300">
              G. اطلاعات محرمانه مالک (فقط مدیر)
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            ref={(el) => {
              fieldRefs.current.ownerName = el;
            }}
          >
            <label className="text-xs text-slate-300 block mb-1">
              نام و نام خانوادگی مالک <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => {
                setIsDirty(true);
                setOwnerName(e.target.value);
                if (e.target.value.trim()) clearFieldError('ownerName');
              }}
              placeholder="مثال: مهندس رضایی"
              className={`glass-field w-full h-12 px-3 rounded-xl text-xs font-bold text-slate-100 ${
                errors.ownerName ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
              }`}
            />
            {errors.ownerName && (
              <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{errors.ownerName}</span>
              </p>
            )}
          </div>
          <div
            ref={(el) => {
              fieldRefs.current.ownerPhone = el;
            }}
          >
            <label className="text-xs text-slate-300 block mb-1">
              شماره تماس مالک <span className="text-rose-400">*</span>
            </label>
            <input
              type="tel"
              dir="ltr"
              value={ownerPhone}
              onChange={(e) => {
                setIsDirty(true);
                setOwnerPhone(e.target.value);
                if (e.target.value.trim()) clearFieldError('ownerPhone');
              }}
              placeholder="09120000000"
              className={`glass-field w-full h-12 px-3 rounded-xl text-xs font-bold font-mono text-slate-100 text-left ${
                errors.ownerPhone ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
              }`}
            />
            {errors.ownerPhone && (
              <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{errors.ownerPhone}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 9. Inline Action Card at End of Form */}
      <section className="glass-panel p-4 space-y-3 mb-6 border-[#f1cb83]/40">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            type="button"
            onClick={handleFormSubmit}
            disabled={isSaving}
            className="gold-cta-sheen flex-1 h-12 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(241,203,131,0.45)] active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">save</span>
            <span>{isEdit ? 'ذخیره تغییرات ملک' : 'ذخیره ملک'}</span>
          </button>

          {isEdit && onDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirmModal(true)}
              className="h-12 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/40 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
              <span>حذف ملک</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRequestCancel}
            className="h-12 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            <span>انصراف / بازگشت</span>
          </button>
        </div>
      </section>

      {/* 10. Sticky Bottom Bar ABOVE BottomNavigationBar (with safe-area compliance) */}
      <aside
        className="fixed inset-x-0 z-30 bg-[#080d1a]/95 backdrop-blur-2xl border-t border-[#f1cb83]/35 px-3 py-2.5 shadow-[0_-10px_30px_rgba(0,0,0,0.85)]"
        style={{
          bottom: 'var(--nav-h, calc(5rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleFormSubmit}
            disabled={isSaving}
            className="gold-cta-sheen flex-1 h-12 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(241,203,131,0.45)] active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">save</span>
            <span>{isEdit ? 'ذخیره ملک' : 'ذخیره ملک'}</span>
          </button>

          {isEdit && onDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirmModal(true)}
              className="h-12 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/45 font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer shrink-0"
              title="حذف ملک"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>حذف ملک</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRequestCancel}
            className="h-12 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs border border-white/15 flex items-center justify-center cursor-pointer shrink-0"
          >
            انصراف
          </button>
        </div>
      </aside>

      {/* Camera / Gallery Bottom Sheet Modal (Section E) */}
      {isPhotoSourceSheetOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsPhotoSourceSheetOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl glass-panel p-5 border-t sm:border border-[#f1cb83]/40 shadow-2xl text-right space-y-4 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto sm:hidden" />

            <div className="flex items-center justify-between border-b border-[#f1cb83]/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#f1cb83] text-[22px]">
                  add_a_photo
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-[#f1cb83]">
                    {uploadMediaCategory === 'drone'
                      ? 'بارگذاری تصویر هوایی (هلی‌شات)'
                      : 'بارگذاری تصویر جدید ملک'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    منبع تصویر را انتخاب فرمایید
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPhotoSourceSheetOpen(false)}
                className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="min-h-[88px] p-4 rounded-2xl bg-[#091224]/90 hover:bg-[#f1cb83]/15 border border-[#f1cb83]/35 flex flex-col items-center justify-center gap-2 text-[#f1cb83] active:scale-95 transition-all cursor-pointer shadow-md"
              >
                <span className="material-symbols-outlined text-[30px]">photo_camera</span>
                <span className="text-xs font-extrabold">دوربین</span>
                <span className="text-[10px] text-slate-400">ثبت عکس مستقیم با گوشی</span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="min-h-[88px] p-4 rounded-2xl bg-[#091224]/90 hover:bg-[#f1cb83]/15 border border-[#f1cb83]/35 flex flex-col items-center justify-center gap-2 text-[#f1cb83] active:scale-95 transition-all cursor-pointer shadow-md"
              >
                <span className="material-symbols-outlined text-[30px]">photo_library</span>
                <span className="text-xs font-extrabold">گالری</span>
                <span className="text-[10px] text-slate-400">انتخاب یک یا چند تصویر</span>
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
              <h3 className="text-base font-bold text-slate-100">حذف پرونده ملک {code}</h3>
              <p className="text-xs text-rose-300 font-semibold leading-relaxed">
                آیا مطمئن هستید؟ این عمل قابل بازگشت نیست
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleConfirmDelete}
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

      {/* Unsaved Changes Confirmation Modal */}
      {showUnsavedExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl glass-panel p-6 border border-amber-400/50 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-400/40 text-[#f1cb83] flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-100">تغییرات ذخیره‌نشده</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                تغییراتی در فرم ملک ایجاد کرده‌اید که هنوز ذخیره نشده‌اند. آیا می‌خواهید بدون ذخیره
                خارج شوید؟
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedExitModal(false);
                  setIsDirty(false);
                  onCancel();
                }}
                className="min-h-[44px] py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer"
              >
                خروج بدون ذخیره
              </button>
              <button
                type="button"
                onClick={() => setShowUnsavedExitModal(false)}
                className="min-h-[44px] py-2.5 rounded-xl bg-[#f1cb83] text-[#070d1a] font-bold text-xs cursor-pointer"
              >
                ادامه ویرایش
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Form Interactive Satellite Map Pin Picker */}
      {isInternalMapPickerOpen && (
        <MapView
          properties={[]}
          onOpenPropertyDetail={() => {}}
          onBack={() => setIsInternalMapPickerOpen(false)}
          pickMode={true}
          initialCoords={coords || undefined}
          onConfirmPickLocation={(picked) => {
            setIsDirty(true);
            const cleanPicked = {
              lat: Number(picked.lat.toFixed(6)),
              lng: Number(picked.lng.toFixed(6)),
            };
            setCoords(cleanPicked);
            setCoordsInput(`${cleanPicked.lat.toFixed(6)} , ${cleanPicked.lng.toFixed(6)}`);
            setIsInternalMapPickerOpen(false);
            showGpsMessage('موقعیت ملک روی نقشه انتخاب و ثبت شد ✓', 'success');
          }}
        />
      )}
    </div>
  );
};

