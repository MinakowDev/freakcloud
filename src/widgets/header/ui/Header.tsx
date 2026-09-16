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
      className="w-full h-14 bg-black border-b border-zinc-900/80 z-30 grid grid-cols-3 items-center px-space-lg select-none flex-shrink-0"
    >
      {/* Col 1 (Left): Drag region / spacer */}
      <div className="flex items-center h-full" data-tauri-drag-region />

      {/* Col 2 (Center): Centered Studio Search Input */}
      <div className="flex items-center justify-center">
        <StudioSearchInput
          value={searchQuery}
          onChange={onSearchChange}
          onSubmit={onSearchSubmit}
          className="w-72 sm:w-[420px]"
        />
      </div>

      {/* Col 3 (Right): Login button (if guest) & Window Controls */}
      <div className="flex items-center justify-end gap-space-sm">
        {!session.is_authenticated && (
          <button
            onClick={openOAuthModal}
            className="flex items-center gap-1.5 px-space-md py-1 rounded-full bg-white text-black font-body-sm text-body-sm font-medium hover:bg-zinc-200 transition-colors shadow-sm"
          >
            <i className="ri-soundcloud-line text-[18px]"></i>
            <span>{messages.auth.login_btn}</span>
          </button>
        )}

        <WindowControls />
      </div>
    </header>
  );
};
