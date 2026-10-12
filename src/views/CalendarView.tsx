import React, { useState } from 'react';
import { ReminderTask } from '../types';
import {
  getTodayJalali,
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAY_NAMES,
  toPersianDigits,
  OFFICIAL_HOLIDAYS_1405,
  jalaliToGregorian,
  gregorianToJalali
} from '../utils/jalali';

interface CalendarViewProps {
  reminders: ReminderTask[];
  onOpenReminder: (reminder: ReminderTask) => void;
  onNewReminderDate: (jalaliDate: string) => void;
  onBack: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  reminders,
  onOpenReminder,
  onNewReminderDate,
  onBack,
}) => {
  const today = getTodayJalali();
  const [currentYear, setCurrentYear] = useState(today.year);
  const [currentMonth, setCurrentMonth] = useState(today.month);
  const [selectedDay, setSelectedDay] = useState<number>(today.day);

  // Month days count (months 1-6 have 31 days, 7-11 have 30, 12 has 29/30)
  const daysInMonth = currentMonth <= 6 ? 31 : currentMonth <= 11 ? 30 : 29;

  // Day of week of the first day of the month
  const [firstGy, firstGm, firstGd] = jalaliToGregorian(currentYear, currentMonth, 1);
  const firstDate = new Date(firstGy, firstGm - 1, firstGd);
  // Saturday = 0, Sunday = 1, ..., Friday = 6
  const startDayIndex = (firstDate.getDay() + 1) % 7;

  // Next / Prev Month
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Selected date formatted
  const selectedDateFormatted = `${toPersianDigits(currentYear)}/${toPersianDigits(currentMonth < 10 ? '0' + currentMonth : currentMonth)}/${toPersianDigits(selectedDay < 10 ? '0' + selectedDay : selectedDay)}`;

  // Reminders for the selected day
  const dayReminders = reminders.filter(r => r.dateJalali && r.dateJalali.includes(toPersianDigits(selectedDay)));

  // Export .ics calendar file (§18, §23)
  const handleExportIcs = () => {
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kelid Real Estate CRM//FA',
      'CALSCALE:GREGORIAN',
      ...reminders.map((r, i) => `BEGIN:VEVENT\nUID:kelid_${i}_${Date.now()}@kelid.app\nSUMMARY:${r.title}\nDESCRIPTION:${r.category} - ${r.linkedPersonName || ''}\nSTATUS:CONFIRMED\nEND:VEVENT`),
      'END:VCALENDAR'
    ];
    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kelid-calendar-${currentYear}-${currentMonth}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('فایل تقویم (.ics) دانلود شد و در تقویم گوشی قابل بازگشایی است ✓');
  };

  return (
    <div className="flex flex-col w-full pb-28 text-right space-y-4 pt-1">
      {/* 1. Header */}
      <div className="p-4 rounded-2xl glass-panel border border-[#f1cb83]/30 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              aria-label="بازگشت"
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <div>
              <h1 className="text-base font-bold text-[#f1cb83]">تقویم شمسی پیگیری‌ها</h1>
              <p className="text-[11px] text-slate-400">هفته‌شمار املاک و رویدادهای کاری</p>
            </div>
          </div>

          <button
            onClick={handleExportIcs}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-[#f1cb83]/30 text-[#f1cb83] text-xs font-bold hover:bg-[#f1cb83]/10"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>خروجی .ics</span>
          </button>
        </div>

        {/* Month Selector */}
        <div className="flex items-center justify-between px-2">
          <button
            onClick={handlePrevMonth}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[#f1cb83]"
          >
            ›
          </button>
          <div className="text-sm font-bold text-slate-100 font-mono">
            {JALALI_MONTH_NAMES[currentMonth - 1]} {toPersianDigits(currentYear)}
          </div>
          <button
            onClick={handleNextMonth}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[#f1cb83]"
          >
            ‹
          </button>
        </div>

        {/* Weekday headers (Starts Saturday per §18) */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 py-1 border-t border-b border-white/5">
          {JALALI_WEEKDAY_NAMES.map(w => (
            <div key={w} className="py-1">
              {w.slice(0, 2)}
            </div>
          ))}
        </div>

        {/* Day Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty prefix slots */}
          {Array.from({ length: startDayIndex }).map((_, i) => (
            <div key={`empty_${i}`} className="h-10" />
          ))}

          {/* Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const isToday = currentYear === today.year && currentMonth === today.month && dayNum === today.day;
            const isSelected = dayNum === selectedDay;

            // Check holidays
            const monthDayKey = `${currentMonth < 10 ? '0' + currentMonth : currentMonth}/${dayNum < 10 ? '0' + dayNum : dayNum}`;
            const isHoliday = !!OFFICIAL_HOLIDAYS_1405[monthDayKey];

            // Count reminders on this day
            const dayEvents = reminders.filter(r => r.dateJalali && r.dateJalali.includes(toPersianDigits(dayNum)));

            return (
              <button
                key={dayNum}
                onClick={() => setSelectedDay(dayNum)}
                className={`h-11 rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-95 cursor-pointer ${
                  isSelected
                    ? 'bg-[#f1cb83] text-[#070d1a] font-bold shadow-[0_0_12px_rgba(241,203,131,0.5)]'
                    : isToday
                    ? 'bg-[#f1cb83]/20 border border-[#f1cb83] text-[#f1cb83] font-bold'
                    : 'bg-white/5 hover:bg-white/10 text-slate-200'
                }`}
              >
                <span className={`text-xs ${isHoliday && !isSelected ? 'text-rose-400 font-bold' : ''}`}>
                  {toPersianDigits(dayNum)}
                </span>
                {dayEvents.length > 0 && (
                  <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-[#070d1a]' : 'bg-[#f1cb83]'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Selected Day Reminders Sheet (§18) */}
      <div className="p-4 rounded-2xl glass-panel border border-white/15 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[18px]">event</span>
            <h3 className="text-xs font-bold text-slate-100">رویدادهای {selectedDateFormatted}</h3>
          </div>
          <button
            onClick={() => onNewReminderDate(selectedDateFormatted)}
            className="text-xs text-[#f1cb83] font-bold"
          >
            + ثبت یادآور این روز
          </button>
        </div>

        {dayReminders.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            رویداد یا پیگیری‌ای برای این روز ثبت نشده است.
          </div>
        ) : (
          <div className="space-y-2">
            {dayReminders.map(r => (
              <div
                key={r.id}
                onClick={() => onOpenReminder(r)}
                className="p-3 rounded-xl bg-[#091224]/80 border border-white/10 flex items-center justify-between cursor-pointer hover:border-[#f1cb83]/40"
              >
                <div>
                  <span className="text-xs font-bold text-slate-100 block">{r.title}</span>
                  <span className="text-[11px] text-[#f1cb83]">{r.category} • {r.timeStr}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.priority === 'فوری و بحرانی' ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10 text-slate-300'}`}>
                  {r.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
