import React, { useState, useMemo } from 'react';
import { Collaborator, Property } from '../types';
import { Logo } from '../components/Logo';
import { toPersianDigits } from '../utils/jalali';
import { VoiceInputButton } from '../components/VoiceInputButton';

interface CollaboratorListViewProps {
  collaborators: Collaborator[];
  properties: Property[];
  onOpenCollaboratorDetail: (collab: Collaborator) => void;
  onEditCollaborator: (collab: Collaborator) => void;
  onAddNewCollaborator: () => void;
  onViewCollaboratorProperties: (collab: Collaborator) => void;
  onScheduleUrgentCall: (collab: Collaborator) => void;
  onRefreshSync: () => void;
}

export const CollaboratorListView: React.FC<CollaboratorListViewProps> = ({
  collaborators,
  properties,
  onOpenCollaboratorDetail,
  onEditCollaborator,
  onAddNewCollaborator,
  onViewCollaboratorProperties,
  onScheduleUrgentCall,
  onRefreshSync,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterTab, setSelectedFilterTab] = useState<string>('all');
  const [syncLoading, setSyncLoading] = useState(false);

  // Reconciled counts (§14)
  const totalCount = collaborators.filter(c => !c.deleted).length;
  const overdueCount = collaborators.filter(c => !c.deleted && c.cooperationStatus.includes('ارزیابی')).length;
  const activeCount = collaborators.filter(c => !c.deleted && c.cooperationStatus.includes('VIP')).length;

  // Unique shared files count (§2.1, §14)
  const uniqueSharedFilesCount = useMemo(() => {
    const matchedProps = properties.filter(p => !p.deleted && p.contactPartner);
    const uniqueIds = new Set(matchedProps.map(p => p.id));
    return uniqueIds.size;
  }, [properties]);

  const filteredCollaborators = useMemo(() => {
    let result = collaborators.filter(c => !c.deleted);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c =>
        c.fullName.toLowerCase().includes(q) ||
        c.agencyName.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.primaryCity.toLowerCase().includes(q)
      );
    }

    if (selectedFilterTab === 'active') {
      result = result.filter(c => c.cooperationStatus.includes('VIP'));
    } else if (selectedFilterTab === 'new') {
      result = result.filter(c => c.cooperationStatus.includes('تازه'));
    } else if (selectedFilterTab === 'overdue') {
      result = result.filter(c => c.cooperationStatus.includes('ارزیابی'));
    } else if (selectedFilterTab === 'inactive') {
      result = result.filter(c => c.cooperationStatus.includes('غیرفعال'));
    }

    return result;
  }, [collaborators, searchQuery, selectedFilterTab]);

  const handleSyncClick = () => {
    setSyncLoading(true);
    setTimeout(() => {
      onRefreshSync();
      setSyncLoading(false);
      alert('همگام‌سازی فایلهای اشتراکی با موفقیت انجام شد ✓');
    }, 800);
  };

  return (
    <div className="flex flex-col w-full pb-28 text-right space-y-4 pt-1">
      {/* 1. Header with Frameless Logo (§14) */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <Logo className="h-11 w-auto object-contain shrink-0 drop-shadow-[0_2px_10px_rgba(241,203,131,0.45)]" />
          <div className="flex flex-col">
            <span className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#ffdea3] via-[#f1cb83] to-amber-200">
              کلید
            </span>
            <span className="text-[10px] text-slate-400">مدیریت شبکه و همکاران</span>
          </div>
        </div>
      </div>

      {/* 2. Hero Card & Add Button */}
      <div className="relative overflow-hidden rounded-3xl p-4 glass-panel border border-white/15 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#f1cb83]/25 to-white/5 border border-[#f1cb83]/30 flex items-center justify-center text-[#f1cb83] shrink-0">
            <span className="material-symbols-outlined text-[24px]">hub</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">شبکه همکاران و معرفین</h1>
            <p className="text-[11px] text-slate-400 truncate">مدیریت مشاورین همکار، فایلهای مشترک و کمیسیون‌ها</p>
          </div>
        </div>

        <button
          onClick={onAddNewCollaborator}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-xs flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(241,203,131,0.35)] active:scale-95 transition-all cursor-pointer"
          type="button"
        >
          <span className="material-symbols-outlined text-[20px]">person_add</span>
          <span>ثبت همکار جدید</span>
        </button>

        {/* 3. 4 Live Stat Cards (Tappable per §14) */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div
            onClick={() => setSelectedFilterTab('all')}
            className="p-3 rounded-2xl glass-panel-subtle flex flex-col justify-between cursor-pointer hover:border-[#f1cb83]/40 transition-all"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>کل همکاران</span>
              <span className="material-symbols-outlined text-[16px] text-[#f1cb83]">groups</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-xl font-bold text-[#f1cb83]">{toPersianDigits(totalCount)}</span>
              <span className="text-[10px] text-slate-400">همکار ثبت‌شده</span>
            </div>
          </div>

          <div
            onClick={() => setSelectedFilterTab('overdue')}
            className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex flex-col justify-between cursor-pointer hover:border-rose-400 transition-all"
          >
            <div className="flex items-center justify-between text-xs text-rose-300">
              <span>پیگیری فوری</span>
              <span className="material-symbols-outlined text-[16px] text-rose-400 animate-pulse">priority_high</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-xl font-bold text-rose-400">{toPersianDigits(overdueCount)}</span>
              <span className="text-[10px] text-rose-300/80">مورد معوق</span>
            </div>
          </div>

          <div
            onClick={() => setSelectedFilterTab('active')}
            className="p-3 rounded-2xl glass-panel-subtle flex flex-col justify-between cursor-pointer hover:border-[#f1cb83]/40 transition-all"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>همکاری فعال</span>
              <span className="material-symbols-outlined text-[16px] text-emerald-400">verified</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-xl font-bold text-slate-100">{toPersianDigits(activeCount)}</span>
              <span className="text-[10px] text-slate-400">شریک رسمی</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl glass-panel-subtle flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>فایل‌های دریافتی</span>
              <span className="material-symbols-outlined text-[16px] text-sky-400">share_location</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-xl font-bold text-slate-100">{toPersianDigits(uniqueSharedFilesCount)}</span>
              <span className="text-[10px] text-slate-400">فایل مشترک</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Search and Status Tabs */}
      <div className="space-y-2">
        <div className="relative">
          <div className="flex items-center w-full rounded-2xl bg-[#0b1426]/75 border border-[#f1cb83]/30 px-3 py-1.5 shadow-inner gap-1.5">
            <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو نام همکار، آژانس، شهر، تخصص..."
              className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-400 outline-none"
              type="text"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-white p-1">
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}
            <VoiceInputButton
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              append={false}
              variant="icon"
              label="جستجوی صوتی همکار"
            />
          </div>
        </div>

        {/* Status Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: `همه (${toPersianDigits(totalCount)})` },
            { id: 'active', label: `همکاری فعال (${toPersianDigits(activeCount)})` },
            { id: 'new', label: `تازه آشنا (${toPersianDigits(totalCount - activeCount)})` },
            { id: 'overdue', label: `پیگیری معوق (${toPersianDigits(overdueCount)})` },
            { id: 'inactive', label: 'غیرفعال (۰)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedFilterTab(tab.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                selectedFilterTab === tab.id
                  ? 'bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold shadow-md'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:border-[#f1cb83]/40'
              }`}
              type="button"
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 5. Collaborator Cards Feed */}
      <div className="space-y-3.5">
        {filteredCollaborators.length === 0 ? (
          <div className="p-8 rounded-2xl glass-panel text-center text-xs text-slate-400 space-y-3">
            <span className="material-symbols-outlined text-4xl text-[#f1cb83]/50">person_off</span>
            <p>
              {collaborators.length === 0
                ? 'هنوز همکاری در سامانه ثبت نشده است.'
                : 'همکاری با این مشخصات یافت نشد.'}
            </p>
            {collaborators.length === 0 && (
              <button
                onClick={onAddNewCollaborator}
                className="px-4 py-2 rounded-xl bg-[#f1cb83] text-[#070d1a] font-bold text-xs"
              >
                ثبت همکار جدید
              </button>
            )}
          </div>
        ) : (
          filteredCollaborators.map((collab) => {
            const isOverdue = collab.cooperationStatus.includes('ارزیابی');
            return (
              <div
                key={collab.id}
                onClick={() => onEditCollaborator(collab)}
                className="rounded-2xl p-4 glass-panel border border-white/15 shadow-lg flex flex-col space-y-3 relative overflow-hidden transition-all hover:border-[#f1cb83]/50 cursor-pointer"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar with Status Dot */}
                    <div className="relative">
                      <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-amber-400/20 to-[#0a1328] border-2 border-[#f1cb83]/40 flex items-center justify-center p-1">
                        <span className="material-symbols-outlined text-[26px] text-[#f1cb83]">
                          {collab.gender === 'خانم' ? 'face_3' : 'person'}
                        </span>
                      </div>
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-[#081224]" />
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-100">{collab.fullName}</h2>
                        {/* H-code on ONE LINE per §1.10 */}
                        <span
                          className="px-2 py-0.5 rounded-md bg-[#f1cb83]/15 border border-[#f1cb83]/30 text-[#f1cb83] text-[11px] font-mono font-bold"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {collab.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-0.5">
                        <span className="material-symbols-outlined text-[15px] text-emerald-400">storefront</span>
                        <span>{collab.agencyName}</span>
                        <span>•</span>
                        <span>{collab.primaryCity}</span>
                      </div>
                    </div>
                  </div>

                  {/* Direct Call Button */}
                  <a
                    href={`tel:${collab.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-11 h-11 rounded-2xl bg-white/5 border border-[#f1cb83]/30 flex items-center justify-center text-[#f1cb83] shadow-md hover:bg-[#f1cb83]/10 active:scale-95 transition-all shrink-0"
                    title="تماس مستقیم"
                  >
                    <span className="material-symbols-outlined text-[20px]">call</span>
                  </a>
                </div>

                {/* Badges Row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">verified</span>
                    {collab.cooperationStatus}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px]">
                    تخصص: {collab.specialties?.slice(0, 2).join('، ') || 'زمین، ویلا'}
                  </span>
                  {collab.coverageNeighborhoods && collab.coverageNeighborhoods.length > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px]">
                      محدوده: {collab.coverageNeighborhoods[0]}
                    </span>
                  )}
                </div>

                {/* Commission and Property Terms Box (§14) */}
                <div className="rounded-xl p-2.5 bg-[#091224]/80 border border-white/5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">شرایط توافق:</span>
                    <span className="text-[#f1cb83] font-semibold">{collab.commissionFormula}</span>
                  </div>
                </div>

                {/* Overdue Alert if applicable */}
                {isOverdue && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-between text-xs text-rose-300">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-[18px]">warning</span>
                      <span>پیگیری عقب‌افتاده! (موعد: {collab.nextFollowUpDate || 'تعیین نشده'})</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onScheduleUrgentCall(collab);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-500 text-white font-bold text-[11px]"
                    >
                      برنامه‌ریزی تماس فوری
                    </button>
                  </div>
                )}

                {/* Bottom Actions (§14) */}
                <div
                  className="pt-2 flex items-center gap-2 border-t border-white/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onViewCollaboratorProperties(collab)}
                    className="flex-1 h-10 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">folder_shared</span>
                    <span>مشاهده فایل‌های این همکار</span>
                  </button>
                  <button
                    onClick={() => onEditCollaborator(collab)}
                    className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center border border-white/10 active:scale-95 transition-all"
                    title="ویرایش مشخصات"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. Bottom Bar «همگام‌سازی فایل‌های اشتراکی» (§14) */}
      <div className="rounded-2xl p-3.5 glass-panel flex items-center justify-between border border-white/10 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#f1cb83]">
            <span className={`material-symbols-outlined text-[20px] ${syncLoading ? 'animate-spin' : ''}`}>
              sync_saved_locally
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-100 block">همگام‌سازی فایل‌های اشتراکی</span>
            <span className="text-[10px] text-slate-400">آخرین به‌روزرسانی: دقایقی پیش</span>
          </div>
        </div>
        <button
          onClick={handleSyncClick}
          disabled={syncLoading}
          className="px-3 py-1.5 rounded-xl bg-white/5 border border-[#f1cb83]/30 text-[#f1cb83] text-xs font-bold hover:bg-[#f1cb83]/10 active:scale-95 transition-all"
        >
          {syncLoading ? 'در حال تازه‌سازی...' : 'تازه‌سازی'}
        </button>
      </div>
    </div>
  );
};
