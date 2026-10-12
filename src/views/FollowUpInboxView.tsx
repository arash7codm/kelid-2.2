import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ReminderTask, Property } from '../types';
import { formatJalaliWithWeekday, toPersianDigits } from '../utils/jalali';
import { openMapChooser } from '../components/MapAppChooserModal';
import { resolveBlobUrl, preloadAllBlobs } from '../db';

interface FollowUpInboxViewProps {
  reminders: ReminderTask[];
  properties: Property[];
  onCompleteReminder: (id: string) => void;
  onSnoozeReminder: (id: string) => void;
  onRenewReminder?: (reminder: ReminderTask) => void;
  onDeleteReminder?: (id: string) => void;
  onStartVoiceReminder: () => void;
  onOpenCalendar: () => void;
  onBack: () => void;
  onOpenPropertyCode?: (code: string) => void;
  onOpenPerson?: (personCode?: string, personName?: string) => void;
  tarhHadiNeedsCalibration?: boolean;
  onOpenTarhHadiSettings?: () => void;
  onConfirmDefaultTarhHadi?: () => void;
}

const InboxAudioPlayer: React.FC<{ audioRefOrUrl: string }> = ({ audioRefOrUrl }) => {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const src = resolveBlobUrl(audioRefOrUrl);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
  }, [src]);

  if (!src) return null;

  const formatSec = (s: number) => {
    if (!s || !Number.isFinite(s) || s < 0) return toPersianDigits('00:00');
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return toPersianDigits(
      `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`
    );
  };

  return (
    <div className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-[#091224]/90 border border-[#f1cb83]/30">
      <audio
        ref={audioElRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime || 0);
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        className="hidden"
      />
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={() => {
            const el = audioElRef.current;
            if (!el) return;
            if (playing) {
              el.pause();
            } else {
              el.play().catch(() => {});
            }
          }}
          aria-label={playing ? 'توقف پخش صدای یادآور' : 'پخش صدای یادآور'}
          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] flex items-center justify-center shrink-0 shadow-md active:scale-95 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">
            {playing ? 'pause' : 'play_arrow'}
          </span>
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-[#f1cb83] truncate">
              پخش صدای ضبط‌شده یادآور
            </span>
            <span className="font-mono text-[10px] text-slate-400 shrink-0" dir="ltr">
              {formatSec(currentTime)}
              {duration > 0 ? ` / ${formatSec(duration)}` : ''}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-[#f1cb83] to-[#d4b06a] rounded-full transition-all duration-150"
              style={{
                width: `${
                  duration > 0
                    ? Math.min(100, Math.round((currentTime / duration) * 100))
                    : playing
                    ? 55
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const FollowUpInboxView: React.FC<FollowUpInboxViewProps> = ({
  reminders,
  properties,
  onCompleteReminder,
  onSnoozeReminder,
  onRenewReminder,
  onDeleteReminder,
  onStartVoiceReminder,
  onOpenCalendar,
  onBack,
  onOpenPropertyCode,
  onOpenPerson,
  tarhHadiNeedsCalibration,
  onOpenTarhHadiSettings,
  onConfirmDefaultTarhHadi,
}) => {
  const [activeFilter, setActiveFilter] = useState<
    'today' | 'urgent' | 'calls' | 'visits' | 'done'
  >('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeleteReminder, setPendingDeleteReminder] =
    useState<ReminderTask | null>(null);
  const [, setBlobTick] = useState(0);

  useEffect(() => {
    preloadAllBlobs().then(() => setBlobTick((t) => t + 1));
  }, [reminders.length]);

  const totalCount = reminders.length;
  const urgentCount =
    reminders.filter(
      (r) => r.status === 'pending' && r.priority === 'فوری و بحرانی'
    ).length + (tarhHadiNeedsCalibration ? 1 : 0);
  const callsAndVisitsCount = reminders.filter(
    (r) => r.category === 'بازدید حضوری' || r.category === 'تماس تلفنی'
  ).length;
  const completedCount = reminders.filter(
    (r) => r.status === 'completed'
  ).length;

  const filteredReminders = useMemo(() => {
    let list = [...reminders];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.linkedPropertyCode &&
            r.linkedPropertyCode.toLowerCase().includes(q)) ||
          (r.linkedPersonName &&
            r.linkedPersonName.toLowerCase().includes(q)) ||
          r.category.toLowerCase().includes(q)
      );
    }
    if (activeFilter === 'urgent') {
      list = list.filter((r) => r.priority === 'فوری و بحرانی');
    } else if (activeFilter === 'calls') {
      list = list.filter((r) => r.category === 'تماس تلفنی');
    } else if (activeFilter === 'visits') {
      list = list.filter((r) => r.category === 'بازدید حضوری');
    } else if (activeFilter === 'done') {
      list = list.filter((r) => r.status === 'completed');
    }
    return list;
  }, [reminders, searchQuery, activeFilter]);

  const getReminderCoords = (
    rem: ReminderTask
  ): { lat: number; lng: number; title: string } | null => {
    if (rem.linkedPropertyId || rem.linkedPropertyCode) {
      const codeNorm = rem.linkedPropertyCode?.trim().toLowerCase();
      const matchedProp = properties.find(
        (p) =>
          !p.deleted &&
          ((rem.linkedPropertyId && p.id === rem.linkedPropertyId) ||
            (codeNorm && p.code.trim().toLowerCase() === codeNorm))
      );
      if (
        matchedProp?.coordinates &&
        typeof matchedProp.coordinates.lat === 'number' &&
        typeof matchedProp.coordinates.lng === 'number' &&
        !Number.isNaN(matchedProp.coordinates.lat) &&
        !Number.isNaN(matchedProp.coordinates.lng)
      ) {
        return {
          lat: matchedProp.coordinates.lat,
          lng: matchedProp.coordinates.lng,
          title:
            matchedProp.title || rem.title || `پرونده ${matchedProp.code}`,
        };
      }
    }
    const directCoords = (rem as any).coordinates;
    if (
      directCoords &&
      typeof directCoords.lat === 'number' &&
      typeof directCoords.lng === 'number' &&
      !Number.isNaN(directCoords.lat) &&
      !Number.isNaN(directCoords.lng)
    ) {
      return {
        lat: directCoords.lat,
        lng: directCoords.lng,
        title: rem.title || 'موقعیت یادآور',
      };
    }
    return null;
  };

  return (
    <div className="flex flex-col w-full pb-28 text-right space-y-4 pt-1">
      {/* Top Header & Search Card */}
      <div className="p-4 rounded-2xl glass-panel border border-[#f1cb83]/25 shadow-lg space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              aria-label="بازگشت"
              className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">
                arrow_forward
              </span>
            </button>
            <div>
              <h1 className="text-base font-bold text-[#f1cb83]">
                کارتابل پیگیری‌ها و اعلان‌ها
              </h1>
              <p className="text-[11px] text-slate-400">
                {formatJalaliWithWeekday()} • {toPersianDigits(urgentCount)}{' '}
                پیگیری و اعلان فعال
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onStartVoiceReminder}
              className="min-h-[44px] px-3.5 rounded-full bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                add_circle
              </span>
              <span>ثبت یادآور</span>
            </button>
          </div>
        </div>

        <div className="flex items-center bg-[#091224]/80 border border-white/10 rounded-xl px-3 py-2 shadow-inner">
          <span className="material-symbols-outlined text-[#f1cb83] text-[20px] ml-2">
            search
          </span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در نام متقاضی، شماره فایل، همکار..."
            className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-400 outline-none"
            type="text"
          />
          <button
            onClick={onStartVoiceReminder}
            className="w-9 h-9 rounded-lg bg-white/5 text-[#f1cb83] flex items-center justify-center hover:bg-[#f1cb83]/20 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">mic</span>
          </button>
        </div>
      </div>

      {/* System Notice Card for Kelarabad Tarh Hadi Calibration */}
      {tarhHadiNeedsCalibration && (
        <div className="p-4 rounded-2xl bg-gradient-to-b from-[#1a1033]/95 to-[#0a1328]/95 border border-[#f1cb83]/50 shadow-xl space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-[#f1cb83] border border-[#f1cb83]/40 text-xs font-extrabold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">
                layers
              </span>
              <span>اعلان سیستمی • طرح هادی کلارآباد</span>
            </span>
            <span className="text-[11px] text-amber-300 font-bold">
              نیازمند بررسی کالیبراسیون
            </span>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-[#f1cb83]">
              کالیبراسیون و تنظیم نقاط مرجع نقشه طرح هادی کلارآباد
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              نقشه کاربری اراضی و خط‌چین سرخابی محدوده پیشنهادی کلارآباد با نقاط
              مرجع پیش‌فرض آماده است. جهت دقت حداکثری در استعلام موقعیت املاک،
              نقاط مرجع نقشه را در بخش تنظیمات بررسی و تایید فرمایید.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            {onOpenTarhHadiSettings && (
              <button
                type="button"
                onClick={onOpenTarhHadiSettings}
                className="gold-cta-sheen flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">
                  settings
                </span>
                <span>ورود به تنظیمات طرح هادی کلارآباد</span>
              </button>
            )}
            {onConfirmDefaultTarhHadi && (
              <button
                type="button"
                onClick={onConfirmDefaultTarhHadi}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] text-emerald-400">
                  check_circle
                </span>
                <span>تایید کالیبراسیون پیش‌فرض</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI Summary Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div
          onClick={() => setActiveFilter('today')}
          className={`p-3 rounded-xl glass-panel flex items-center justify-between cursor-pointer ${
            activeFilter === 'today' ? 'border-[#f1cb83]' : ''
          }`}
        >
          <div className="flex flex-col">
            <span className="text-[11px] text-slate-400 font-medium">
              کل وظایف امروز
            </span>
            <span className="text-xl font-bold text-slate-100 mt-0.5 font-mono">
              {toPersianDigits(totalCount)}{' '}
              <span className="text-xs font-normal">مورد</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-sky-400">
            <span className="material-symbols-outlined text-[20px]">
              calendar_today
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveFilter('urgent')}
          className={`p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between cursor-pointer ${
            activeFilter === 'urgent'
              ? 'border-rose-400 ring-1 ring-rose-400'
              : ''
          }`}
        >
          <div className="flex flex-col">
            <span className="text-[11px] text-rose-300 font-medium">
              عقب‌افتاده و فوری
            </span>
            <span className="text-xl font-bold text-rose-400 mt-0.5 font-mono">
              {toPersianDigits(urgentCount)}{' '}
              <span className="text-xs font-normal">مورد</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400">
            <span className="material-symbols-outlined text-[20px]">
              notification_important
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveFilter('visits')}
          className={`p-3 rounded-xl glass-panel flex items-center justify-between cursor-pointer ${
            activeFilter === 'visits' ? 'border-[#f1cb83]' : ''
          }`}
        >
          <div className="flex flex-col">
            <span className="text-[11px] text-slate-400 font-medium">
              تماس و بازدید
            </span>
            <span className="text-xl font-bold text-[#f1cb83] mt-0.5 font-mono">
              {toPersianDigits(callsAndVisitsCount)}{' '}
              <span className="text-xs font-normal">مورد</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#f1cb83]/15 flex items-center justify-center text-[#f1cb83]">
            <span className="material-symbols-outlined text-[20px]">
              phone_in_talk
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveFilter('done')}
          className={`p-3 rounded-xl glass-panel flex items-center justify-between cursor-pointer ${
            activeFilter === 'done' ? 'border-emerald-400' : ''
          }`}
        >
          <div className="flex flex-col">
            <span className="text-[11px] text-slate-400 font-medium">
              تکمیل‌شده‌ها
            </span>
            <span className="text-xl font-bold text-emerald-400 mt-0.5 font-mono">
              {toPersianDigits(completedCount)}{' '}
              <span className="text-xs font-normal">مورد</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
            <span className="material-symbols-outlined text-[20px]">
              task_alt
            </span>
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'today', label: `همه (${toPersianDigits(totalCount)})` },
          { id: 'urgent', label: `🔥 فوری (${toPersianDigits(urgentCount)})` },
          { id: 'calls', label: '📞 تماس‌ها' },
          { id: 'visits', label: '🏡 بازدید حضوری' },
          { id: 'done', label: `✓ انجام شده (${toPersianDigits(completedCount)})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id as any)}
            className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
              activeFilter === tab.id
                ? 'bg-[#f1cb83] text-[#070d1a] font-bold shadow-md'
                : 'bg-white/5 text-slate-300 border border-white/10 hover:border-[#f1cb83]/40'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <button
          onClick={onOpenCalendar}
          className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[#f1cb83] text-[11px] whitespace-nowrap cursor-pointer"
        >
          تقویم ماه
        </button>
      </div>

      {/* Reminder Cards List */}
      <div className="space-y-3.5">
        {filteredReminders.length === 0 ? (
          <div className="p-8 rounded-2xl glass-panel text-center text-xs text-slate-400 space-y-3">
            <span className="material-symbols-outlined text-4xl text-[#f1cb83]/50">
              done_all
            </span>
            <p>وظیفه‌ای برای این دسته‌بندی وجود ندارد.</p>
            <button
              onClick={onStartVoiceReminder}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#f1cb83] text-[#070d1a] font-bold text-xs cursor-pointer"
            >
              ثبت یادآور جدید
            </button>
          </div>
        ) : (
          filteredReminders.map((rem) => {
            const isDone = rem.status === 'completed';
            const isUrgent = rem.priority === 'فوری و بحرانی';
            const loc = getReminderCoords(rem);

            return (
              <div
                key={rem.id}
                className={`rounded-2xl p-4 glass-panel border transition-all space-y-2.5 ${
                  isDone
                    ? 'border-emerald-500/30 opacity-75'
                    : isUrgent
                    ? 'border-rose-500/40 bg-gradient-to-b from-rose-950/20 to-[#0a1328]'
                    : 'border-[#f1cb83]/30'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      isUrgent
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-[#f1cb83]/20 text-[#f1cb83] border border-[#f1cb83]/30'
                    }`}
                  >
                    {rem.category} • {rem.priority}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {rem.dateJalali} • {rem.timeStr}
                  </span>
                </div>

                <div className="py-1 space-y-2">
                  <h3
                    className={`text-sm font-bold text-slate-100 ${
                      isDone ? 'line-through' : ''
                    }`}
                  >
                    {rem.title}
                  </h3>
                  {rem.transcript && rem.transcript !== rem.title && (
                    <p className="text-xs text-slate-300 leading-relaxed bg-[#091224]/80 p-2.5 rounded-xl border border-white/5">
                      {rem.transcript}
                    </p>
                  )}

                  {/* Playable Voice Note inside Reminder Card */}
                  {rem.audioBlobUrl && (
                    <InboxAudioPlayer audioRefOrUrl={rem.audioBlobUrl} />
                  )}
                </div>

                {(rem.linkedPropertyCode ||
                  rem.linkedPersonName ||
                  rem.linkedPersonPhone) && (
                  <div className="flex items-center flex-wrap gap-2 py-1 text-xs">
                    {rem.linkedPropertyCode && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPropertyCode?.(rem.linkedPropertyCode!)
                        }
                        className="px-2.5 py-1 rounded-lg bg-white/5 text-[#f1cb83] border border-white/10 hover:border-[#f1cb83]/50 font-mono font-bold cursor-pointer"
                      >
                        پرونده {rem.linkedPropertyCode}
                      </button>
                    )}

                    {rem.linkedPersonName && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPerson?.(
                            rem.linkedPersonCode,
                            rem.linkedPersonName
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-200 flex items-center gap-1 ${
                          onOpenPerson
                            ? 'hover:border-sky-400/50 hover:text-sky-300 cursor-pointer'
                            : ''
                        }`}
                      >
                        <span>
                          مخاطب: {rem.linkedPersonName}{' '}
                          {rem.linkedPersonCode
                            ? `(${rem.linkedPersonCode})`
                            : ''}
                        </span>
                      </button>
                    )}

                    {rem.linkedPersonPhone && (
                      <a
                        href={`tel:${rem.linkedPersonPhone}`}
                        className="mr-auto px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/35 text-rose-300 font-bold text-[11px] flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          call
                        </span>
                        <span>تماس</span>
                      </a>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1.5 sm:gap-2 pt-2.5 mt-1 border-t border-white/10 w-full">
                  {loc && (
                    <button
                      type="button"
                      onClick={() =>
                        openMapChooser(loc.lat, loc.lng, { title: loc.title })
                      }
                      className="flex-1 min-w-0 h-11 min-h-[44px] px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sky-300 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px] shrink-0">
                        map
                      </span>
                      <span className="truncate">مسیریابی</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      onRenewReminder
                        ? onRenewReminder(rem)
                        : onSnoozeReminder(rem.id)
                    }
                    className="flex-1 min-w-0 h-11 min-h-[44px] px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap active:scale-95 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#f1cb83] shrink-0">
                      update
                    </span>
                    <span className="truncate">تمدید</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onCompleteReminder(rem.id)}
                    className={`flex-1 min-w-0 h-11 min-h-[44px] px-2 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap active:scale-95 transition-all cursor-pointer ${
                      isDone
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-white/5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px] shrink-0">
                      {isDone ? 'check_circle' : 'check'}
                    </span>
                    <span className="truncate">
                      {isDone ? 'تکمیل شد' : 'ثبت نتیجه'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPendingDeleteReminder(rem)}
                    aria-label="حذف یادآور"
                    title="حذف یادآور"
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/35 text-rose-400 hover:text-rose-300 flex items-center justify-center shrink-0 active:scale-95 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      delete
                    </span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Assistant Card */}
      <div className="p-4 rounded-2xl glass-panel border border-[#f1cb83]/30 space-y-3">
        <div className="flex items-center gap-2 text-[#f1cb83] font-bold text-sm">
          <span className="material-symbols-outlined text-[20px]">
            auto_awesome
          </span>
          <span>دستیار هوشمند پیگیری و یادآور</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          با ضبط صدای خود یا نوشتن خلاصه مکالمه، هوش مصنوعی کلید تاریخ بعدی، تماس
          با مالک و پیگیری‌ها را خودکار استخراج می‌کند.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onStartVoiceReminder}
            className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">mic</span>
            <span>ضبط یادداشت صوتی</span>
          </button>
          <button
            onClick={onStartVoiceReminder}
            className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-xs font-semibold cursor-pointer"
          >
            تایپ سریع
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {pendingDeleteReminder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setPendingDeleteReminder(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl glass-panel p-6 border border-rose-500/45 shadow-2xl text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">
                delete_forever
              </span>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-100">
                {pendingDeleteReminder.title}
              </h3>
              <p className="text-xs text-rose-200 font-semibold leading-relaxed">
                آیا از حذف این یادآور مطمئن هستید؟ این عمل قابل بازگشت نیست.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  const id = pendingDeleteReminder.id;
                  setPendingDeleteReminder(null);
                  onDeleteReminder?.(id);
                }}
                className="min-h-[44px] py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                حذف
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteReminder(null)}
                className="min-h-[44px] py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
