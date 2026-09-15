import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session } from './types';
import { tauriApi, isTauri } from '../../../shared/api/tauri-client';

interface SessionContextValue {
  session: Session;
  isLoading: boolean;
  error: string | null;
  loginWithToken: (token: string) => Promise<boolean>;
  openDirectLogin: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isOAuthModalOpen: boolean;
  openOAuthModal: () => void;
  closeOAuthModal: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session>({ is_authenticated: false });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const current = await tauriApi.getCurrentSession();
      setSession(current);
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();

    // Listen to native Tauri session_updated event
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('session_updated', () => {
          refreshSession();
          setIsOAuthModalOpen(false);
        }).then((fn) => {
          unlisten = fn;
        });
      }).catch((err) => {
        console.warn('Failed to register session_updated listener:', err);
      });
    }

    return () => {
      unlisten?.();
    };
  }, [refreshSession]);

  const loginWithToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      const newSession = await tauriApi.loginWithToken(token);
      setSession(newSession);
      setIsOAuthModalOpen(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openDirectLogin = useCallback(async () => {
    try {
      setError(null);
      await tauriApi.openSoundcloudLogin();

      // Poll session status every 1.5s while user might be signing in
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const current = await tauriApi.getCurrentSession();
          if (current.is_authenticated) {
            setSession(current);
            setIsOAuthModalOpen(false);
            clearInterval(interval);
          }
        } catch {
          // ignore
        }
        if (attempts > 80) {
          clearInterval(interval);
        }
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, []);

  const openOAuthModal = useCallback(() => {
    setIsOAuthModalOpen(true);
  }, []);

  const closeOAuthModal = useCallback(() => {
    setIsOAuthModalOpen(false);
  }, []);

  const logout = async () => {
    try {
      setIsLoading(true);
      const guest = await tauriApi.logout();
      setSession(guest);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const value: SessionContextValue = {
    session,
    isLoading,
    error,
    loginWithToken,
    openDirectLogin,
    logout,
    refreshSession,
    isOAuthModalOpen,
    openOAuthModal,
    closeOAuthModal,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
};
