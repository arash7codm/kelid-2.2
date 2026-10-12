import React from 'react';

interface QuickActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (action: 'new-property' | 'new-applicant' | 'new-collaborator' | 'voice-reminder') => void;
}

export const QuickActionSheet: React.FC<QuickActionSheetProps> = ({
  isOpen,
  onClose,
  onSelectAction
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#050a16]/75 backdrop-blur-xl transition-all duration-400 flex flex-col justify-end pb-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-auto glass-panel rounded-2xl p-4 flex flex-col gap-4 relative overflow-hidden shadow-2xl border border-[#f1cb83]/30"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'rgba(12, 17, 28, 0.88)' }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#f1cb83]/20 pb-3 relative z-20">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 live-dot-pulse"></span>
            <span className="text-sm font-bold text-white tracking-wide drop-shadow-sm">
              دسترسی سریع و ثبت اطلاعات
            </span>
          </div>
          <button
            aria-label="بستن منو"
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/20 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-all cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* 4 Cards Grid (2x2 Layout with Raised 3D Glass) */}
        <div className="grid grid-cols-2 gap-3 relative z-10">
          {/* Card 1: Top-Right (ثبت ملک) */}
          <div
            className="p-3.5 rounded-2xl bg-gradient-to-br from-[#f1cb83]/15 via-[#0e121e]/95 to-black/80 border border-[#f1cb83]/40 cursor-pointer flex flex-col items-center text-center group hover:scale-105 active:scale-95 transition-all shadow-lg relative overflow-hidden"
            onClick={() => {
              onClose();
              onSelectAction('new-property');
            }}
          >
            <div className="card-mist-layer" />
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#f1cb83]/25 to-[#f1cb83]/10 border border-[#f1cb83]/50 flex items-center justify-center text-[#f1cb83] mb-2.5 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[30px] drop-shadow-[0_0_10px_rgba(241,203,131,0.9)]">
                real_estate_agent
              </span>
            </div>
            <span className="text-[14px] font-bold text-white group-hover:text-[#f1cb83] transition-colors">
              ثبت ملک
            </span>
            <span className="text-[11px] text-slate-300 mt-0.5 font-medium">
              فروش، رهن و اجاره
            </span>
          </div>

          {/* Card 2: Top-Left (ثبت متقاضی جدید) */}
          <div
            className="p-3.5 rounded-2xl bg-gradient-to-br from-[#38bdf8]/15 via-[#0e121e]/95 to-black/80 border border-[#38bdf8]/40 cursor-pointer flex flex-col items-center text-center group hover:scale-105 active:scale-95 transition-all shadow-lg relative overflow-hidden"
            onClick={() => {
              onClose();
              onSelectAction('new-applicant');
            }}
          >
            <div className="card-mist-layer" style={{ animationDelay: '0.25s' }} />
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-sky-400/25 to-sky-500/10 border border-sky-400/50 flex items-center justify-center text-sky-400 mb-2.5 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[30px] drop-shadow-[0_0_10px_rgba(56,189,248,0.9)]">
                person_add
              </span>
            </div>
            <span className="text-[14px] font-bold text-white group-hover:text-sky-300 transition-colors">
              ثبت متقاضی جدید
            </span>
            <span className="text-[11px] text-slate-300 mt-0.5 font-medium">
              خریدار یا مستاجر
            </span>
          </div>

          {/* Card 3: Bottom-Right (ثبت همکار جدید) */}
          <div
            className="p-3.5 rounded-2xl bg-gradient-to-br from-[#34d399]/15 via-[#0e121e]/95 to-black/80 border border-[#34d399]/40 cursor-pointer flex flex-col items-center text-center group hover:scale-105 active:scale-95 transition-all shadow-lg relative overflow-hidden"
            onClick={() => {
              onClose();
              onSelectAction('new-collaborator');
            }}
          >
            <div className="card-mist-layer" style={{ animationDelay: '0.5s' }} />
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-emerald-400/25 to-emerald-500/10 border border-emerald-400/50 flex items-center justify-center text-emerald-400 mb-2.5 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[30px] drop-shadow-[0_0_10px_rgba(52,211,153,0.9)]">
                handshake
              </span>
            </div>
            <span className="text-[14px] font-bold text-white group-hover:text-emerald-300 transition-colors">
              ثبت همکار جدید
            </span>
            <span className="text-[11px] text-slate-300 mt-0.5 font-medium">
              مشاور و آژانس همکار
            </span>
          </div>

          {/* Card 4: Bottom-Left (یادآوری صوتی) */}
          <div
            className="p-3.5 rounded-2xl bg-gradient-to-br from-[#f59e0b]/15 via-[#0e121e]/95 to-black/80 border border-[#f59e0b]/40 cursor-pointer flex flex-col items-center text-center group hover:scale-105 active:scale-95 transition-all shadow-lg relative overflow-hidden"
            onClick={() => {
              onClose();
              onSelectAction('voice-reminder');
            }}
          >
            <div className="card-mist-layer" style={{ animationDelay: '0.75s' }} />
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-amber-400/25 to-amber-500/10 border border-amber-400/50 flex items-center justify-center text-amber-400 mb-2.5 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[30px] drop-shadow-[0_0_10px_rgba(245,158,11,0.9)]">
                mic
              </span>
            </div>
            <span className="text-[14px] font-bold text-white group-hover:text-amber-300 transition-colors">
              یادآوری صوتی
            </span>
            <span className="text-[11px] text-slate-300 mt-0.5 font-medium">
              استخراج خودکار با AI
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
