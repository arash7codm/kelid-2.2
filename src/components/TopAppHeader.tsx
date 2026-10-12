import React, { useEffect, useRef } from 'react';
import { Logo } from './Logo';

interface TopAppHeaderProps {
  overdueCount: number;
  onOpenInbox: () => void;
  onOpenCalendar: () => void;
  onOpenSettings: () => void;
  userRole?: string;
  userName?: string;
}

export const TopAppHeader: React.FC<TopAppHeaderProps> = ({
  overdueCount,
  onOpenInbox,
  onOpenCalendar,
  onOpenSettings,
  userRole = 'مدیر',
  userName = 'مدیر ارشد کلید',
}) => {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!headerRef.current) return;
    const updateHeaderH = () => {
      if (headerRef.current) {
        const h = headerRef.current.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--header-h', `${h}px`);
      }
    };
    updateHeaderH();
    const observer = new ResizeObserver(updateHeaderH);
    observer.observe(headerRef.current);
    window.addEventListener('resize', updateHeaderH);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeaderH);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="fixed top-0 inset-x-0 z-40 pt-safe bg-[#080d1a]/60 backdrop-blur-2xl border-b border-[#f1cb83]/15 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-300"
    >
      <div className="h-16 px-4 flex items-center justify-between max-w-lg mx-auto">
        {/* Right side in RTL: Frameless Transparent Gold Authentic Logo */}
        <div className="flex items-center bg-transparent border-0 p-0 shadow-none">
          <Logo className="h-12 w-auto object-contain drop-shadow-[0_2px_10px_rgba(241,203,131,0.45)] pointer-events-none" />
        </div>

        {/* Center: Manager Role Pill Badge with Live status dot */}
        <div className="flex items-center">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-panel-subtle border border-[#f1cb83]/25 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 live-dot-pulse" />
            <span className="text-[11px] font-bold text-[#f1cb83]">{userRole}</span>
            <span className="text-slate-500 text-[10px]">|</span>
            <span className="text-[11px] font-semibold text-slate-200">{userName}</span>
          </div>
        </div>

        {/* Left side in RTL: Bell & Calendar Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Calendar Button */}
          <button
            onClick={onOpenCalendar}
            aria-label="تقویم شمسی و رویدادها"
            className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 hover:border-[#f1cb83]/40 text-slate-300 hover:text-[#f1cb83] flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">calendar_month</span>
          </button>

          {/* Follow-up Inbox Bell with Overdue Badge */}
          <button
            onClick={onOpenInbox}
            aria-label="کارتابل پیگیری‌ها"
            className="relative w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 hover:border-[#f1cb83]/40 text-slate-300 hover:text-[#f1cb83] flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            {overdueCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-mono font-bold text-[10px] flex items-center justify-center border-2 border-[#070d1a] shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse">
                {overdueCount}
              </span>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            aria-label="تنظیمات سیستم"
            className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 hover:border-[#f1cb83]/40 text-slate-300 hover:text-[#f1cb83] flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
