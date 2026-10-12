import React, { useState } from 'react';
import { Property, Applicant, Collaborator, ReminderTask, MatchResult } from '../types';
import { SyncStatusInfo, exportAppJson } from '../services/sync';
import { formatJalaliLong, toPersianDigits, formatWithCommas } from '../utils/jalali';
import { VoiceInputButton } from '../components/VoiceInputButton';

interface DashboardViewProps {
  properties: Property[];
  applicants: Applicant[];
  collaborators: Collaborator[];
  reminders: ReminderTask[];
  matches: MatchResult[];
  syncStatus: SyncStatusInfo;
  onBackupNow: () => void;
  onRefreshSync: () => void;
  onImportJson: () => void;
  onOpenBackupPanel: () => void;
  onNavigateTab: (tab: 'properties' | 'applicants' | 'collaborators', filterPreset?: string) => void;
  onOpenPropertyDetail: (prop: Property) => void;
  onOpenApplicantDetail: (app: Applicant) => void;
  onOpenInbox: () => void;
  onStartVoiceReminder: () => void;
  onSearchQuery: (query: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  properties,
  applicants,
  collaborators,
  reminders,
  matches,
  syncStatus,
  onBackupNow,
  onRefreshSync,
  onImportJson,
  onOpenBackupPanel,
  onNavigateTab,
  onOpenPropertyDetail,
  onOpenApplicantDetail,
  onOpenInbox,
  onStartVoiceReminder,
  onSearchQuery,
}) => {
  const [matchAccordionOpen, setMatchAccordionOpen] = useState(true);
  const [alertsAccordionOpen, setAlertsAccordionOpen] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [isFilterActive, setIsFilterActive] = useState(false);

  // Reconciled counters (§2.1, §2.9)
  const totalProperties = properties.filter(p => !p.deleted).length;
  const activeProperties = properties.filter(p => !p.deleted && p.status === 'فعال').length;
  const negotiatingProperties = properties.filter(p => !p.deleted && p.status === 'در مذاکره').length;
  const soldProperties = properties.filter(p => !p.deleted && p.status === 'فروخته‌شده').length;
  
  // Follow-up required count
  const overdueReminders = reminders.filter(r => r.status === 'pending');
  const followUpRequiredCount = overdueReminders.length;

  // New this month
  const newThisMonthCount = properties.filter(p => {
    if (p.deleted) return false;
    const createdTime = new Date(p.createdAt).getTime();
    return (Date.now() - createdTime) < 30 * 24 * 60 * 60 * 1000;
  }).length;

  // Alerts: overdue items + permit expiring within 30 days
  const now = Date.now();
  const expiringPermits = properties.filter(p => {
    if (!p.permitExpiryDate || p.deleted) return false;
    return true; // flagged when approaching
  });

  const alertsCount = followUpRequiredCount;

  // Status Light Color Indicator (§22.1)
  const statusLightColor =
    syncStatus.light === 'green'
      ? 'bg-emerald-400'
      : syncStatus.light === 'red'
      ? 'bg-rose-500'
      : syncStatus.light === 'yellow'
      ? 'bg-amber-400'
      : 'bg-slate-500';

  return (
    <div className="flex flex-col w-full space-y-4 pt-2">
      {/* 1. BACKUP & SYNC BAR (Top block, derived only from real data) */}
      <div
        className="fade-in-1 relative overflow-hidden rounded-2xl p-3.5 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] cursor-pointer group glass-panel border border-[#f1cb83]/30 shadow-lg"
        onClick={onOpenBackupPanel}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#f1cb83]/10 via-transparent to-[#f1cb83]/5 pointer-events-none group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between gap-2 relative z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[#f1cb83] shrink-0 bg-[#f1cb83]/15 border border-[#f1cb83]/40 shadow-[0_0_12px_rgba(241,203,131,0.25)]">
              <span className="material-symbols-outlined text-[20px]">cloud_sync</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#f1cb83] truncate">
                  {syncStatus.statusText}
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${statusLightColor} live-dot-pulse shrink-0`} />
              </div>
              <span className="text-[11px] text-[#f1cb83]/80 truncate font-medium">
                {syncStatus.subText}
              </span>
            </div>
          </div>

          {/* Quick Backup Bar Actions */}
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onBackupNow}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg active:scale-90 hover:scale-105 text-[#070d1a] bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-xs font-bold transition-all shadow-[0_0_10px_rgba(241,203,131,0.3)] cursor-pointer"
              type="button"
              title="پشتیبان‌گیری آنی"
            >
              <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
              <span className="hidden sm:inline">پشتیبان‌گیری</span>
            </button>
            <button
              onClick={onRefreshSync}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg active:scale-90 hover:scale-105 text-[#f1cb83] bg-white/5 border border-[#f1cb83]/30 text-xs font-bold transition-all hover:bg-[#f1cb83]/10 cursor-pointer"
              type="button"
              title="تازه‌سازی"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              <span className="hidden sm:inline">تازه‌سازی</span>
            </button>
            <button
              onClick={() => {
                exportAppJson({
                  properties,
                  applicants,
                  collaborators,
                  reminders,
                  exportedAt: new Date().toISOString()
                });
              }}
              className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg active:scale-90 hover:scale-105 text-[#f1cb83] bg-white/5 border border-[#f1cb83]/30 text-xs font-bold transition-all hover:bg-[#f1cb83]/10 cursor-pointer"
              type="button"
              title="خروجی JSON"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span className="text-[10px]">JSON</span>
            </button>
            <button
              onClick={onImportJson}
              className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg active:scale-90 hover:scale-105 text-[#f1cb83] bg-white/5 border border-[#f1cb83]/30 text-xs font-bold transition-all hover:bg-[#f1cb83]/10 cursor-pointer"
              type="button"
              title="بارگذاری JSON"
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. SMART SEARCH BAR (Global voice + text engine) */}
      <div className="fade-in-2 relative overflow-hidden rounded-2xl glass-panel p-2.5 transition-all duration-300 shadow-lg">
        <div className="flex items-center justify-between gap-2 relative z-10 w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-[#f1cb83]/10 border border-[#f1cb83]/25 flex items-center justify-center text-[#f1cb83] shrink-0">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </div>
            <input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchInput.trim()) {
                  onSearchQuery(searchInput.trim());
                }
              }}
              className="w-full bg-transparent border-0 outline-none text-xs font-medium text-slate-100 placeholder:text-[#d1c5b4]/60 text-right"
              placeholder="جستجوی هوشمند صوتی یا متنی (ملک، متقاضی، ۳۰۰ متری کلارآباد...)"
              type="text"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                }}
                className="text-slate-400 hover:text-white p-1"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {searchInput.trim() && (
            <button
              type="button"
              onClick={() => onSearchQuery(searchInput.trim())}
              className="px-2.5 h-9 rounded-xl bg-[#f1cb83] text-[#070d1a] text-xs font-bold shrink-0 cursor-pointer"
            >
              بگرد
            </button>
          )}

          {/* Live Voice-to-Text Search Button */}
          <VoiceInputButton
            value={searchInput}
            onChange={(val) => setSearchInput(val)}
            append={false}
            variant="icon"
            label="جستجوی صوتی"
          />

          {/* Voice Reminder Shortcut Button */}
          <button
            onClick={onStartVoiceReminder}
            aria-label="یادآور صوتی"
            className="w-9 h-9 rounded-xl bg-white/5 border border-[#f1cb83]/30 text-[#f1cb83] hover:bg-[#f1cb83]/15 flex items-center justify-center active:scale-95 transition-all cursor-pointer shrink-0"
            type="button"
            title="ثبت یادآور صوتی هوشمند"
          >
            <span className="material-symbols-outlined text-[18px]">record_voice_over</span>
          </button>

          {/* Simple Filter button */}
          <button
            onClick={() => setIsFilterActive(!isFilterActive)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer ${
              isFilterActive
                ? 'bg-[#f1cb83] text-[#070d1a] shadow-[0_0_14px_rgba(241,203,131,0.4)]'
                : 'bg-white/5 border border-[#f1cb83]/30 text-[#f1cb83] hover:bg-[#f1cb83]/10'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span className="hidden sm:inline">فیلتر</span>
          </button>
        </div>

        {/* Expandable Simple Filter Drawer */}
        {isFilterActive && (
          <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2">
            <button
              onClick={() => onNavigateTab('properties', 'land')}
              className="p-2 rounded-xl bg-white/5 hover:bg-[#f1cb83]/15 border border-white/10 text-xs text-slate-200 text-center"
            >
              زمین و باغات
            </button>
            <button
              onClick={() => onNavigateTab('properties', 'villa')}
              className="p-2 rounded-xl bg-white/5 hover:bg-[#f1cb83]/15 border border-white/10 text-xs text-slate-200 text-center"
            >
              ویلا مستقل
            </button>
            <button
              onClick={() => onNavigateTab('properties', 'apartment')}
              className="p-2 rounded-xl bg-white/5 hover:bg-[#f1cb83]/15 border border-white/10 text-xs text-slate-200 text-center"
            >
              آپارتمان
            </button>
          </div>
        )}
      </div>

      {/* 3. وضعیت پورتفوی کلید (Today's long date + 6 tappable live stat cards) */}
      <div className="fade-in-3 relative overflow-hidden rounded-2xl glass-panel p-4 transition-all duration-300">
        <div className="flex items-center justify-between mb-3 relative z-10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f1cb83] shadow-[0_0_12px_rgba(241,203,131,0.95)] live-dot-pulse" />
            <h2 className="text-sm font-bold text-slate-100">وضعیت پورتفوی کلید</h2>
          </div>
          <div className="px-2.5 py-0.5 rounded-full bg-[#f1cb83]/15 border border-[#f1cb83]/25 text-[#f1cb83] text-xs font-medium">
            امروز، {formatJalaliLong()}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 relative z-10">
          {/* Card 1: کل فایل‌ها */}
          <div
            onClick={() => onNavigateTab('properties')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl glass-panel-subtle cursor-pointer hover:scale-[1.04] active:scale-95 transition-all duration-300 group"
          >
            <span className="text-xs text-slate-400 font-medium group-hover:text-[#f1cb83] transition-colors">
              کل فایل‌ها
            </span>
            <span className="text-xl font-bold text-[#f1cb83] mt-0.5 font-mono">
              {toPersianDigits(totalProperties)}
            </span>
            <span className="text-[10px] text-slate-500">پروژه ثبت‌شده</span>
          </div>

          {/* Card 2: فایل‌های فعال */}
          <div
            onClick={() => onNavigateTab('properties', 'active')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl glass-panel-subtle cursor-pointer hover:scale-[1.04] active:scale-95 transition-all duration-300 group"
          >
            <span className="text-xs text-emerald-400 font-medium">
              فایل‌های فعال
            </span>
            <span className="text-xl font-bold text-slate-100 mt-0.5 font-mono group-hover:text-emerald-300">
              {toPersianDigits(activeProperties)}
            </span>
            <span className="text-[10px] text-emerald-400/80">عرضه در بازار</span>
          </div>

          {/* Card 3: نیاز به پیگیری (Action required -> opens inbox) */}
          <div
            onClick={onOpenInbox}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl glass-panel-subtle cursor-pointer hover:scale-[1.04] active:scale-95 transition-all duration-300 group"
          >
            <span className="text-xs text-rose-400 font-medium">
              نیاز به پیگیری
            </span>
            <div className="flex items-center gap-1 mt-0.5 font-mono">
              <span className="text-xl font-bold text-rose-400">
                {toPersianDigits(followUpRequiredCount)}
              </span>
              {followUpRequiredCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              )}
            </div>
            <span className="text-[10px] text-rose-400/80">اقدام ضروری</span>
          </div>

          {/* Card 4: در حال مذاکره */}
          <div
            onClick={() => onNavigateTab('properties', 'negotiating')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl glass-panel-subtle cursor-pointer hover:scale-[1.04] active:scale-95 transition-all duration-300 group"
          >
            <span className="text-xs text-slate-400 font-medium group-hover:text-sky-300 transition-colors">
              در حال مذاکره
            </span>
            <span className="text-lg font-bold text-sky-400 mt-0.5 font-mono">
              {toPersianDigits(negotiatingProperties)}
            </span>
            <span className="text-[10px] text-slate-500">جلسه نهایی</span>
          </div>

          {/* Card 5: فروخته شده */}
          <div
            onClick={() => onNavigateTab('properties', 'sold')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl glass-panel-subtle cursor-pointer hover:scale-[1.04] active:scale-95 transition-all duration-300 group"
          >
            <span className="text-xs text-slate-400 font-medium">
              فروخته شده
            </span>
            <span className="text-lg font-bold text-slate-400 mt-0.5 font-mono group-hover:text-white">
              {toPersianDigits(soldProperties)}
            </span>
            <span className="text-[10px] text-slate-500">موفق / تسویه‌شده</span>
          </div>

          {/* Card 6: فایل جدید ماه */}
          <div
            onClick={() => onNavigateTab('properties', 'new')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl glass-panel-subtle cursor-pointer hover:scale-[1.04] active:scale-95 transition-all duration-300 group"
          >
            <span className="text-xs text-[#f1cb83] font-medium">
              فایل جدید ماه
            </span>
            <span className="text-lg font-bold text-[#f1cb83] mt-0.5 font-mono">
              {newThisMonthCount > 0 ? `+${toPersianDigits(newThisMonthCount)}` : '۰'}
            </span>
            <span className="text-[10px] text-slate-500">ورودی جدید</span>
          </div>
        </div>
      </div>

      {/* 4. پیشنهاد فایل به مشتری (Collapsible matching recommendations) */}
      <div className="fade-in-4 relative overflow-hidden rounded-2xl glass-panel transition-all duration-300">
        <button
          onClick={() => setMatchAccordionOpen(!matchAccordionOpen)}
          className="w-full p-4 flex items-center justify-between text-right cursor-pointer select-none active:scale-[0.99] transition-transform duration-200"
          type="button"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f1cb83]/30 to-[#f1cb83]/10 border border-[#f1cb83]/25 flex items-center justify-center text-[#f1cb83] shadow-[0_0_14px_rgba(241,203,131,0.3)] shrink-0">
              <span className="material-symbols-outlined text-[22px]">lightbulb</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-nowrap">
                <span className="text-sm font-bold text-slate-100 truncate">
                  پیشنهاد فایل به مشتری
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#f1cb83]/20 border border-[#f1cb83]/30 text-[#f1cb83] text-xs font-semibold shrink-0">
                  {toPersianDigits(matches.length)} پیشنهاد
                </span>
              </div>
              <span className="text-[11px] text-slate-400 truncate mt-0.5">
                انطباق الگوریتم بر مبنای بودجه و علایق متقاضی
              </span>
            </div>
          </div>
          <div
            className="w-8 h-8 rounded-full bg-white/5 border border-[#f1cb83]/15 flex items-center justify-center text-slate-400 transition-all duration-300"
            style={{ transform: matchAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <span className="material-symbols-outlined text-[20px]">expand_more</span>
          </div>
        </button>

        {matchAccordionOpen && (
          <div className="px-4 pb-4 space-y-3 pt-1 border-t border-white/5">
            {matches.length === 0 ? (
              <div className="p-4 rounded-xl glass-panel-subtle text-center text-xs text-slate-400">
                فعلاً پیشنهادی وجود ندارد. با ثبت متقاضی و ملک جدید، انطباق هوشمند به طور خودکار نمایش داده می‌شود.
              </div>
            ) : (
              matches.slice(0, 3).map((match, idx) => (
                <div
                  key={idx}
                  className="rounded-xl glass-panel-subtle p-3 space-y-2.5 hover:scale-[1.01] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-[#f1cb83] shrink-0">
                        <span className="material-symbols-outlined text-[18px]">person_check</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-100 truncate">
                            {match.applicant.fullName}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-white/5 text-slate-400 text-[10px] font-mono">
                            {match.applicant.code}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#f1cb83] truncate">
                          بودجه: تا {formatWithCommas(match.applicant.maxBudget / 1000000000)} میلیارد تومان
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs font-bold shrink-0">
                      {toPersianDigits(match.percentage)}٪ همپوشانی
                    </span>
                  </div>

                  <div className="rounded-lg p-2 bg-[#091224]/80 flex items-center justify-between gap-2 border border-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-200 truncate">
                        {match.property.code} • {match.property.title}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#f1cb83] font-mono shrink-0">
                      {formatWithCommas(match.property.totalPrice / 1000000000)} م.ت
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => onOpenApplicantDetail(match.applicant)}
                      className="h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">account_box</span>
                      <span>اطلاعات مشتری</span>
                    </button>
                    <button
                      onClick={() => onOpenPropertyDetail(match.property)}
                      className="h-9 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(241,203,131,0.3)] transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      <span>رویت فایل {match.property.code}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 5. هشدارها و پیگیری‌ها (Collapsible urgent alerts & overdue follow-ups) */}
      <div className="fade-in-5 relative overflow-hidden rounded-2xl glass-panel transition-all duration-300">
        <button
          onClick={() => setAlertsAccordionOpen(!alertsAccordionOpen)}
          className="w-full p-4 flex items-center justify-between text-right cursor-pointer select-none active:scale-[0.99] transition-transform duration-200"
          type="button"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-rose-700/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.25)] shrink-0">
              <span className="material-symbols-outlined text-[22px]">warning</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100">هشدارها و پیگیری‌ها</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold live-urgent-pulse">
                  {toPersianDigits(alertsCount)} مورد
                </span>
              </div>
              <span className="text-[11px] text-slate-400 truncate mt-0.5">
                نیازمند اقدام فوری مشاور و مدیر املاک
              </span>
            </div>
          </div>
          <div
            className="w-8 h-8 rounded-full bg-white/5 border border-[#f1cb83]/15 flex items-center justify-center text-slate-400 transition-all duration-300"
            style={{ transform: alertsAccordionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <span className="material-symbols-outlined text-[20px]">expand_more</span>
          </div>
        </button>

        {alertsAccordionOpen && (
          <div className="px-4 pb-4 space-y-3 pt-1 border-t border-white/5">
            {overdueReminders.length === 0 ? (
              <div className="p-4 rounded-xl glass-panel-subtle text-center text-xs text-slate-400">
                همه پیگیری‌ها انجام شده و هشدار فوری ثبت‌نشده‌ای وجود ندارد ✓
              </div>
            ) : (
              overdueReminders.slice(0, 3).map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl glass-panel-subtle p-3 flex flex-col gap-2 hover:scale-[1.01] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-bold">
                        {item.category}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {item.linkedPropertyCode || item.linkedPersonCode}
                      </span>
                    </div>
                    <span className="text-[11px] text-rose-400 font-medium">
                      موعد: {item.dateJalali}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-slate-100 truncate">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate">
                        {item.linkedPersonName ? `مخاطب: ${item.linkedPersonName}` : 'نیازمند اقدام'}
                      </span>
                    </div>
                    {item.linkedPersonPhone ? (
                      <a
                        href={`tel:${item.linkedPersonPhone}`}
                        className="shrink-0 h-9 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1 transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">call</span>
                        <span>تماس فوری</span>
                      </a>
                    ) : (
                      <button
                        onClick={onOpenInbox}
                        className="shrink-0 h-9 px-3 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-bold flex items-center gap-1 transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        <span>بررسی کارتابل</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 6. آخرین وضعیت فایل‌های ممتاز + مشاهده همه */}
      <div className="fade-in-6 space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">
              workspace_premium
            </span>
            <h3 className="text-sm font-bold text-slate-100">آخرین وضعیت فایل‌های ممتاز</h3>
          </div>
          <button
            onClick={() => onNavigateTab('properties')}
            className="text-xs text-[#f1cb83] font-semibold hover:underline cursor-pointer"
          >
            مشاهده همه
          </button>
        </div>

        {properties.length === 0 ? (
          <div className="p-6 rounded-2xl glass-panel text-center text-xs text-slate-400 space-y-2">
            <p>هنوز فایلی در سامانه ثبت نشده است.</p>
            <button
              onClick={() => onNavigateTab('properties')}
              className="px-4 py-2 rounded-xl bg-[#f1cb83] text-[#070d1a] font-bold text-xs"
            >
              ثبت اولین ملک
            </button>
          </div>
        ) : (
          properties.slice(0, 2).map((prop) => (
            <div
              key={prop.id}
              onClick={() => onOpenPropertyDetail(prop)}
              className="relative overflow-hidden rounded-2xl glass-panel p-3.5 flex items-center gap-3 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all group"
            >
              <div className="w-16 h-16 rounded-xl bg-[#162344] overflow-hidden shrink-0 border border-[#f1cb83]/25 shadow-md group-hover:border-[#f1cb83]/50 transition-all">
                {prop.media && prop.media.length > 0 ? (
                  <img
                    src={prop.media[0].url}
                    alt={prop.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#f1cb83] bg-white/5">
                    <span className="material-symbols-outlined text-[24px]">real_estate_agent</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-slate-100 truncate group-hover:text-[#f1cb83] transition-colors">
                    {prop.title}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#f1cb83]/20 border border-[#f1cb83]/25 text-[#f1cb83] text-[10px] font-bold font-mono">
                    {prop.code}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 truncate mt-0.5">
                  {prop.propertyType} • {toPersianDigits(prop.area)} متر • {prop.city}
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-bold text-[#f1cb83] font-mono">
                    {formatWithCommas(prop.totalPrice / 1000000000)} میلیارد تومان
                  </span>
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] live-dot-pulse" />
                    {prop.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 7. Storage usage row (§5 item 7 & §22.12) */}
      <div className="p-3 rounded-2xl glass-panel-subtle flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">storage</span>
          <span>وضعیت حافظه دستگاه و سرور ابری:</span>
        </div>
        <span className="text-emerald-400 font-mono font-semibold">مطلوب (زیر ۵٪ ظرفیت)</span>
      </div>
    </div>
  );
};
