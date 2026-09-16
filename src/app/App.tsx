import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SessionProvider, useSession } from '../entities/session/model/session-context';
import { CacheProvider } from '../entities/track/model/cache-context';
import { LikesProvider } from '../entities/track/model/likes-context';
import { PlayerProvider } from '../entities/player/model/PlayerProvider';
import { PlaylistProvider } from '../entities/playlist/model/playlist-context';
import { Sidebar, type PageView } from '../widgets/sidebar/ui/Sidebar';
import { Header } from '../widgets/header/ui/Header';
import { PlayerBar } from '../widgets/player-bar/ui/PlayerBar';
import { HomePage } from '../pages/home/ui/HomePage';
import { SearchPage } from '../pages/search/ui/SearchPage';
import { LibraryPage } from '../pages/library/ui/LibraryPage';
import { SettingsPage } from '../pages/settings/ui/SettingsPage';
import { LoginPage } from '../pages/login/ui/LoginPage';
import { TasteGraphPage } from '../pages/taste-graph/ui/TasteGraphPage';
import { QueueAside } from '../widgets/queue-aside/ui/QueueAside';
import { LoginModal } from '../widgets/auth/ui/LoginModal';
import { tauriApi } from '../shared/api/tauri-client';
import type { Track } from '../entities/track/model/types';
import './styles/index.css';

export const AppContent: React.FC = () => {
  const { session, isLoading: isSessionLoading } = useSession();
  const [currentPage, setCurrentPage] = useState<PageView>('home');
  const [isGuest, setIsGuest] = useState(false);
  const [hasCompletedLogin, setHasCompletedLogin] = useState(false);
  const initialCheckDone = useRef(false);

  // Check initial authentication once session is resolved
  useEffect(() => {
    if (!isSessionLoading && !initialCheckDone.current) {
      initialCheckDone.current = true;
      if (session.is_authenticated) {
        setHasCompletedLogin(true);
      }
    }
  }, [isSessionLoading, session.is_authenticated]);

  // If user logs out from settings
  useEffect(() => {
    if (initialCheckDone.current && !session.is_authenticated && !isGuest) {
      setHasCompletedLogin(false);
    }
  }, [session.is_authenticated, isGuest]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const navigateTo = (page: PageView) => {
    if (page === currentPage) return;
    setCurrentPage(page);
  };

  const performSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const results = await tauriApi.searchTracks(trimmed);
      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search on typing
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    // Switch to search view when user types in search bar
    if (currentPage !== 'search') {
      navigateTo('search');
    }

    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  // Initial loading splash
  if (isSessionLoading && !initialCheckDone.current) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center select-none">
        <div className="w-16 h-16 animate-pulse">
          <img src="/logo.png" alt="freakcloud" className="w-full h-full object-contain" />
        </div>
      </div>
    );
  }

  // Show full-screen LoginPage if not authenticated & not in guest mode
  if (!hasCompletedLogin && !isGuest) {
    return (
      <LoginPage
        onLoginSuccess={() => {
          setHasCompletedLogin(true);
          setCurrentPage('home');
        }}
        onGuestContinue={() => {
          setIsGuest(true);
          setCurrentPage('home');
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-black text-white select-none">
      {/* 1. Upper Section: Left Sidebar + Right View Area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar currentPage={currentPage} onNavigate={navigateTo} />

        <div className="flex-1 flex flex-col min-w-0 bg-black overflow-hidden">
          <Header
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={() => performSearch(searchQuery)}
          />

          <main className="flex-1 overflow-y-auto overflow-x-hidden p-space-lg flex flex-col items-center">
            {currentPage === 'home' && (
              <HomePage
                onNavigate={navigateTo}
                onSelectQuery={(q) => {
                  setSearchQuery(q);
                  navigateTo('search');
                  performSearch(q);
                }}
              />
            )}
            {currentPage === 'search' && (
              <SearchPage
                searchQuery={searchQuery}
                searchResults={searchResults}
                isSearching={isSearching}
                onSelectQuery={(q) => {
                  setSearchQuery(q);
                  performSearch(q);
                }}
              />
            )}
            {currentPage === 'library' && <LibraryPage />}
            {currentPage === 'taste-graph' && <TasteGraphPage onNavigate={navigateTo} />}
            {currentPage === 'settings' && <SettingsPage />}
          </main>
        </div>

        {/* Right Aside: Full-height animated Queue panel */}
        <QueueAside />
      </div>

      {/* 2. Bottom Player Bar */}
      <PlayerBar />

      {/* 3. SoundCloud OAuth Login Modal */}
      <LoginModal />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <SessionProvider>
      <CacheProvider>
        <LikesProvider>
          <PlaylistProvider>
            <PlayerProvider>
              <AppContent />
            </PlayerProvider>
          </PlaylistProvider>
        </LikesProvider>
      </CacheProvider>
    </SessionProvider>
  );
};

export default App;
