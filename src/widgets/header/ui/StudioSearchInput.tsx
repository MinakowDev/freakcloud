import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import './StudioSearch.css';

interface StudioSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}

export const StudioSearchInput: React.FC<StudioSearchInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  className = '',
}) => {
  const { messages } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Global Ctrl+K / Cmd+K hotkey to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      onSubmit();
    }
    if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const displayPlaceholder = placeholder || messages.search.placeholder || 'Поиск треков и плейлистов...';

  return (
    <div className={`studio-search-container ${isFocused ? 'is-focused' : ''} ${className}`.trim()}>
      <i className="ri-search-line studio-search-icon" />

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={displayPlaceholder}
        autoComplete="off"
        spellCheck="false"
        className="studio-search-input"
      />

      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="studio-search-clear"
          title="Очистить"
          aria-label="Clear search"
        >
          <i className="ri-close-line text-sm" />
        </button>
      )}
    </div>
  );
};
