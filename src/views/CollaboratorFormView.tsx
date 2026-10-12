import React, { useState, useEffect, useRef } from 'react';
import { Collaborator } from '../types';
import { getNextCollaboratorCode } from '../db';
import { INITIAL_CITIES, CREDIT_LEVELS } from '../services/taxonomy';
import { VoiceInputButton } from '../components/VoiceInputButton';

interface CollaboratorFormViewProps {
  initialCollaborator?: Collaborator | null;
  onSave: (collab: Collaborator) => void | Promise<void>;
  onDelete?: (collaboratorId: string) => void | Promise<void>;
  onCancel: () => void;
  currentUserRole?: string;
}

export const CollaboratorFormView: React.FC<CollaboratorFormViewProps> = ({
  initialCollaborator,
  onSave,
  onDelete,
  onCancel,
  currentUserRole = 'مدیر',
}) => {
  const isEdit = !!initialCollaborator;

  const [code, setCode] = useState(initialCollaborator?.code || '');
  const [fullName, setFullName] = useState(initialCollaborator?.fullName || '');
  const [phone, setPhone] = useState(initialCollaborator?.phone || '');
  const [agencyName, setAgencyName] = useState(initialCollaborator?.agencyName || '');
  const [role, setRole] = useState<Collaborator['role']>(initialCollaborator?.role || 'مدیر آژانس');
  const [gender, setGender] = useState<Collaborator['gender']>(initialCollaborator?.gender || 'آقا');
  const [performanceLevel, setPerformanceLevel] = useState<Collaborator['performanceLevel']>(
    initialCollaborator?.performanceLevel || 'عالی'
  );

  // Territory
  const [primaryCity, setPrimaryCity] = useState(initialCollaborator?.primaryCity || 'متلقو (سلمان‌شهر)');
  const [coverageNeighborhoods, setCoverageNeighborhoods] = useState<string[]>(
    initialCollaborator?.coverageNeighborhoods || ['خوشامیان', 'کمربندی متل‌قو', 'تیلاکنار']
  );
  const [specialties, setSpecialties] = useState<string[]>(
    initialCollaborator?.specialties || ['زمین و کلنگی', 'ویلا لوکس و مدرن']
  );
  const [landformMastery] = useState<string[]>(
    initialCollaborator?.landformMastery || ['داخل بافت', 'تک‌برگ عرصه']
  );

  // Financial & Commission
  const [commissionFormula, setCommissionFormula] = useState<Collaborator['commissionFormula']>(
    initialCollaborator?.commissionFormula || 'نصف کمیسیون (۵۰/۵۰)'
  );
  const [commissionNotes, setCommissionNotes] = useState(initialCollaborator?.commissionNotes || '');

  // Status & Follow-up
  const [cooperationStatus, setCooperationStatus] = useState<Collaborator['cooperationStatus']>(
    initialCollaborator?.cooperationStatus || 'همکاری فعال (VIP)'
  );
  const [nextFollowUpDate] = useState(initialCollaborator?.nextFollowUpDate || '۱۴۰۵/۰۷/۲۵');
  const [privateNotes, setPrivateNotes] = useState(initialCollaborator?.privateNotes || '');

  // Dirty state, validation errors & modals
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showUnsavedExitModal, setShowUnsavedExitModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!isEdit && !code) {
      getNextCollaboratorCode().then(c => setCode(c));
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

  const toggleSpecialty = (item: string) => {
    setIsDirty(true);
    if (specialties.includes(item)) {
      setSpecialties(specialties.filter(s => s !== item));
    } else {
      setSpecialties([...specialties, item]);
    }
  };

  const handleAddNeighborhood = () => {
    const val = prompt('نام محله یا روستای جدید:', 'دانیال');
    if (val && !coverageNeighborhoods.includes(val.trim())) {
      setIsDirty(true);
      setCoverageNeighborhoods([...coverageNeighborhoods, val.trim()]);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'وارد کردن نام و نام خانوادگی همکار الزامی است.';
    }
    if (!phone.trim()) {
      newErrors.phone = 'وارد کردن شماره موبایل همکار الزامی است.';
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
      const finalCollab: Collaborator = {
        id: initialCollaborator?.id || `collab_${Date.now()}`,
        code: code || 'H-001',
        fullName: fullName.trim(),
        phone: phone.trim(),
        agencyName: agencyName.trim() || 'دفتر مشاور املاک مستقل',
        role,
        gender,
        performanceLevel,
        primaryCity,
        coverageNeighborhoods,
        specialties,
        landformMastery,
        commissionFormula,
        commissionNotes,
        cooperationStatus,
        nextFollowUpDate,
        privateNotes,
        createdAt: initialCollaborator?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: (initialCollaborator?.version || 0) + 1
      };

      setIsDirty(false);
      await onSave(finalCollab);
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
    if (!initialCollaborator || !onDelete) return;
    setShowDeleteConfirmModal(false);
    setIsDirty(false);
    await onDelete(initialCollaborator.id);
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
                {isEdit ? 'ویرایش پرونده همکار' : 'ثبت همکار جدید'}
              </h1>
              <span className="text-[11px] text-slate-400">شبکه مشاورین، آژانس‌ها و شرایط کمیسیون</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-1 rounded-xl bg-amber-400/15 border border-amber-400/35 text-[#f1cb83] font-mono text-xs font-bold"
              style={{ whiteSpace: 'nowrap' }}
            >
              {code || 'H-...'}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Avatar & Performance Level Bar */}
      <div className="p-4 rounded-2xl glass-panel flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#0a1328] border-2 border-[#f1cb83]/50 flex items-center justify-center text-[#f1cb83] text-2xl shadow-md">
              <span className="material-symbols-outlined text-[30px]">
                {gender === 'خانم' ? 'face_3' : 'person'}
              </span>
            </div>
            <div>
              <span className="text-sm font-bold text-slate-100 block">{fullName || 'نام همکار'}</span>
              <span className="text-xs text-[#f1cb83] font-mono font-bold" style={{ whiteSpace: 'nowrap' }}>
                {code}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => {
                setIsDirty(true);
                setGender('آقا');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${gender === 'آقا' ? 'bg-[#f1cb83] text-[#070d1a]' : 'text-slate-400'}`}
            >
              آقا
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDirty(true);
                setGender('خانم');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${gender === 'خانم' ? 'bg-[#f1cb83] text-[#070d1a]' : 'text-slate-400'}`}
            >
              خانم
            </button>
          </div>
        </div>

        {/* Level Selector */}
        <div className="space-y-1.5 pt-1 border-t border-white/5">
          <span className="text-xs text-slate-300 font-semibold block">سطح عملکرد همکار:</span>
          <div className="grid grid-cols-4 gap-1.5">
            {CREDIT_LEVELS.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setIsDirty(true);
                  setPerformanceLevel(c.label as any);
                }}
                className={`py-2 px-1 rounded-xl text-center text-xs font-bold transition-all cursor-pointer ${
                  performanceLevel === c.label
                    ? 'border-2 shadow-sm'
                    : 'bg-white/5 text-slate-300 border border-white/10'
                }`}
                style={{
                  borderColor: performanceLevel === c.label ? c.color : undefined,
                  color: performanceLevel === c.label ? c.color : undefined,
                  backgroundColor: performanceLevel === c.label ? `${c.color}22` : undefined
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. SECTION 1: مشخصات فردی و ارتباطی */}
      <section className="glass-panel p-4 space-y-4 mb-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#f1cb83]/20">
          <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">badge</span>
          <h2 className="text-xs font-bold text-slate-200">مشخصات فردی و ارتباطی</h2>
        </div>

        <div
          ref={(el) => { fieldRefs.current.fullName = el; }}
          className="space-y-1.5"
        >
          <label className="text-xs font-bold text-slate-300 block">
            نام و نام خانوادگی کامل <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => {
              setIsDirty(true);
              setFullName(e.target.value);
              if (e.target.value.trim()) clearFieldError('fullName');
            }}
            placeholder="مثال: مهندس کیان رضوانی"
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
            شماره موبایل مستقیم جهت هماهنگی <span className="text-rose-400">*</span>
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
            placeholder="09123456789"
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
          <label className="text-xs font-bold text-slate-300 block">نام دفتر املاک / برند تجاری</label>
          <input
            type="text"
            value={agencyName}
            onChange={(e) => {
              setIsDirty(true);
              setAgencyName(e.target.value);
            }}
            placeholder="مثال: املاک رویال متل‌قو"
            className="glass-field w-full h-12 px-3 rounded-xl text-xs text-slate-100"
          />
        </div>

        {/* Role Tiles */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">سمت و رسته سازمانی</label>
          <div className="grid grid-cols-2 gap-2">
            {['مدیر آژانس', 'سرپرست رنج', 'مشاور مستقل', 'سرمایه‌گذار سازنده'].map(r => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setIsDirty(true);
                  setRole(r as any);
                }}
                className={`p-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  role === r
                    ? 'bg-[#f1cb83]/20 border-[#f1cb83] text-[#f1cb83]'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 4. SECTION 2: محدوده کاری و تخصص‌ها */}
      <section className="glass-panel p-4 space-y-4 mb-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#f1cb83]/20">
          <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">map</span>
          <h2 className="text-xs font-bold text-slate-200">محدوده کاری و تخصص‌ها</h2>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1">شهر اصلی تمرکز فعالیت *</label>
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

        {/* Neighborhood tags */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300">محله‌ها و روستاهای تحت نفوذ</label>
            <button type="button" onClick={handleAddNeighborhood} className="text-xs text-[#f1cb83] font-bold cursor-pointer">
              + افزودن محله
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-[#091224]/80 border border-white/10">
            {coverageNeighborhoods.map(h => (
              <span key={h} className="px-2.5 py-1 rounded-lg bg-white/10 text-slate-200 text-xs flex items-center gap-1.5">
                <span>{h}</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setCoverageNeighborhoods(coverageNeighborhoods.filter(i => i !== h));
                  }}
                  className="hover:text-rose-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Specialties */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">تخصص‌های ملکی اصلی</label>
          <div className="grid grid-cols-2 gap-2">
            {['زمین و کلنگی', 'ویلا لوکس و مدرن', 'آپارتمان و پنت‌هاوس', 'تجاری و خدماتی', 'شهرک‌های برند', 'هکتاری و باغات'].map(spec => (
              <button
                key={spec}
                type="button"
                onClick={() => toggleSpecialty(spec)}
                className={`p-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                  specialties.includes(spec)
                    ? 'bg-[#f1cb83]/20 border-[#f1cb83] text-[#f1cb83]'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                {spec}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 5. SECTION 3: شرایط مالی و تسهیم کمیسیون */}
      <section className="glass-panel p-4 space-y-3 mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">percent</span>
            <h2 className="text-xs font-bold text-slate-200">شرایط مالی و تسهیم کمیسیون</h2>
          </div>
          <span className="text-[10px] text-[#f1cb83] font-bold">توافق شفاف</span>
        </div>

        <div className="space-y-2">
          {['نصف کمیسیون (۵۰/۵۰)', 'شیرینی توافقی بر مبنای قرارداد'].map(formula => (
            <label
              key={formula}
              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                commissionFormula === formula
                  ? 'bg-[#f1cb83]/15 border-[#f1cb83] text-[#f1cb83]'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              <span className="text-xs font-bold">{formula}</span>
              <input
                type="radio"
                name="commission"
                checked={commissionFormula === formula}
                onChange={() => {
                  setIsDirty(true);
                  setCommissionFormula(formula as any);
                }}
                className="accent-[#f1cb83]"
              />
            </label>
          ))}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-xs text-slate-300 block">توضیحات تکمیلی تسویه و شیرینی</label>
            <VoiceInputButton
              value={commissionNotes}
              onChange={(val) => {
                setIsDirty(true);
                setCommissionNotes(val);
              }}
              label="ثبت صوتی توافق"
              variant="pill"
            />
          </div>
          <textarea
            value={commissionNotes}
            onChange={(e) => {
              setIsDirty(true);
              setCommissionNotes(e.target.value);
            }}
            placeholder="توافقات شفاهی در خصوص نحوه تسویه کمیسیون..."
            rows={2}
            className="glass-field w-full p-2.5 rounded-xl text-xs text-slate-100"
          />
        </div>
      </section>

      {/* 6. SECTION 4: سطح همکاری و پیگیری */}
      <section className="glass-panel p-4 space-y-3 mb-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">event_repeat</span>
            <h2 className="text-xs font-bold text-slate-200">سطح همکاری و پیگیری</h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {['همکاری فعال (VIP)', 'تازه آشنا / جدید', 'در حال ارزیابی', 'غیرفعال / راکد'].map(st => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setIsDirty(true);
                setCooperationStatus(st as any);
              }}
              className={`p-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                cooperationStatus === st
                  ? 'bg-[#f1cb83]/20 border-[#f1cb83] text-[#f1cb83]'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Private Notes with Voice Input */}
        {isAdmin && (
          <div className="space-y-1.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">lock</span>
                یادداشت‌های محرمانه سیستم مشاور
              </label>
              <VoiceInputButton
                value={privateNotes}
                onChange={(val) => {
                  setIsDirty(true);
                  setPrivateNotes(val);
                }}
                label="ثبت صوتی یادداشت"
                variant="pill"
              />
            </div>
            <textarea
              value={privateNotes}
              onChange={(e) => {
                setIsDirty(true);
                setPrivateNotes(e.target.value);
              }}
              placeholder="ارتباط با مالکین، سبک کاری و خصوصیات اخلاقی..."
              rows={2}
              className="glass-field w-full p-2.5 rounded-xl text-xs text-slate-100"
            />
          </div>
        )}
      </section>

      {/* 7. Inline Action Card at End of Form */}
      <section className="glass-panel p-4 space-y-3 mb-6 border-[#f1cb83]/40">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            type="button"
            onClick={handleFormSubmit}
            disabled={isSaving}
            className="gold-cta-sheen flex-1 h-12 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(241,203,131,0.45)] active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">save</span>
            <span>{isEdit ? 'ذخیره تغییرات همکار' : 'ذخیره اطلاعات همکار'}</span>
          </button>

          {isEdit && onDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirmModal(true)}
              className="h-12 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/40 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
              <span>حذف همکار</span>
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

      {/* 8. Sticky Bottom Bar ABOVE BottomNavigationBar */}
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
            <span>{isEdit ? 'ذخیره همکار' : 'ذخیره اطلاعات همکار'}</span>
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
              <h3 className="text-base font-bold text-slate-100">حذف پرونده همکار {code}</h3>
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
                تغییراتی در فرم همکار ایجاد کرده‌اید که هنوز ذخیره نشده‌اند. آیا می‌خواهید بدون ذخیره خارج شوید؟
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
