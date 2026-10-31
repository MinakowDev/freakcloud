import React, { useState, useRef, useEffect } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
}

export interface CustomDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  prefixLabel?: string;
  prefixIcon?: string;
  placeholder?: string;
  className?: string;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  options,
  onChange,
  prefixLabel,
  prefixIcon,
  placeholder,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="w-full bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2.5 transition-colors cursor-pointer outline-none focus:border-zinc-600 shadow-sm"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {prefixIcon && <i className={`${prefixIcon} text-zinc-400 text-xs`} />}
          {prefixLabel && <span className="text-zinc-500 font-medium shrink-0">{prefixLabel}:</span>}
          <span className="truncate font-medium text-zinc-200">
            {selectedOption ? selectedOption.label : placeholder || value}
          </span>
        </div>

        <i
          className={`ri-arrow-down-s-line text-sm transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-orange-400' : 'text-zinc-400'
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] max-h-60 overflow-y-auto rounded-xl bg-zinc-950/95 backdrop-blur-md border border-zinc-800/90 shadow-2xl p-1.5 flex flex-col gap-0.5 animate-in fade-in"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value)}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-orange-500/15 text-orange-400 font-medium'
                    : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {opt.icon && <i className={`${opt.icon} text-xs`} />}
                  <span className="truncate">{opt.label}</span>
                </div>
                {isSelected && <i className="ri-check-line text-orange-400 text-xs ml-2 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
