import React, { useState } from 'react';
import { formatPriceInWords, toPersianDigits, parseTomanNumber, formatWithCommas } from '../utils/jalali';

export interface ApplicantFilterValues {
  minArea: number;
  maxArea: number;
  minBudget: number;
  maxBudget: number;
}

interface ApplicantFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: ApplicantFilterValues;
  onApplyFilters: (newFilters: ApplicantFilterValues) => void;
  onResetFilters: () => void;
  matchCount: number;
}

export const ApplicantFilterDrawer: React.FC<ApplicantFilterDrawerProps> = ({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
  matchCount,
}) => {
  const [localFilters, setLocalFilters] = useState<ApplicantFilterValues>(filters);

  if (!isOpen) return null;

  return (
    <div className="relative w-full mb-4 transition-all duration-300">
      <div className="relative rounded-3xl bg-gradient-to-br from-white/[0.09] via-[#0b1428]/95 to-black/80 p-4 border border-[#f1cb83]/35 shadow-[0_16px_48px_rgba(0,0,0,0.65)] backdrop-blur-2xl flex flex-col gap-4 text-right">
        {/* Header (§13) */}
        <div className="flex items-center justify-between pb-3 border-b border-[#f1cb83]/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#f1cb83]/20 flex items-center justify-center text-[#f1cb83] shadow-[0_0_14px_rgba(241,203,131,0.3)] border border-[#f1cb83]/30">
              <span className="material-symbols-outlined text-[20px]">filter_list</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">فیلتر متقاضیان</h3>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                onResetFilters();
                setLocalFilters({
                  minArea: 0,
                  maxArea: 10000,
                  minBudget: 0,
                  maxBudget: 100000000000
                });
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-[#f1cb83]/20 hover:text-[#f1cb83] text-slate-300 transition-all text-xs border border-[#f1cb83]/20 active:scale-90"
              type="button"
            >
              <span className="material-symbols-outlined text-[14px]">restart_alt</span>
              <span>بازنشانی</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 flex items-center justify-center text-slate-300 hover:text-white transition-all"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* 1. Area Range */}
        <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.03] p-3 border border-[#f1cb83]/20 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#f1cb83] text-[16px]">straighten</span>
              <span>محدوده متراژ درخواستی (متر مربع)</span>
            </span>
            <span className="text-[10px] text-[#f1cb83] font-medium">
              از {toPersianDigits(localFilters.minArea)} تا {toPersianDigits(localFilters.maxArea)} متر
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 bg-[#091224]/70 rounded-xl px-3 py-2 border border-white/10">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs text-slate-400 whitespace-nowrap">از:</span>
              <input
                type="number"
                value={localFilters.minArea || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, minArea: parseInt(e.target.value, 10) || 0 })}
                placeholder="حداقل"
                className="w-full bg-transparent text-center font-bold text-[#f1cb83] text-xs outline-none"
              />
              <span className="text-[10px] text-slate-500">متر</span>
            </div>
            <div className="w-3 h-[1px] bg-[#f1cb83]/30" />
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs text-slate-400 whitespace-nowrap">تا:</span>
              <input
                type="number"
                value={localFilters.maxArea || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, maxArea: parseInt(e.target.value, 10) || 0 })}
                placeholder="حداکثر"
                className="w-full bg-transparent text-center font-bold text-[#f1cb83] text-xs outline-none"
              />
              <span className="text-[10px] text-slate-500">متر</span>
            </div>
          </div>
        </div>

        {/* 2. Budget Range with Persian Words */}
        <div className="rounded-2xl bg-[#091224]/70 p-3.5 border border-[#f1cb83]/25 shadow-inner flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#f1cb83] text-[16px]">payments</span>
              <span>سقف بودجه نقدی (تومان)</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400">از مبلغ:</label>
              <div className="flex items-center rounded-xl bg-[#0b1426] border border-white/10 px-2.5 py-1.5">
                <input
                  type="text"
                  value={localFilters.minBudget ? formatWithCommas(localFilters.minBudget) : ''}
                  onChange={(e) => setLocalFilters({ ...localFilters, minBudget: parseTomanNumber(e.target.value) })}
                  placeholder="حداقل"
                  className="w-full bg-transparent font-bold text-[#f1cb83] text-xs outline-none text-center"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400">تا مبلغ:</label>
              <div className="flex items-center rounded-xl bg-[#0b1426] border border-white/10 px-2.5 py-1.5">
                <input
                  type="text"
                  value={localFilters.maxBudget ? formatWithCommas(localFilters.maxBudget) : ''}
                  onChange={(e) => setLocalFilters({ ...localFilters, maxBudget: parseTomanNumber(e.target.value) })}
                  placeholder="حداکثر"
                  className="w-full bg-transparent font-bold text-[#f1cb83] text-xs outline-none text-center"
                />
              </div>
            </div>
          </div>
          {localFilters.minBudget > 0 || localFilters.maxBudget < 100000000000 ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#f1cb83]/10 border border-[#f1cb83]/25">
              <span className="material-symbols-outlined text-[#f1cb83] text-[15px]">edit_note</span>
              <p className="text-[11px] text-[#f1cb83] font-medium truncate">
                به حروف: {formatPriceInWords(localFilters.minBudget)} تا {formatPriceInWords(localFilters.maxBudget)}
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer with Apply Button */}
        <div className="flex items-center gap-2 pt-1 border-t border-[#f1cb83]/20">
          <button
            onClick={() => {
              onApplyFilters(localFilters);
              onClose();
            }}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] text-xs font-bold shadow-[0_0_16px_rgba(241,203,131,0.35)] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">done_all</span>
            <span>نمایش {toPersianDigits(matchCount)} متقاضی</span>
          </button>
          <button
            onClick={onClose}
            className="py-3 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 active:scale-95 transition-all"
            type="button"
          >
            بستن پنل
          </button>
        </div>
      </div>
    </div>
  );
};
