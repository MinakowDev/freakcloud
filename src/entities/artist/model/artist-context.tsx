import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface ArtistContextValue {
  selectedArtist: string | null;
  isOpen: boolean;
  openArtist: (artistName: string) => void;
  closeArtist: () => void;
}

export const ArtistContext = createContext<ArtistContextValue | null>(null);

export const ArtistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openArtist = useCallback((artistName: string) => {
    const trimmed = artistName.trim();
    if (!trimmed) return;
    setSelectedArtist(trimmed);
    setIsOpen(true);
  }, []);

  const closeArtist = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      selectedArtist,
      isOpen,
      openArtist,
      closeArtist,
    }),
    [selectedArtist, isOpen, openArtist, closeArtist]
  );

  return <ArtistContext.Provider value={value}>{children}</ArtistContext.Provider>;
};

export const useArtist = (): ArtistContextValue => {
  const context = useContext(ArtistContext);
  if (!context) {
    throw new Error('useArtist must be used within ArtistProvider');
  }
  return context;
};
