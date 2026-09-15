import React, { useRef } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import './WaveSearch.css';

interface WaveSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}

export const WaveSearchInput: React.FC<WaveSearchInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  className = '',
}) => {
  const { messages } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const labelText = placeholder || messages.search.label || 'Search music...';
  const chars = Array.from(labelText);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      onSubmit();
    }
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className={`wave-group ${className}`.trim()}>
      <input
        ref={inputRef}
        type="text"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`wave-input ${value ? 'has-value' : ''}`}
        placeholder=" "
        autoComplete="off"
        spellCheck="false"
      />
      <i className="ri-search-line wave-icon-left" />
      <span className="bar" />
      <label className="wave-label">
        {chars.map((char, index) => (
          <span
            key={index}
            className="label-char"
            style={{ '--index': index } as React.CSSProperties}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </label>
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="wave-clear-btn"
          aria-label="Clear search"
        >
          <i className="ri-close-line text-[16px]" />
        </button>
      )}
    </div>
  );
};
