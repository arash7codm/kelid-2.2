import React, { useState, useMemo } from 'react';
import { Applicant, Property } from '../types';
import { Logo } from '../components/Logo';
import { ApplicantFilterDrawer, ApplicantFilterValues } from './ApplicantFilterDrawer';
import { toPersianDigits, formatWithCommas } from '../utils/jalali';
import { findMatchesForApplicant } from '../services/matching';
import { VoiceInputButton } from '../components/VoiceInputButton';

interface ApplicantListViewProps {
  applicants: Applicant[];
  properties: Property[];
  onOpenApplicantDetail: (app: Applicant) => void;
  onEditApplicant: (app: Applicant) => void;
  onAddNewApplicant: () => void;
  onOpenPropertyDetail: (prop: Property) => void;
  onViewMatchedProperties: (app: Applicant) => void;
  onScheduleUrgentCall: (app: Applicant) => void;
}

export const ApplicantListView: React.FC<ApplicantListViewProps> = ({
  applicants,
  properties,
  onOpenApplicantDetail,
  onEditApplicant,
  onAddNewApplicant,
  onOpenPropertyDetail,
  onViewMatchedProperties,
  onScheduleUrgentCall,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusTab, setSelectedStatusTab] = useState<string>('all');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Avatar level popover inline edit state
  const [activeAvatarEditId, setActiveAvatarEditId] = useState<string | null>(null);

  const [filterValues, setFilterValues] = useState<ApplicantFilterValues>({
    minArea: 0,
    maxArea: 10000,
    minBudget: 0,
    maxBudget: 100000000000
  });

  // Reconciled Stats (§10)
  const totalCount = applicants.filter(a => !a.deleted).length;
  const overdueCount = applicants.filter(a => !a.deleted && a.followUpStatus === 'در حال پیگیری' && a.priority === 'ضرب‌الاجل').length;
  const inProgressCount = applicants.filter(a => !a.deleted && a.followUpStatus === 'در حال پیگیری').length;
  const newCount = applicants.filter(a => !a.deleted && a.followUpStatus === 'جدید').length;
  const visitCount = applicants.filter(a => !a.deleted && a.followUpStatus === 'بازدید').length;
  const doneCount = applicants.filter(a => !a.deleted && a.followUpStatus === 'معامله‌شده').length;

  // Sum of budget ceilings in Billion Toman
  const totalDemandBillion = useMemo(() => {
    const totalToman = applicants
      .filter(a => !a.deleted)
      .reduce((sum, a) => sum + (a.maxBudget || 0), 0);
    return Math.round(totalToman / 1000000000);
  }, [applicants]);

  // Filtering
  const filteredApplicants = useMemo(() => {
    let result = applicants.filter(a => !a.deleted);

    // Search query (name, code, phone)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(a =>
        a.fullName.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.phone.includes(q) ||
        a.primaryCity.toLowerCase().includes(q)
      );
    }

    // Status Tab
    if (selectedStatusTab === 'following') {
      result = result.filter(a => a.followUpStatus === 'در حال پیگیری');
    } else if (selectedStatusTab === 'new') {
      result = result.filter(a => a.followUpStatus === 'جدید');
    } else if (selectedStatusTab === 'visit') {
      result = result.filter(a => a.followUpStatus === 'بازدید');
    } else if (selectedStatusTab === 'done') {
      result = result.filter(a => a.followUpStatus === 'معامله‌شده');
    } else if (selectedStatusTab === 'urgent') {
      result = result.filter(a => a.priority === 'ضرب‌الاجل');
    }

    // Drawer Filters (Area & Budget overlap)
    if (filterValues.minArea > 0) {
      result = result.filter(a => a.maxArea >= filterValues.minArea);
    }
    if (filterValues.maxArea < 10000) {
      result = result.filter(a => a.minArea <= filterValues.maxArea);
    }
    if (filterValues.minBudget > 0) {
      result = result.filter(a => a.maxBudget >= filterValues.minBudget);
    }
    if (filterValues.maxBudget < 100000000000) {
      result = result.filter(a => a.minBudget <= filterValues.maxBudget);
    }

    return result;
  }, [applicants, searchQuery, selectedStatusTab, filterValues]);

  // Level color mapping
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'عالی': return { text: '#34d399', bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.4)' };
      case 'خوب': return { text: '#f1cb83', bg: 'rgba(241,203,131,0.15)', border: 'rgba(241,203,131,0.4)' };
      case 'عادی': return { text: '#38bdf8', bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.4)' };
      case 'ضعیف': return { text: '#f43f5e', bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.4)' };
      default: return { text: '#f1cb83', bg: 'rgba(241,203,131,0.15)', border: 'rgba(241,203,131,0.4)' };
    }
  };

  return (
    <div className="flex flex-col w-full pb-28 text-right">
      {/* 1. Top Identity Header (§10) */}
      <div className="flex flex-col space-y-3 pt-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Logo className="h-11 w-auto object-contain shrink-0 drop-shadow-[0_2px_10px_rgba(241,203,131,0.45)]" />
            <div className="flex flex-col min-w-0">
              <h1 className="text-base font-bold text-slate-100 tracking-tight truncate">
                مدیریت متقاضیان و تطبیق فایل‌ها
              </h1>
              <span className="text-[10px] text-slate-400">سامانه تقاضا و خریداران سرمایه‌گذاری</span>
            </div>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#f1cb83] live-dot-pulse" />
        </div>

        {/* 2. 4 Live Stat Cards (Tappable per §10) */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          {/* Card 1: کل متقاضیان */}
          <div
            onClick={() => setSelectedStatusTab('all')}
            className={`p-2.5 rounded-xl glass-panel-subtle flex flex-col items-center justify-center text-center cursor-pointer transition-all ${selectedStatusTab === 'all' ? 'border-[#f1cb83] shadow-md' : ''}`}
          >
            <span className="text-[10px] text-slate-400 font-medium">کل متقاضیان</span>
            <span className="text-sm font-bold text-slate-100 mt-0.5 font-mono">
              {toPersianDigits(totalCount)}
            </span>
            <span className="text-[9px] text-[#f1cb83]/80">پرونده</span>
          </div>

          {/* Card 2: پیگیری فوری */}
          <div
            onClick={() => setSelectedStatusTab('urgent')}
            className={`p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${selectedStatusTab === 'urgent' ? 'border-rose-400 ring-1 ring-rose-400' : ''}`}
          >
            <span className="text-[10px] text-rose-300 font-medium">پیگیری فوری</span>
            <span className="text-sm font-bold text-rose-400 mt-0.5 font-mono">
              {toPersianDigits(overdueCount)}
            </span>
            <span className="text-[9px] text-rose-400/80">معوق</span>
          </div>

          {/* Card 3: در حال پیگیری */}
          <div
            onClick={() => setSelectedStatusTab('following')}
            className={`p-2.5 rounded-xl glass-panel-subtle flex flex-col items-center justify-center text-center cursor-pointer transition-all ${selectedStatusTab === 'following' ? 'border-[#f1cb83] shadow-md' : ''}`}
          >
            <span className="text-[10px] text-slate-400 font-medium">در حال پیگیری</span>
            <span className="text-sm font-bold text-[#f1cb83] mt-0.5 font-mono">
              {toPersianDigits(inProgressCount)}
            </span>
            <span className="text-[9px] text-[#f1cb83]/80">فعال</span>
          </div>

          {/* Card 4: ارزش تقاضا */}
          <div className="p-2.5 rounded-xl glass-panel-subtle flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-slate-400 font-medium">ارزش تقاضا</span>
            <span className="text-xs font-bold text-[#f1cb83] mt-0.5 font-mono">
              {toPersianDigits(totalDemandBillion)}
            </span>
            <span className="text-[9px] text-slate-400">م.تومان</span>
          </div>
        </div>

        {/* 3. Button «+ ثبت متقاضی جدید» */}
        <button
          onClick={onAddNewApplicant}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] text-xs font-bold shadow-[0_4px_20px_rgba(241,203,131,0.35)] active:scale-95 transition-all cursor-pointer"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>+ ثبت متقاضی جدید</span>
        </button>
      </div>

      {/* 4. Search and Status Tabs */}
      <div className="space-y-2 mt-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="flex items-center w-full rounded-2xl bg-[#0b1426]/75 border border-[#f1cb83]/30 px-3 py-1.5 shadow-inner gap-1.5">
              <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی نام متقاضی، کد، شماره تماس..."
                className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-400 outline-none"
                type="text"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                </button>
              )}
              <VoiceInputButton
                value={searchQuery}
                onChange={(val) => setSearchQuery(val)}
                append={false}
                variant="icon"
                label="جستجوی صوتی متقاضی"
              />
            </div>
          </div>

          <button
            onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
              isFilterDrawerOpen
                ? 'bg-[#f1cb83] text-[#070d1a] border-[#f1cb83]'
                : 'bg-white/5 border-white/10 text-[#f1cb83]'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </button>
        </div>

        {/* Status Chips Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'همه', count: totalCount },
            { id: 'following', label: 'در حال پیگیری', count: inProgressCount },
            { id: 'new', label: 'جدید', count: newCount },
            { id: 'visit', label: 'بازدید', count: visitCount },
            { id: 'done', label: 'معامله‌شده', count: doneCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatusTab(tab.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                selectedStatusTab === tab.id
                  ? 'bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold shadow-md'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:border-[#f1cb83]/40'
              }`}
              type="button"
            >
              <span>{tab.label}</span>
              <span className="font-mono">({toPersianDigits(tab.count)})</span>
            </button>
          ))}
        </div>
      </div>

      {/* 5. Simple Filter Drawer (§13) */}
      <ApplicantFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        filters={filterValues}
        onApplyFilters={(newF) => setFilterValues(newF)}
        onResetFilters={() => {
          setFilterValues({
            minArea: 0,
            maxArea: 10000,
            minBudget: 0,
            maxBudget: 100000000000
          });
        }}
        matchCount={filteredApplicants.length}
      />

      {/* 6. Applicant Cards Feed */}
      <div className="space-y-3.5 mt-3">
        {filteredApplicants.length === 0 ? (
          <div className="p-8 rounded-2xl glass-panel text-center text-xs text-slate-400 space-y-3">
            <span className="material-symbols-outlined text-4xl text-[#f1cb83]/50">person_search</span>
            <p>
              {applicants.length === 0
                ? 'هنوز متقاضی‌ای در سامانه ثبت نشده است.'
                : 'متقاضی‌ای با این مشخصات پیدا نشد.'}
            </p>
            {applicants.length === 0 ? (
              <button
                onClick={onAddNewApplicant}
                className="px-4 py-2 rounded-xl bg-[#f1cb83] text-[#070d1a] font-bold text-xs"
              >
                ثبت متقاضی جدید
              </button>
            ) : (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedStatusTab('all');
                  setFilterValues({
                    minArea: 0,
                    maxArea: 10000,
                    minBudget: 0,
                    maxBudget: 100000000000
                  });
                }}
                className="px-4 py-2 rounded-xl bg-white/10 text-slate-200 font-bold text-xs"
              >
                بازنشانی فیلترها
              </button>
            )}
          </div>
        ) : (
          filteredApplicants.map((app) => {
            const matches = findMatchesForApplicant(app, properties, 70);
            const levelStyle = getLevelColor(app.creditLevel);
            const isOverdue = app.priority === 'ضرب‌الاجل';

            return (
              <div
                key={app.id}
                className="rounded-2xl p-3.5 glass-panel border border-white/15 shadow-lg flex flex-col space-y-3 relative overflow-hidden transition-all duration-300 hover:border-[#f1cb83]/50 cursor-pointer"
                onClick={() => onOpenApplicantDetail(app)}
              >
                {/* Top Identity Row */}
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-2.5">
                    {/* Avatar tinted by level (§10) */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAvatarEditId(activeAvatarEditId === app.id ? null : app.id);
                      }}
                      className="relative cursor-pointer"
                      title="تنظیم سطح و جنسیت"
                    >
                      <div
                        className="w-11 h-11 rounded-2xl p-[2px] flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${levelStyle.text}, #f1cb83)`,
                          boxShadow: `0 0 12px ${levelStyle.bg}`
                        }}
                      >
                        <div className="w-full h-full rounded-[14px] bg-[#0a1328] flex items-center justify-center">
                          <span
                            className="material-symbols-outlined text-[22px]"
                            style={{ color: levelStyle.text }}
                          >
                            {app.gender === 'خانم' ? 'face_3' : 'person'}
                          </span>
                        </div>
                      </div>
                      <span
                        className="absolute -bottom-1 -left-1 px-1 py-[1px] rounded bg-[#0a1328] border text-[8px] font-bold"
                        style={{ color: levelStyle.text, borderColor: levelStyle.border }}
                      >
                        {app.creditLevel}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-100">{app.fullName}</h2>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f1cb83]/15 text-[#f1cb83] border border-[#f1cb83]/25 font-semibold">
                          مشتری
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-sky-300 font-mono text-[10px]">
                          {app.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-[#f1cb83] flex items-center gap-1 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#f1cb83] animate-pulse" />
                          {app.followUpStatus}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono" dir="ltr">{app.phone}</span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={`tel:${app.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="تماس"
                    className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#d4b06a] to-[#f1cb83] text-[#070d1a] flex items-center justify-center shadow-md active:scale-95 transition-all shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">call</span>
                  </a>
                </div>

                {/* Overdue Warning Card Banner if urgent (§10) */}
                {isOverdue && (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-[18px] animate-bounce">warning</span>
                      <span>پیگیری عقب‌افتاده (موعد: {app.nextFollowUpDate || 'امروز'})</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onScheduleUrgentCall(app);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-[11px] shadow-sm active:scale-95 transition-all"
                    >
                      برنامه‌ریزی تماس فوری
                    </button>
                  </div>
                )}

                {/* Request Summary Grid (§10) */}
                <div className="p-2.5 rounded-xl bg-[#091224]/80 border border-white/10 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-[#f1cb83]">location_on</span>
                      موقعیت ملک
                    </span>
                    <span className="text-xs font-semibold text-slate-100 mt-0.5">
                      {app.primaryCity}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-[#f1cb83]">description</span>
                      نوع سند درخواستی
                    </span>
                    <span className="text-xs font-semibold text-slate-100 mt-0.5 truncate">
                      {app.deedTypes?.join('، ') || 'تک‌برگ عرصه'}
                    </span>
                  </div>
                  <div className="flex flex-col pt-1.5 border-t border-white/5">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-[#f1cb83]">straighten</span>
                      متراژ مدنظر
                    </span>
                    <span className="text-xs font-bold text-slate-100 mt-0.5">
                      {toPersianDigits(app.minArea)} تا {toPersianDigits(app.maxArea)} متر
                    </span>
                  </div>
                  <div className="flex flex-col pt-1.5 border-t border-white/5">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-[#f1cb83]">payments</span>
                      سقف بودجه نقدی
                    </span>
                    <span className="text-xs font-bold text-[#f1cb83] mt-0.5">
                      تا {formatWithCommas(app.maxBudget / 1000000000)} میلیارد تومان
                    </span>
                  </div>
                </div>

                {/* Matched Files Box (§10) */}
                {matches.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#0a152d]/90 border border-[#f1cb83]/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">verified</span>
                        <span className="text-xs font-bold text-slate-100">
                          {toPersianDigits(matches.length)} فایل منطبق پیدا شد
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#f1cb83]/20 border border-[#f1cb83]/40 text-[#f1cb83] text-[10px] font-bold">
                        تطبیق {toPersianDigits(matches[0].percentage)}٪
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {matches.slice(0, 2).map((m, idx) => (
                        <div
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPropertyDetail(m.property);
                          }}
                          className="p-2 rounded-lg bg-[#050d22] border border-white/10 flex items-center justify-between hover:border-[#f1cb83]/50 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-[#f1cb83] font-mono text-[10px] font-bold shrink-0">
                              {m.property.code}
                            </span>
                            <span className="text-xs text-slate-200 truncate">
                              {m.property.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[11px] text-[#f1cb83] font-mono">
                              {formatWithCommas(m.property.totalPrice / 1000000000)} م.ت
                            </span>
                            <span className="material-symbols-outlined text-[15px] text-slate-400">arrow_back</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions & Footer (§10) */}
                <div
                  className="flex flex-col gap-1.5 pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onViewMatchedProperties(app)}
                      className="py-2 px-3 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">travel_explore</span>
                      <span>مشاهده {toPersianDigits(matches.length)} فایل منطبق</span>
                    </button>
                    <button
                      onClick={() => onEditApplicant(app)}
                      className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-medium border border-white/10 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit_note</span>
                      <span>ویرایش پرونده</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-slate-400 text-[11px] px-1 pt-1">
                    <span>آخرین تماس: {app.lastContactDate || 'ثبت تازه'}</span>
                    <span className="text-[#f1cb83] font-medium">موعد پیگیری: {app.nextFollowUpDate || 'تعیین نشده'}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
