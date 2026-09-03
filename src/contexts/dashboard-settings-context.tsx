'use client';

import * as React from 'react';

type DashboardSettingsContextType = {
  isOutlineEnhanced: boolean;
  toggleOutlineEnhanced: () => void;
};

const DashboardSettingsContext = React.createContext<DashboardSettingsContextType | undefined>(undefined);

export function DashboardSettingsProvider({ children }: { children: React.ReactNode }) {
  const [isOutlineEnhanced, setIsOutlineEnhanced] = React.useState(false);

  const toggleOutlineEnhanced = React.useCallback(() => {
    setIsOutlineEnhanced((prev) => !prev);
  }, []);

  return (
    <DashboardSettingsContext.Provider value={{ isOutlineEnhanced, toggleOutlineEnhanced }}>
      {children}
    </DashboardSettingsContext.Provider>
  );
}

export function useDashboardSettings() {
  const context = React.useContext(DashboardSettingsContext);
  if (context === undefined) {
    return { isOutlineEnhanced: false, toggleOutlineEnhanced: () => {} };
  }
  return context;
}
