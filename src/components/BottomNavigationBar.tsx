import React, { useEffect, useRef } from 'react';

export type MainTabType = 'dashboard' | 'properties' | 'applicants' | 'collaborators';

interface BottomNavigationBarProps {
  activeTab: MainTabType | null;
  onSelectTab: (tab: MainTabType) => void;
  onOpenQuickAction: () => void;
}

export const BottomNavigationBar: React.FC<BottomNavigationBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenQuickAction,
}) => {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!navRef.current) return;
    const updateNavH = () => {
      if (navRef.current) {
        const h = navRef.current.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--nav-h', `${h}px`);
      }
    };
    updateNavH();
    const observer = new ResizeObserver(updateNavH);
    observer.observe(navRef.current);
    window.addEventListener('resize', updateNavH);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateNavH);
    };
  }, []);

  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 inset-x-0 z-40 pb-safe bg-[#080d1a]/85 backdrop-blur-2xl border-t border-[#f1cb83]/20 shadow-[0_-8px_36px_rgba(0,0,0,0.7)]"
    >
      <div className="h-20 px-3 flex items-center justify-between relative max-w-lg mx-auto">
        {/* Tab 1: داشبورد */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-full min-w-[44px] transition-all duration-300 active:scale-90 cursor-pointer ${
            activeTab === 'dashboard'
              ? 'text-[#f1cb83] scale-105 font-bold drop-shadow-[0_0_10px_rgba(241,203,131,0.55)]'
              : 'text-[#d1c5b4]/70 hover:text-[#f1cb83]'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[24px]">dashboard</span>
          <span className="text-[11px]">داشبورد</span>
        </button>

        {/* Tab 2: ملک‌ها */}
        <button
          onClick={() => onSelectTab('properties')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-full min-w-[44px] transition-all duration-300 active:scale-90 cursor-pointer ${
            activeTab === 'properties'
              ? 'text-[#f1cb83] scale-105 font-bold drop-shadow-[0_0_10px_rgba(241,203,131,0.55)]'
              : 'text-[#d1c5b4]/70 hover:text-[#f1cb83]'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[24px]">real_estate_agent</span>
          <span className="text-[11px]">ملک‌ها</span>
        </button>

        {/* Central Glowing FAB Button with Animated Halo & Golden Aura */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="-top-8 absolute w-16 h-16 pointer-events-none flex items-center justify-center">
            <div className="golden-halo-pulse absolute w-16 h-16 rounded-full border border-[#f1cb83]/50 bg-[#f1cb83]/15 shadow-[0_0_28px_rgba(241,203,131,0.55)]" />
            <div className="golden-ring-spin absolute -inset-1 rounded-full border border-dashed border-[#f1cb83]/30 pointer-events-none" />
            <div className="anim-glow-1 absolute -inset-2 rounded-full bg-[#f1cb83]/20 blur-xl pointer-events-none" />
          </div>
          <button
            onClick={onOpenQuickAction}
            aria-label="دسترسی سریع"
            className="-top-8 absolute w-16 h-16 rounded-full border border-[#f1cb83]/50 backdrop-blur-2xl bg-gradient-to-b from-white/30 via-[#f1cb83]/15 to-[#070d1a] hover:scale-110 active:scale-90 text-[#f1cb83] flex items-center justify-center transition-all duration-300 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.4)] hover:shadow-[0_0_36px_rgba(241,203,131,0.8)] z-10 cursor-pointer group"
            type="button"
          >
            <div className="absolute inset-0 rounded-full pointer-events-none bg-gradient-to-b from-white/25 via-transparent to-[#f1cb83]/10 opacity-80 group-hover:opacity-100 transition-opacity" />
            <span className="material-symbols-outlined text-[32px] font-bold relative z-20 select-none text-[#f1cb83] drop-shadow-[0_0_12px_rgba(241,203,131,0.9)] group-hover:rotate-90 group-hover:scale-110 transition-transform duration-300">
              add
            </span>
          </button>
        </div>

        {/* Tab 3: متقاضیان */}
        <button
          onClick={() => onSelectTab('applicants')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-full min-w-[44px] transition-all duration-300 active:scale-90 cursor-pointer ${
            activeTab === 'applicants'
              ? 'text-[#f1cb83] scale-105 font-bold drop-shadow-[0_0_10px_rgba(241,203,131,0.55)]'
              : 'text-[#d1c5b4]/70 hover:text-[#f1cb83]'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[24px]">group</span>
          <span className="text-[11px]">متقاضیان</span>
        </button>

        {/* Tab 4: همکاران */}
        <button
          onClick={() => onSelectTab('collaborators')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-full min-w-[44px] transition-all duration-300 active:scale-90 cursor-pointer ${
            activeTab === 'collaborators'
              ? 'text-[#f1cb83] scale-105 font-bold drop-shadow-[0_0_10px_rgba(241,203,131,0.55)]'
              : 'text-[#d1c5b4]/70 hover:text-[#f1cb83]'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[24px]">handshake</span>
          <span className="text-[11px]">همکاران</span>
        </button>
      </div>
    </nav>
  );
};
