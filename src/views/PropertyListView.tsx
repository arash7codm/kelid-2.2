import React, { useState, useMemo, useEffect } from 'react';
import { Property, Applicant } from '../types';
import { Logo } from '../components/Logo';
import { PropertyFilterDrawer, PropertyFilterValues } from './PropertyFilterDrawer';
import {
  toPersianDigits,
  formatPersianNumber,
  formatPriceShortParts,
  formatPriceInWords,
  formatAreaInWords,
} from '../utils/jalali';
import { findMatchesForProperty } from '../services/matching';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { resolveBlobUrl } from '../db';

interface PropertyListViewProps {
  properties: Property[];
  applicants: Applicant[];
  onOpenPropertyDetail: (prop: Property) => void;
  onEditProperty: (prop: Property) => void;
  onAddNewProperty: () => void;
  onOpenMap: () => void;
  onOpenApplicantDetail: (app: Applicant) => void;
  filterPreset?: string;
}

const KNOWN_CHIP_PRESETS = ['all', 'land', 'villa', 'baft', 'sanad'];
const KNOWN_DASHBOARD_PRESETS = ['active', 'negotiating', 'sold', 'new', 'apartment'];

export const PropertyListView: React.FC<PropertyListViewProps> = ({
  properties,
  applicants,
  onOpenPropertyDetail,
  onEditProperty,
  onAddNewProperty,
  onOpenMap,
  onOpenApplicantDetail,
  filterPreset,
}) => {
  const isChipPreset = !filterPreset || KNOWN_CHIP_PRESETS.includes(filterPreset);
  const isDashboardPreset = !!filterPreset && KNOWN_DASHBOARD_PRESETS.includes(filterPreset);

  const [searchQuery, setSearchQuery] = useState(
    isChipPreset || isDashboardPreset ? '' : filterPreset || ''
  );
  const [selectedQuickChip, setSelectedQuickChip] = useState<string>(
    isChipPreset ? filterPreset || 'all' : 'all'
  );
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'cheapest' | 'price_per_meter' | 'largest'>('newest');

  const [filterValues, setFilterValues] = useState<PropertyFilterValues>({
    propertyType: filterPreset === 'apartment' ? 'آپارتمان' : 'all',
    city: 'all',
    status:
      filterPreset === 'active'
        ? 'فعال'
        : filterPreset === 'negotiating'
        ? 'در مذاکره'
        : filterPreset === 'sold'
        ? 'فروخته‌شده'
        : 'all',
    zoning: 'all',
    deed: 'all',
    minArea: 0,
    maxArea: 10000,
    minBudget: 0,
    maxBudget: 100000000000,
  });

  useEffect(() => {
    if (!filterPreset) return;
    if (KNOWN_CHIP_PRESETS.includes(filterPreset)) {
      setSelectedQuickChip(filterPreset);
      setSearchQuery('');
    } else if (KNOWN_DASHBOARD_PRESETS.includes(filterPreset)) {
      setSelectedQuickChip('all');
      setSearchQuery('');
      setFilterValues((prev) => ({
        ...prev,
        propertyType: filterPreset === 'apartment' ? 'آپارتمان' : 'all',
        status:
          filterPreset === 'active'
            ? 'فعال'
            : filterPreset === 'negotiating'
            ? 'در مذاکره'
            : filterPreset === 'sold'
            ? 'فروخته‌شده'
            : 'all',
      }));
    } else {
      setSearchQuery(filterPreset);
    }
  }, [filterPreset]);

  // Calculate active filter groups count (§6)
  const activeFilterGroupsCount = useMemo(() => {
    let count = 0;
    if (filterValues.propertyType !== 'all') count++;
    if (filterValues.city !== 'all') count++;
    if (filterValues.status !== 'all') count++;
    if (filterValues.zoning !== 'all') count++;
    if (filterValues.deed !== 'all') count++;
    if (filterValues.minArea > 0 || filterValues.maxArea < 10000) count++;
    if (filterValues.minBudget > 0 || filterValues.maxBudget < 100000000000) count++;
    return count;
  }, [filterValues]);

  // Coordinates count for map-entry card (§6)
  const propertiesWithCoordsCount = properties.filter(p => !p.deleted && p.coordinates?.lat).length;
  const activeCount = properties.filter(p => !p.deleted && p.status === 'فعال').length;

  // Filter & Sort Logic
  const filteredProperties = useMemo(() => {
    let result = properties.filter(p => !p.deleted);

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p.code.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.district.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q)) ||
        (p.accessPath && p.accessPath.toLowerCase().includes(q)) ||
        (p.ownerName && p.ownerName.toLowerCase().includes(q)) ||
        (p.deedType && p.deedType.toLowerCase().includes(q)) ||
        (p.zoningStatus && p.zoningStatus.toLowerCase().includes(q))
      );
    }

    // Quick horizontal chip
    if (selectedQuickChip === 'land') {
      result = result.filter(p => p.propertyType === 'زمین' || p.propertyType === 'باغ');
    } else if (selectedQuickChip === 'villa') {
      result = result.filter(p => p.propertyType === 'ویلا');
    } else if (selectedQuickChip === 'baft') {
      result = result.filter(p => p.zoningStatus?.includes('داخل بافت') || p.zoningStatus?.includes('بافت'));
    } else if (selectedQuickChip === 'sanad') {
      result = result.filter(p => p.deedType?.includes('تک‌برگ') || p.deedType?.includes('ششدانگ'));
    }

    // Drawer Filters
    if (filterValues.propertyType !== 'all') {
      result = result.filter(p => p.propertyType === filterValues.propertyType);
    }
    if (filterValues.city !== 'all') {
      result = result.filter(p => p.city.includes(filterValues.city));
    }
    if (filterValues.status !== 'all') {
      result = result.filter(p => p.status.includes(filterValues.status));
    }
    if (filterValues.zoning !== 'all') {
      result = result.filter(p => p.zoningStatus?.includes(filterValues.zoning));
    }
    if (filterValues.deed !== 'all') {
      result = result.filter(p =>
        filterValues.deed === 'ششدانگ' || filterValues.deed === 'تک‌برگ'
          ? p.deedType?.includes('ششدانگ') || p.deedType?.includes('تک‌برگ')
          : p.deedType?.includes(filterValues.deed)
      );
    }
    if (filterValues.minArea > 0) {
      result = result.filter(p => p.area >= filterValues.minArea);
    }
    if (filterValues.maxArea < 10000) {
      result = result.filter(p => p.area <= filterValues.maxArea);
    }
    if (filterValues.minBudget > 0) {
      result = result.filter(p => p.totalPrice >= filterValues.minBudget);
    }
    if (filterValues.maxBudget < 100000000000) {
      result = result.filter(p => p.totalPrice <= filterValues.maxBudget);
    }

    // Sorting
    if (sortBy === 'cheapest') {
      result.sort((a, b) => a.totalPrice - b.totalPrice);
    } else if (sortBy === 'price_per_meter') {
      result.sort((a, b) => b.pricePerMeter - a.pricePerMeter);
    } else if (sortBy === 'largest') {
      result.sort((a, b) => b.area - a.area);
    } else {
      // Newest
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [properties, searchQuery, selectedQuickChip, filterValues, sortBy]);

  const getStatusBadgeClasses = (status: Property['status']) => {
    switch (status) {
      case 'فعال':
        return {
          wrap: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35',
          dot: 'bg-emerald-400',
        };
      case 'در مذاکره':
        return {
          wrap: 'bg-amber-500/20 text-[#f1cb83] border-amber-400/40',
          dot: 'bg-[#f1cb83]',
        };
      case 'رزرو شده':
        return {
          wrap: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
          dot: 'bg-sky-400',
        };
      case 'فروخته‌شده':
        return {
          wrap: 'bg-slate-500/25 text-slate-300 border-slate-400/35',
          dot: 'bg-slate-400',
        };
      default:
        return {
          wrap: 'bg-rose-500/20 text-rose-300 border-rose-500/35',
          dot: 'bg-rose-400',
        };
    }
  };

  return (
    <div className="flex flex-col w-full pb-28 text-right">
      {/* 1. Header Bar with frameless logo */}
      <header className="pt-2 pb-3 flex flex-col gap-2.5 border-b border-[#f1cb83]/20 bg-[#050d22]/40 backdrop-blur-2xl sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo className="h-11 w-auto object-contain shrink-0 drop-shadow-[0_2px_10px_rgba(241,203,131,0.45)]" />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-bold text-slate-100 tracking-tight">جستجو و بایگانی</h1>
                <div className="flex items-center gap-1 pr-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f1cb83]/50 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f1cb83]/50 animate-pulse" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
              <span className="text-[10px] text-slate-400">سامانه مشاورین املاک شمال کشور</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Match Badge Counter with breathing glow */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f1cb83]/10 border border-[#f1cb83]/35 shadow-[0_0_14px_rgba(241,203,131,0.22)] backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
              <span className="text-xs font-bold text-[#f1cb83]">
                {toPersianDigits(activeCount)} فایل فعال
              </span>
            </div>
            <button
              type="button"
              onClick={onAddNewProperty}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-xs flex items-center gap-1 shadow-[0_0_14px_rgba(241,203,131,0.35)] active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add_home</span>
              <span>ثبت ملک</span>
            </button>
          </div>
        </div>

        {/* 2. Interactive Search Bar & Filter Toggle Button */}
        <div className="flex items-center gap-2 mt-1">
          <div className="relative flex-1">
            <div className="flex items-center w-full rounded-2xl bg-[#0b1426]/75 border border-[#f1cb83]/35 shadow-inner px-3 py-1.5 gap-1.5">
              <span className="material-symbols-outlined text-[#f1cb83] text-[22px]">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی کد فایل، منطقه، مالک یا متقاضی..."
                className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-400 outline-none"
                type="text"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                </button>
              )}
              <VoiceInputButton
                value={searchQuery}
                onChange={(val) => setSearchQuery(val)}
                append={false}
                variant="icon"
                label="جستجوی صوتی ملک"
              />
            </div>
          </div>

          {/* Toggle Filter Drawer Button with Badge (§6) */}
          <button
            onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
            className={`relative min-h-[44px] flex items-center justify-center gap-1 px-3.5 py-2.5 rounded-2xl border transition-all duration-300 backdrop-blur-xl cursor-pointer ${
              isFilterDrawerOpen
                ? 'bg-[#f1cb83] text-[#070d1a] border-[#f1cb83] shadow-[0_0_20px_rgba(241,203,131,0.4)]'
                : 'bg-[#0b1426]/70 border-[#f1cb83]/45 text-[#f1cb83]'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isFilterDrawerOpen ? 'close' : 'tune'}
            </span>
            <span className="text-xs font-bold hidden sm:inline">فیلترها</span>
            {activeFilterGroupsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f1cb83] text-[#070d1a] font-bold text-[10px] flex items-center justify-center shadow-md animate-pulse">
                {toPersianDigits(activeFilterGroupsCount)}
              </span>
            )}
          </button>
        </div>

        {/* 3. Quick Chips Row (Horizontal Scroll) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-none">
          {[
            { id: 'all', label: 'همه فایل‌ها', icon: 'grid_view' },
            { id: 'land', label: 'زمین و باغات', icon: 'landscape' },
            { id: 'villa', label: 'ویلا مستقل', icon: 'villa' },
            { id: 'baft', label: 'داخل بافت', icon: 'verified' },
            { id: 'sanad', label: 'سند ششدانگ / تک‌برگ', icon: 'description' },
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => setSelectedQuickChip(chip.id)}
              className={`min-h-[38px] px-3 py-1 rounded-xl text-xs whitespace-nowrap transition-all duration-200 flex items-center gap-1 cursor-pointer active:scale-95 ${
                selectedQuickChip === chip.id
                  ? 'bg-[#f1cb83] text-[#070d1a] font-bold shadow-[0_0_12px_rgba(241,203,131,0.4)]'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:border-[#f1cb83]/40'
              }`}
              type="button"
            >
              <span className="material-symbols-outlined text-[14px]">{chip.icon}</span>
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* 4. Filter Drawer Accordion (§7) */}
      <PropertyFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        filters={filterValues}
        onApplyFilters={(newF) => setFilterValues(newF)}
        onResetFilters={() => {
          setFilterValues({
            propertyType: 'all',
            city: 'all',
            status: 'all',
            zoning: 'all',
            deed: 'all',
            minArea: 0,
            maxArea: 10000,
            minBudget: 0,
            maxBudget: 100000000000
          });
        }}
        matchCount={filteredProperties.length}
      />

      {/* 5. Map-entry Card «نقشه جامع و ماهواره‌ای فایل‌ها» (§6) */}
      <div className="relative rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#0b1428]/90 to-amber-500/15 border border-[#f1cb83]/45 p-3.5 shadow-lg backdrop-blur-2xl transition-all hover:border-[#f1cb83] my-3 group">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-[#f1cb83]/30 to-[#f1cb83]/10 border border-[#f1cb83]/50 flex items-center justify-center text-[#f1cb83] shadow-[0_0_14px_rgba(241,203,131,0.3)] shrink-0 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[24px] text-amber-300 animate-pulse">map</span>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#070d1a]" />
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-[#f1cb83] transition-colors">
                نقشه جامع و ماهواره‌ای فایل‌ها
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                مشاهده تمام {toPersianDigits(propertiesWithCoordsCount)} فایل ملکی با موقعیت دقیق GPS روی نقشه ماهواره‌ای
              </p>
            </div>
          </div>
          <button
            onClick={onOpenMap}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-xs flex items-center gap-1.5 shadow-[0_0_14px_rgba(241,203,131,0.35)] active:scale-95 transition-all cursor-pointer shrink-0"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">explore</span>
            <span className="hidden sm:inline font-bold">نمایش نقشه</span>
          </button>
        </div>
      </div>

      {/* 6. Section Title & Sort Pills */}
      <div className="flex flex-col gap-2.5 my-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-[20px]">apartment</span>
            <h2 className="text-sm font-bold text-slate-100">فایل‌های آماده معامله</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#f1cb83]/15 text-[#f1cb83] border border-[#f1cb83]/35 font-bold">
              {toPersianDigits(filteredProperties.length)} فایل
            </span>
          </div>
        </div>

        {/* 4-Way Quick Sorting Pills (§6) */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { id: 'cheapest', label: 'ارزان‌ترین', icon: 'trending_down' },
            { id: 'price_per_meter', label: 'قیمت متری', icon: 'price_change' },
            { id: 'largest', label: 'متراژ بالا', icon: 'straighten' },
            { id: 'newest', label: 'جدیدترین', icon: 'schedule' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id as any)}
              className={`min-h-[40px] py-1.5 px-1 rounded-xl text-[11px] text-center font-bold flex items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                sortBy === s.id
                  ? 'bg-[#f1cb83] text-[#070d1a] shadow-[0_0_10px_rgba(241,203,131,0.35)]'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:border-[#f1cb83]/40'
              }`}
              type="button"
            >
              <span className="material-symbols-outlined text-[14px]">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 7. Property Cards List */}
      <div className="flex flex-col gap-3.5 mt-2">
        {filteredProperties.length === 0 ? (
          <div className="p-8 rounded-2xl glass-panel text-center text-xs text-slate-400 space-y-3">
            <span className="material-symbols-outlined text-4xl text-[#f1cb83]/50">search_off</span>
            <p>
              {properties.length === 0
                ? 'هنوز فایلی در سامانه ثبت نشده است.'
                : 'فایلی با این مشخصات و فیلترها پیدا نشد.'}
            </p>
            {properties.length === 0 ? (
              <button
                onClick={onAddNewProperty}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#f1cb83] text-[#070d1a] font-bold text-xs cursor-pointer"
              >
                ثبت ملک جدید
              </button>
            ) : (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedQuickChip('all');
                  setFilterValues({
                    propertyType: 'all',
                    city: 'all',
                    status: 'all',
                    zoning: 'all',
                    deed: 'all',
                    minArea: 0,
                    maxArea: 10000,
                    minBudget: 0,
                    maxBudget: 100000000000
                  });
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/10 text-slate-200 font-bold text-xs cursor-pointer"
              >
                بازنشانی همه فیلترها
              </button>
            )}
          </div>
        ) : (
          filteredProperties.map((prop) => {
            // Find matches for this property with applicants
            const propMatches = findMatchesForProperty(prop, applicants, 70);
            const topMatch = propMatches.length > 0 ? propMatches[0] : null;
            const statusStyle = getStatusBadgeClasses(prop.status);

            const mediaItems = prop.media || prop.images || [];
            const coverItem =
              mediaItems.find((m) => m.isCover) ||
              mediaItems.find((m) => m.isHelicopterShot || m.type === 'drone') ||
              mediaItems[0];
            const coverUrl = coverItem ? resolveBlobUrl(coverItem.ref || coverItem.url) : '';
            const hasHeliShot = mediaItems.some((m) => m.isHelicopterShot || m.type === 'drone');

            const ppmParts = formatPriceShortParts(prop.pricePerMeter);
            const totalParts = formatPriceShortParts(prop.totalPrice);

            const activeUtils = [
              prop.utilities?.water && 'آب',
              (prop.utilities?.electricity ?? prop.utilities?.power) && 'برق',
              prop.utilities?.gas && 'گاز',
              prop.utilities?.fiber && 'فیبر نوری',
            ].filter(Boolean) as string[];

            return (
              <div
                key={prop.id}
                className="relative rounded-2xl glass-panel p-4 border border-[#f1cb83]/35 shadow-lg flex flex-col gap-3 group hover:border-[#f1cb83]/70 transition-all cursor-pointer"
                onClick={() => onOpenPropertyDetail(prop)}
              >
                {/* Top Badge Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-[#050d22]/80 text-[#f1cb83] text-xs font-bold font-mono border border-[#f1cb83]/30 shadow-sm">
                      {prop.code}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 border ${statusStyle.wrap}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${statusStyle.dot}`} />
                      {prop.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] font-semibold">
                      {prop.propertyType}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    {prop.registrationDate}
                  </span>
                </div>

                {/* Smart Match Banner if match exists (§6) */}
                {topMatch && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenApplicantDetail(topMatch.applicant);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-[#f1cb83]/20 via-[#f1cb83]/10 to-transparent border border-[#f1cb83]/35 text-[#f1cb83] shadow-sm cursor-pointer hover:bg-[#f1cb83]/25 transition-all"
                  >
                    <span className="material-symbols-outlined text-[17px] animate-bounce">lightbulb</span>
                    <span className="text-xs font-bold truncate">
                      منطبق {toPersianDigits(topMatch.percentage)}٪ با خواسته‌ی مشتری {topMatch.applicant.code} ({topMatch.applicant.fullName})
                    </span>
                  </div>
                )}

                {/* Property Title, Location & Optional Cover Thumbnail */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-[#f1cb83] transition-colors">
                      {prop.title}
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                      <span className="material-symbols-outlined text-[15px] text-[#f1cb83]/80 shrink-0">
                        pin_drop
                      </span>
                      <span className="truncate">
                        {prop.city}، {prop.district}
                        {prop.accessPath || prop.accessRoute
                          ? ` — ${prop.accessPath || prop.accessRoute}`
                          : ''}
                      </span>
                    </p>
                  </div>

                  {coverUrl && (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#f1cb83]/35 shrink-0 bg-[#050d22]">
                      <img src={coverUrl} alt={prop.title} className="w-full h-full object-cover" />
                      {mediaItems.length > 1 && (
                        <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-black/75 text-[#f1cb83] text-[9px] font-bold">
                          {toPersianDigits(mediaItems.length)} عکس
                        </span>
                      )}
                      {hasHeliShot && (
                        <span
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 text-[#f1cb83] flex items-center justify-center"
                          title="دارای هلی‌شات هوایی"
                        >
                          <span className="material-symbols-outlined text-[11px]">flight_takeoff</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Metric Specs Box (§6: 3 Cells) */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-[#091224]/70 border border-[#f1cb83]/20 text-center backdrop-blur-md">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-slate-400">متراژ</span>
                    <span className="text-sm font-bold text-slate-100">
                      {formatPersianNumber(prop.area)}{' '}
                      <span className="text-[10px] text-slate-400 font-normal">متر</span>
                    </span>
                    <span className="text-[10px] text-[#f1cb83]/70 truncate">
                      {formatAreaInWords(prop.area)}
                    </span>
                  </div>
                  <div className="flex flex-col border-x border-[#f1cb83]/20 px-1">
                    <span className="text-[11px] text-slate-400">قیمت هر متر</span>
                    <span className="text-sm font-bold text-[#f1cb83] font-mono">
                      {ppmParts.value}{' '}
                      <span className="text-[10px] text-slate-400 font-normal">{ppmParts.unit}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {formatPriceInWords(prop.pricePerMeter)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-slate-400">قیمت کل</span>
                    <span className="text-sm font-bold text-[#f1cb83] font-mono">
                      {totalParts.value}{' '}
                      <span className="text-[10px] text-slate-400 font-normal">{totalParts.unit}</span>
                    </span>
                    <span className="text-[10px] text-[#f1cb83]/70 truncate">
                      {formatPriceInWords(prop.totalPrice)}
                    </span>
                  </div>
                </div>

                {/* Auto Tag Chips (derived strictly from recorded fields) */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {prop.deedType && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] border border-amber-500/30 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">workspace_premium</span>
                      <span>{prop.deedType}</span>
                    </span>
                  )}
                  {prop.zoningStatus && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] border border-emerald-500/30 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">verified</span>
                      <span>{prop.zoningStatus}</span>
                    </span>
                  )}
                  {(prop.permitStageType || prop.permitStatus) && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/5 text-slate-300 text-[11px] border border-[#f1cb83]/20 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-[#f1cb83]">approval</span>
                      <span>{prop.permitStageType || prop.permitStatus}</span>
                    </span>
                  )}
                  {activeUtils.length > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 text-[11px] border border-sky-500/30 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">bolt</span>
                      <span>{activeUtils.join(' • ')}</span>
                    </span>
                  )}
                  {prop.isNegotiable && (
                    <span className="px-2.5 py-1 rounded-lg bg-white/5 text-slate-300 text-[11px] border border-white/10 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-[#f1cb83]">handshake</span>
                      <span>قابل مذاکره</span>
                    </span>
                  )}
                </div>

                {/* Card Action Buttons (§6) */}
                <div
                  className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onOpenPropertyDetail(prop)}
                    className="min-h-[44px] py-2 px-3 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(241,203,131,0.25)] active:scale-95 transition-all cursor-pointer"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                    <span>رویت کامل فایل</span>
                  </button>
                  <button
                    onClick={() => onEditProperty(prop)}
                    className="min-h-[44px] py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold border border-[#f1cb83]/30 flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#f1cb83]">edit</span>
                    <span>ویرایش مشخصات</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

