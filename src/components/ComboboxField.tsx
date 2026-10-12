import React, { useState, useRef, useEffect, useMemo } from 'react';

export interface ComboboxFieldProps {
  value: string;
  onChange: (newValue: string) => void;
  options: string[];
  placeholder?: string;
  error?: boolean;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}

export const ComboboxField: React.FC<ComboboxFieldProps> = ({
  value,
  onChange,
  options,
  placeholder = 'انتخاب از لیست یا تایپ دستی...',
  error = false,
  className = '',
  inputClassName = '',
  ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFilterQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  // Filter suggestions live as user types, but if filterQuery is empty (e.g., opened via chevron or focus), show all options
  const filteredOptions = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return options;
    const matched = options.filter((opt) => opt.toLowerCase().includes(q));
    return matched.length > 0 ? matched : options;
  }, [options, filterQuery]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          aria-label={ariaLabel}
          placeholder={placeholder}
          onFocus={() => {
            setFilterQuery('');
            setIsOpen(true);
          }}
          onChange={(e) => {
            const nextVal = e.target.value;
            onChange(nextVal);
            setFilterQuery(nextVal);
            if (!isOpen) setIsOpen(true);
          }}
          className={`glass-field w-full min-h-[46px] h-12 pr-3 pl-11 rounded-xl text-xs font-bold text-slate-100 ${
            error ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
          } ${inputClassName}`}
        />

        <button
          type="button"
          tabIndex={-1}
          aria-label="نمایش گزینه‌های پیشنهادی"
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            } else {
              setFilterQuery('');
              setIsOpen(true);
              inputRef.current?.focus();
            }
          }}
          className="absolute left-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-[#f1cb83]/80 hover:text-[#f1cb83] hover:bg-white/5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">
            {isOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      </div>

      {isOpen && options.length > 0 && (
        <div className="absolute z-40 inset-x-0 mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-[#0a1328]/98 border border-[#f1cb83]/40 shadow-[0_14px_36px_rgba(0,0,0,0.85)] backdrop-blur-2xl divide-y divide-white/5">
          {filteredOptions.map((option) => {
            const isSelected = value.trim() === option.trim();
            return (
              <button
                key={option}
                type="button"
                onMouseDown={(e) => {
                  // Prevent input blur before selection
                  e.preventDefault();
                }}
                onClick={() => {
                  onChange(option);
                  setFilterQuery('');
                  setIsOpen(false);
                }}
                className={`w-full min-h-[44px] px-3.5 py-2.5 text-right text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#f1cb83]/20 text-[#f1cb83] font-extrabold'
                    : 'text-slate-200 hover:bg-white/10 font-medium'
                }`}
              >
                <span className="truncate">{option}</span>
                {isSelected && (
                  <span className="material-symbols-outlined text-[16px] text-[#f1cb83] shrink-0">
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
