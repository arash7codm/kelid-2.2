import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Applicant, Property } from '../types';
import { getNextApplicantCode } from '../db';
import { INITIAL_CITIES, PRIORITY_LEVELS, CREDIT_LEVELS } from '../services/taxonomy';
import { getTodayJalali, formatPriceInWords, formatWithCommas, parseTomanNumber, toPersianDigits } from '../utils/jalali';
import { findMatchesForApplicant } from '../services/matching';
import { VoiceInputButton } from '../components/VoiceInputButton';

interface ApplicantFormViewProps {
  initialApplicant?: Applicant | null;
  properties: Property[];
  onSave: (app: Applicant) => void | Promise<void>;
  onDelete?: (applicantId: string) => void | Promise<void>;
  onCancel: () => void;
  onOpenPropertyDetail?: (prop: Property) => void;
  currentUserRole?: string;
}

export const ApplicantFormView: React.FC<ApplicantFormViewProps> = ({
  initialApplicant,
  properties,
  onSave,
  onDelete,
  onCancel,
  onOpenPropertyDetail,
  currentUserRole = 'مدیر',
}) => {
  const isEdit = !!initialApplicant;
  const today = getTodayJalali();

  const [code, setCode] = useState(initialApplicant?.code || '');
  const [fullName, setFullName] = useState(initialApplicant?.fullName || '');
  const [phone, setPhone] = useState(initialApplicant?.phone || '');
  const [priority, setPriority] = useState<Applicant['priority']>(initialApplicant?.priority || 'خریدار VIP');
  const [creditLevel, setCreditLevel] = useState<Applicant['creditLevel']>(initialApplicant?.creditLevel || 'عالی');
  const [gender, setGender] = useState<Applicant['gender']>(initialApplicant?.gender || 'آقا');
  const [referralSource, setReferralSource] = useState(initialApplicant?.referralSource || '');
  const [confidentialNotes, setConfidentialNotes] = useState(initialApplicant?.confidentialNotes || '');

  // Transaction & category
  const [dealTypes, setDealTypes] = useState<string[]>(initialApplicant?.dealTypes || ['خرید نقدی']);
  const [primaryCity, setPrimaryCity] = useState(initialApplicant?.primaryCity || 'کلارآباد');
  const [preferredNeighborhoods, setPreferredNeighborhoods] = useState<string[]>(
    initialApplicant?.preferredNeighborhoods || ['خیابان ساحلی صدف', 'خوشامیان']
  );
  const [environmentProximity] = useState<string[]>(
    initialApplicant?.environmentProximity || ['دامنه جنگلی و روستایی']
  );

  // Area & Budget (0 when empty on new applicant so true placeholders are shown)
  const [minArea, setMinArea] = useState<number>(initialApplicant?.minArea ?? 0);
  const [maxArea, setMaxArea] = useState<number>(initialApplicant?.maxArea ?? 0);
  const [minBudget, setMinBudget] = useState<number>(initialApplicant?.minBudget ?? 0);
  const [maxBudget, setMaxBudget] = useState<number>(initialApplicant?.maxBudget ?? 0);
  const [liquidityPercent, setLiquidityPercent] = useState<number>(initialApplicant?.liquidityPercent || 80);
  const [canBarter] = useState<boolean>(initialApplicant?.canBarter || false);
  const [barterDesc] = useState<string>(initialApplicant?.barterDesc || '');
  const [settlementMaxDays] = useState<number>(initialApplicant?.settlementMaxDays || 30);

  // Deed & Zoning requirements
  const [deedTypes] = useState<string[]>(initialApplicant?.deedTypes || ['تک‌برگ عرصه و اعیان (ششدانگ)']);
  const [zoningTypes] = useState<string[]>(initialApplicant?.zoningTypes || ['داخل بافت مسکونی ۱۰۰٪']);

  // Follow-up
  const [followUpStatus] = useState<Applicant['followUpStatus']>(initialApplicant?.followUpStatus || 'جدید');
  const [nextFollowUpDate] = useState(initialApplicant?.nextFollowUpDate || '۱۴۰۵/۰۷/۲۵');

  // Dirty state, validation errors & modals
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showUnsavedExitModal, setShowUnsavedExitModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!isEdit && !code) {
      getNextApplicantCode().then(c => setCode(c));
    }
  }, [isEdit, code]);

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

  const clearFieldError = (key: string) => {
    if (errors[key]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Real-time live matching calculation
  const currentApplicantDraft: Applicant = useMemo(() => {
    return {
      id: initialApplicant?.id || 'temp',
      code: code || 'C-001',
      fullName,
      phone,
      priority,
      creditLevel,
      gender,
      referralSource,
      confidentialNotes,
      dealTypes,
      primaryCity,
      preferredNeighborhoods,
      environmentProximity,
      minArea,
      maxArea,
      minBudget,
      maxBudget,
      liquidityPercent,
      canBarter,
      barterDesc,
      settlementMaxDays,
      deedTypes,
      zoningTypes,
      followUpStatus,
      nextFollowUpDate,
      createdAt: initialApplicant?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: (initialApplicant?.version || 0) + 1
    };
  }, [
    initialApplicant, code, fullName, phone, priority, creditLevel, gender, referralSource,
    confidentialNotes, dealTypes, primaryCity, preferredNeighborhoods,
    environmentProximity, minArea, maxArea, minBudget, maxBudget,
    liquidityPercent, canBarter, barterDesc, settlementMaxDays,
    deedTypes, zoningTypes, followUpStatus, nextFollowUpDate
  ]);

  const liveMatches = useMemo(() => {
    return findMatchesForApplicant(currentApplicantDraft, properties, 70);
  }, [currentApplicantDraft, properties]);

  const handleAddNeighborhood = () => {
    const name = prompt('نام محله یا خیابان جدید را وارد کنید:', 'امیردشت');
    if (name && !preferredNeighborhoods.includes(name.trim())) {
      setIsDirty(true);
      setPreferredNeighborhoods([...preferredNeighborhoods, name.trim()]);
    }
  };

  const toggleArrayItem = (list: string[], setList: (l: string[]) => void, item: string) => {
    setIsDirty(true);
    clearFieldError('dealTypes');
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'وارد کردن نام و نام خانوادگی متقاضی الزامی است.';
    }
    if (!phone.trim()) {
      newErrors.phone = 'وارد کردن شماره تماس همراه متقاضی الزامی است.';
    }
    if (dealTypes.length === 0) {
      newErrors.dealTypes = 'حداقل یک نوع معامله را انتخاب کنید.';
    }
    if (!maxArea || maxArea <= 0 || maxArea < minArea) {
      newErrors.areaRange = 'حداکثر متراژ باید بزرگ‌تر از صفر و حداقل متراژ باشد.';
    }
    if (!maxBudget || maxBudget <= 0 || maxBudget < minBudget) {
      newErrors.budgetRange = 'حداکثر بودجه باید بزرگ‌تر از صفر و حداقل بودجه باشد.';
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

  const handleFormSubmit = async () => {
    if (isSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const finalApp: Applicant = {
        ...currentApplicantDraft,
        id: initialApplicant?.id || `app_${Date.now()}`,
        code: code || 'C-001',
        fullName: fullName.trim(),
        phone: phone.trim(),
        updatedAt: new Date().toISOString()
      };

      setIsDirty(false);
      await onSave(finalApp);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestCancel = () => {
    if (isDirty) {
      setShowUnsavedExitModal(true);
    } else {
      onCancel();
    }
  };

  const handleConfirmDelete = async () => {
    if (!initialApplicant || !onDelete) return;
    setShowDeleteConfirmModal(false);
    setIsDirty(false);
    await onDelete(initialApplicant.id);
  };

  const isAdmin = currentUserRole === 'مدیر' || currentUserRole === 'admin';

  return (
    <div className="flex flex-col w-full pb-44 text-right">
      {/* 1. Header Banner */}
      <section className="glass-panel p-4 mb-4 relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRequestCancel}
              aria-label="انصراف و بازگشت"
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <div>
              <h1 className="text-base font-extrabold text-[#f1cb83]">
                {isEdit ? 'ویرایش پرونده متقاضی' : 'ثبت متقاضی جدید'}
              </h1>
              <span className="text-[11px] text-slate-400 font-mono">
                پرونده #KL-{code.replace('C-', '') || '001'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-[#f1cb83] text-xs font-semibold">
              {priority}
            </span>
          </div>
        </div>
      </section>

      {/* 2. SECTION 1: شناسنامه هوشمند متقاضی */}
      <section className="glass-panel p-4 space-y-4 mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">badge</span>
            <h2 className="text-xs font-bold text-slate-200">شناسنامه هوشمند متقاضی</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">{today.formatted}</span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-[#091224]/80 border border-white/10">
          <div>
            <span className="text-xs text-slate-400 block">شناسه متقاضی:</span>
            <span className="text-lg font-bold text-[#f1cb83] font-mono tracking-widest">{code || 'C-...'}</span>
          </div>
          <span className="text-[10px] text-slate-400">تولید خودکار الگوریتم کلید</span>
        </div>

        {/* Priority Level Tiles */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">درجه اولویت و سرعت پاسخ‌دهی پرونده:</label>
          <div className="grid grid-cols-4 gap-1.5">
            {PRIORITY_LEVELS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setIsDirty(true);
                  setPriority(p.label as any);
                }}
                className={`py-2 px-1 rounded-xl text-center text-xs transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  priority === p.label
                    ? 'bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold shadow-md'
                    : 'bg-white/5 text-slate-300 border border-white/10 hover:border-[#f1cb83]/30'
                }`}
              >
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. SECTION 2: پروفایل و ارزیابی اعتباری متقاضی */}
      <section className="glass-panel p-4 space-y-4 mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">account_circle</span>
            <h2 className="text-xs font-bold text-slate-200">پروفایل و ارزیابی اعتباری متقاضی</h2>
          </div>
          <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            پرونده فعال
          </span>
        </div>

        {/* Profile Card Preview */}
        <div className="p-3 rounded-2xl bg-[#091224]/80 border border-[#f1cb83]/20 flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#162344] border-2 border-[#f1cb83]/40 flex items-center justify-center text-[#f1cb83] text-2xl shrink-0 shadow-md">
            <span className="material-symbols-outlined text-[32px]">
              {gender === 'خانم' ? 'face_3' : 'person'}
            </span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-100 truncate">{fullName || 'نام متقاضی'}</span>
              <span className="text-xs font-mono text-[#f1cb83] font-bold">{code}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-slate-400">جنسیت:</span>
              <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setGender('آقا');
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${gender === 'آقا' ? 'bg-[#f1cb83] text-[#070d1a]' : 'text-slate-400'}`}
                >
                  آقا
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setGender('خانم');
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${gender === 'خانم' ? 'bg-[#f1cb83] text-[#070d1a]' : 'text-slate-400'}`}
                >
                  خانم
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Credit Level Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">سطح ارزیابی و توان اعتباری متقاضی:</label>
          <div className="grid grid-cols-4 gap-1.5">
            {CREDIT_LEVELS.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setIsDirty(true);
                  setCreditLevel(c.label as any);
                }}
                className={`py-2 px-1 rounded-xl text-center text-xs font-bold transition-all cursor-pointer ${
                  creditLevel === c.label
                    ? 'border-2 shadow-md'
                    : 'bg-white/5 text-slate-300 border border-white/10'
                }`}
                style={{
                  borderColor: creditLevel === c.label ? c.color : undefined,
                  color: creditLevel === c.label ? c.color : undefined,
                  backgroundColor: creditLevel === c.label ? `${c.color}22` : undefined
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 4. SECTION 3: مشخصات هویتی و ارتباطی */}
      <section className="glass-panel p-4 space-y-4 mb-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#f1cb83]/20">
          <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">contact_phone</span>
          <h2 className="text-xs font-bold text-slate-200">مشخصات هویتی و ارتباطی</h2>
        </div>

        <div
          ref={(el) => { fieldRefs.current.fullName = el; }}
          className="space-y-1.5"
        >
          <label className="text-xs font-bold text-slate-300 block">
            نام و نام خانوادگی خریدار / سرمایه‌گذار <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => {
              setIsDirty(true);
              setFullName(e.target.value);
              if (e.target.value.trim()) clearFieldError('fullName');
            }}
            placeholder="مثال: دکتر آرش جهانگیر"
            className={`glass-field w-full h-12 px-3 rounded-xl text-xs font-bold text-slate-100 ${
              errors.fullName ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
            }`}
          />
          {errors.fullName && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-0.5">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.fullName}</span>
            </p>
          )}
        </div>

        <div
          ref={(el) => { fieldRefs.current.phone = el; }}
          className="space-y-1.5"
        >
          <label className="text-xs font-bold text-slate-300 block">
            شماره تماس مستقیم و همراه <span className="text-rose-400">*</span>
          </label>
          <input
            type="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => {
              setIsDirty(true);
              setPhone(e.target.value);
              if (e.target.value.trim()) clearFieldError('phone');
            }}
            placeholder="09121118940"
            className={`glass-field w-full h-12 px-3 rounded-xl text-xs font-bold font-mono text-slate-100 text-left ${
              errors.phone ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
            }`}
          />
          {errors.phone && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-0.5">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.phone}</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">معرف یا کانال ورودی</label>
          <input
            type="text"
            value={referralSource}
            onChange={(e) => {
              setIsDirty(true);
              setReferralSource(e.target.value);
            }}
            placeholder="همکار معتمد، آگهی یا مراجعه حضوری..."
            className="glass-field w-full h-12 px-3 rounded-xl text-xs text-slate-100"
          />
        </div>

        {/* Confidential Note with Voice Input */}
        {isAdmin && (
          <div className="space-y-1.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">lock</span>
                یادداشت محرمانه و توضیحات متقاضی
              </label>
              <VoiceInputButton
                value={confidentialNotes}
                onChange={(val) => {
                  setIsDirty(true);
                  setConfidentialNotes(val);
                }}
                label="ثبت صوتی توضیحات"
                variant="pill"
              />
            </div>
            <textarea
              value={confidentialNotes}
              onChange={(e) => {
                setIsDirty(true);
                setConfidentialNotes(e.target.value);
              }}
              placeholder="نکات روانشناسی، محدودیت‌های نقدینگی، سرعت تصمیم‌گیری..."
              rows={2}
              className="glass-field w-full p-2.5 rounded-xl text-xs text-slate-100"
            />
          </div>
        )}
      </section>

      {/* 5. SECTION 4: نوع معامله و دسته‌بندی کاربری */}
      <section
        ref={(el) => { fieldRefs.current.dealTypes = el; }}
        className="glass-panel p-4 space-y-3 mb-4"
      >
        <div className="flex items-center gap-2 pb-2 border-b border-[#f1cb83]/20">
          <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">real_estate_agent</span>
          <h2 className="text-xs font-bold text-slate-200">نوع معامله و دسته‌بندی کاربری</h2>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {['خرید نقدی', 'رهن و اجاره سالانه', 'سرمایه‌گذاری مشارکتی', 'پیش‌خرید و ساخت'].map(deal => (
            <button
              key={deal}
              type="button"
              onClick={() => toggleArrayItem(dealTypes, setDealTypes, deal)}
              className={`p-3 rounded-xl text-right text-xs font-bold transition-all border cursor-pointer ${
                dealTypes.includes(deal)
                  ? 'bg-[#f1cb83]/20 border-[#f1cb83] text-[#f1cb83] shadow-md'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-[#f1cb83]/40'
              }`}
            >
              {deal}
            </button>
          ))}
        </div>
        {errors.dealTypes && (
          <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">error</span>
            <span>{errors.dealTypes}</span>
          </p>
        )}
      </section>

      {/* 6. SECTION 5: موقعیت جغرافیایی و محدوده هدف */}
      <section className="glass-panel p-4 space-y-3 mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">location_on</span>
            <h2 className="text-xs font-bold text-slate-200">موقعیت جغرافیایی و محدوده هدف</h2>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1">شهر / حوزه شهری اصلی</label>
          <select
            value={primaryCity}
            onChange={(e) => {
              setIsDirty(true);
              setPrimaryCity(e.target.value);
            }}
            className="glass-field w-full h-12 px-3 rounded-xl text-xs font-bold text-slate-100"
          >
            {INITIAL_CITIES.map(c => (
              <option key={c.id} value={c.name} className="bg-[#0a1328]">{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-300">محله‌ها و خیابان‌های مورد ترجیح خریدار</label>
            <button
              type="button"
              onClick={handleAddNeighborhood}
              className="text-xs text-[#f1cb83] font-bold cursor-pointer"
            >
              + افزودن محله
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-[#091224]/70 border border-white/10">
            {preferredNeighborhoods.map(hood => (
              <span
                key={hood}
                className="px-2.5 py-1 rounded-lg bg-white/10 text-slate-200 text-xs flex items-center gap-1.5"
              >
                <span>{hood}</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setPreferredNeighborhoods(preferredNeighborhoods.filter(h => h !== hood));
                  }}
                  className="hover:text-rose-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 7. SECTION 6: متراژ درخواستی و بودجه */}
      <section className="glass-panel p-4 space-y-4 mb-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#f1cb83]/20">
          <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">straighten</span>
          <h2 className="text-xs font-bold text-slate-200">متراژ و مدل مالی پرداخت</h2>
        </div>

        {/* Area Range */}
        <div ref={(el) => { fieldRefs.current.areaRange = el; }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">حداقل متراژ (متر)</label>
              <input
                type="number"
                value={minArea > 0 ? minArea : ''}
                placeholder="۲۵۰"
                onChange={(e) => {
                  setIsDirty(true);
                  clearFieldError('areaRange');
                  setMinArea(parseInt(e.target.value, 10) || 0);
                }}
                className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                حداکثر متراژ (متر) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                value={maxArea > 0 ? maxArea : ''}
                placeholder="۳۵۰"
                onChange={(e) => {
                  setIsDirty(true);
                  clearFieldError('areaRange');
                  setMaxArea(parseInt(e.target.value, 10) || 0);
                }}
                className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-slate-100"
              />
            </div>
          </div>
          {errors.areaRange && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.areaRange}</span>
            </p>
          )}
        </div>

        {/* Budget Range */}
        <div ref={(el) => { fieldRefs.current.budgetRange = el; }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">حداقل بودجه (تومان)</label>
              <input
                type="text"
                inputMode="numeric"
                value={minBudget > 0 ? formatWithCommas(minBudget) : ''}
                placeholder="۱۰,۰۰۰,۰۰۰,۰۰۰"
                onChange={(e) => {
                  setIsDirty(true);
                  clearFieldError('budgetRange');
                  setMinBudget(parseTomanNumber(e.target.value));
                }}
                className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-[#f1cb83]"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                حداکثر بودجه (تومان) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={maxBudget > 0 ? formatWithCommas(maxBudget) : ''}
                placeholder="۱۵,۰۰۰,۰۰۰,۰۰۰"
                onChange={(e) => {
                  setIsDirty(true);
                  clearFieldError('budgetRange');
                  setMaxBudget(parseTomanNumber(e.target.value));
                }}
                className="glass-field w-full h-11 px-3 rounded-xl text-xs font-bold text-center text-[#f1cb83]"
              />
            </div>
          </div>
          {errors.budgetRange && (
            <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 pt-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errors.budgetRange}</span>
            </p>
          )}
        </div>

        {(minBudget > 0 || maxBudget > 0) && (
          <div className="p-2.5 rounded-xl bg-[#091224]/80 text-xs text-[#f1cb83] text-center font-bold">
            مبلغ حروفی: {minBudget > 0 ? formatPriceInWords(minBudget) : 'صفر تومان'} تا{' '}
            {maxBudget > 0 ? formatPriceInWords(maxBudget) : 'صفر تومان'}
          </div>
        )}

        {/* Liquidity Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300">درصد نقدینگی آماده به واریز:</span>
            <span className="font-bold text-[#f1cb83] font-mono">{toPersianDigits(liquidityPercent)}٪ نقد</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={liquidityPercent}
            onChange={(e) => {
              setIsDirty(true);
              setLiquidityPercent(parseInt(e.target.value, 10));
            }}
            className="w-full accent-[#f1cb83] cursor-pointer"
          />
        </div>
      </section>

      {/* 8. SECTION 7: تطبیق بلادرنگ هوشمند با بانک فایل کلید */}
      <section className="glass-panel p-4 space-y-3 mb-4 border-[#f1cb83]/30 shadow-lg">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">auto_awesome</span>
            <h2 className="text-xs font-bold text-[#f1cb83]">تطبیق هوشمند با بانک فایل کلید</h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-[#f1cb83]/20 text-[#f1cb83] text-xs font-bold">
            {toPersianDigits(liveMatches.length)} فایل مطابق
          </span>
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed">
          الگوریتم تطبیق بلادرنگ بر اساس متراژ ({toPersianDigits(minArea)}-{toPersianDigits(maxArea)} متر)، محدوده ({primaryCity}) و سقف بودجه ({formatWithCommas(maxBudget / 1000000000)} میلیارد تومان) فایلهای زیر را آماده اتصال یافته است:
        </p>

        {liveMatches.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#091224]/70 text-center text-xs text-slate-400">
            فعلاً فایل منطبقی پیدا نشد.
          </div>
        ) : (
          <div className="space-y-2">
            {liveMatches.slice(0, 3).map((m, idx) => (
              <div
                key={idx}
                onClick={() => onOpenPropertyDetail?.(m.property)}
                className="p-2.5 rounded-xl bg-[#091224]/80 border border-white/10 flex items-center justify-between cursor-pointer hover:border-[#f1cb83]/50 transition-all"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded bg-white/5 text-[#f1cb83] font-mono text-xs font-bold">
                    {m.property.code}
                  </span>
                  <span className="text-xs font-bold text-slate-200 truncate">
                    {m.property.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-[#f1cb83] font-mono">
                    {formatWithCommas(m.property.totalPrice / 1000000000)} م.ت
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-bold">
                    {toPersianDigits(m.percentage)}٪ تطبیق
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
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
            <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
            <span>{isEdit ? 'ذخیره تغییرات متقاضی' : 'ثبت متقاضی و اتصال هوشمند'}</span>
          </button>

          {isEdit && onDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirmModal(true)}
              className="h-12 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/40 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
              <span>حذف متقاضی</span>
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

      {/* 10. Sticky Bottom Bar ABOVE BottomNavigationBar */}
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
            <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
            <span>{isEdit ? 'ذخیره متقاضی' : 'ثبت متقاضی'}</span>
          </button>

          {isEdit && onDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirmModal(true)}
              className="h-12 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/45 font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>حذف</span>
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl glass-panel p-6 border border-rose-500/50 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">delete_forever</span>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-100">حذف پرونده متقاضی {code}</h3>
              <p className="text-xs text-rose-300 font-semibold leading-relaxed">
                آیا مطمئن هستید؟ این عمل قابل بازگشت نیست
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg cursor-pointer"
              >
                بله، حذف شود
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs cursor-pointer"
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
                تغییراتی در فرم متقاضی ایجاد کرده‌اید که هنوز ذخیره نشده‌اند. آیا می‌خواهید بدون ذخیره خارج شوید؟
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
                className="py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer"
              >
                خروج بدون ذخیره
              </button>
              <button
                type="button"
                onClick={() => setShowUnsavedExitModal(false)}
                className="py-2.5 rounded-xl bg-[#f1cb83] text-[#070d1a] font-bold text-xs cursor-pointer"
              >
                ادامه ویرایش
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
