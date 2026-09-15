import React from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { useSession } from '../../../entities/session/model/session-context';
import './SidebarGlider.css';

export type PageView = 'home' | 'search' | 'library' | 'settings';

interface SidebarProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate }) => {
  const { messages } = useTranslation();
  const { session } = useSession();

  const navItems: { id: PageView; label: string; icon: string }[] = [
    { id: 'home', label: messages.nav.home, icon: 'ri-home-5-line' },
    { id: 'search', label: messages.nav.search, icon: 'ri-search-line' },
    { id: 'library', label: messages.nav.library, icon: 'ri-folder-music-line' },
  ];

  return (
    <aside className="w-60 h-full bg-black border-r border-zinc-800 flex flex-col justify-between select-none flex-shrink-0">
      <div className="flex flex-col">
        {/* Window Drag Header with Logo & Brand */}
        <div
          data-tauri-drag-region
          className="h-14 px-space-lg flex items-center gap-2.5 border-b border-zinc-800"
        >
          <img src="/logo.png" alt="logo" className="w-5 h-5 object-contain" />
          <span className="font-headline-sm text-sm tracking-wider text-zinc-300 font-semibold">
            freackcloud
          </span>
        </div>

        {/* Navigation list with Glowing Glider (3 main items) */}
        <div className="px-space-md py-space-md flex flex-col gap-2">
          <div className="px-2 pb-1 font-label-sm text-label-sm text-zinc-500 uppercase tracking-wider">
            {messages.nav.title}
          </div>

          <div className="sidebar-radio-container">
            {navItems.map((item) => (
              <React.Fragment key={item.id}>
                <input
                  id={`radio-nav-${item.id}`}
                  name="sidebar-radio"
                  type="radio"
                  checked={currentPage === item.id}
                  onChange={() => onNavigate(item.id)}
                />
                <label htmlFor={`radio-nav-${item.id}`}>
                  <i className={`${item.icon} text-lg leading-none`}></i>
                  <span className="font-body-md text-sm">{item.label}</span>
                </label>
              </React.Fragment>
            ))}
            <div className="glider-container">
              <div className="glider" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Area: Settings & User Profile */}
      <div className="p-space-md border-t border-zinc-800 flex flex-col gap-space-sm">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-colors cursor-pointer text-left w-full ${
            currentPage === 'settings'
              ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
              : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-white'
          }`}
        >
          <i className="ri-settings-3-line text-lg leading-none"></i>
          <span className="font-body-md text-sm">{messages.nav.settings}</span>
        </button>

        {session.is_authenticated && session.user && (
          <div className="flex items-center gap-space-sm px-space-md py-2 bg-zinc-900/80 rounded-lg border border-zinc-800">
            {session.user.avatar_url ? (
              <img src={session.user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <i className="ri-user-smile-line text-zinc-400 text-[16px]"></i>
            )}
            <span className="font-label-sm text-xs text-zinc-300 truncate font-medium">
              {session.user.username}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
