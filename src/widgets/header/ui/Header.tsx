import React from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { useSession } from '../../../entities/session/model/session-context';
import { WindowControls } from '../../window-controls/ui/WindowControls';
import { StudioSearchInput } from './StudioSearchInput';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
}) => {
  const { messages } = useTranslation();
  const { session, openOAuthModal } = useSession();

  return (
    <header
      data-tauri-drag-region
      className="w-full h-14 bg-black border-b border-zinc-900/80 z-30 flex items-center justify-between pl-4 sm:pl-6 pr-0 gap-3 select-none flex-shrink-0 min-w-0"
    >
      {/* Left (Drag region / subtle spacer) */}
      <div className="w-8 sm:w-16 h-full flex items-center flex-shrink-0" data-tauri-drag-region />

      {/* Center: Fluid Centered Studio Search Input */}
      <div className="flex-1 max-w-[440px] min-w-[140px] flex items-center justify-center px-1">
        <StudioSearchInput
          value={searchQuery}
          onChange={onSearchChange}
          onSubmit={onSearchSubmit}
          className="w-full"
        />
      </div>

      {/* Right: Login button (if guest) & Window Controls flush to corner */}
      <div className="flex items-center justify-end gap-2 flex-shrink-0 h-full">
        {!session.is_authenticated && (
          <button
            onClick={openOAuthModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-black font-body-sm text-xs font-medium hover:bg-zinc-200 transition-colors shadow-sm"
            title={messages.auth.login_btn}
          >
            <i className="ri-soundcloud-line text-base"></i>
            <span className="hidden sm:inline">{messages.auth.login_btn}</span>
          </button>
        )}

        <WindowControls />
      </div>
    </header>
  );
};
