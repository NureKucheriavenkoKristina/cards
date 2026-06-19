import React, { createContext, useContext } from 'react';

type MobileDrawerContextValue = {
  openMenu: () => void;
};

const MobileDrawerContext = createContext<MobileDrawerContextValue | null>(null);

export function MobileDrawerProvider({
  children,
  openMenu,
}: {
  children: React.ReactNode;
  openMenu: () => void;
}) {
  const value = React.useMemo(() => ({ openMenu }), [openMenu]);
  return <MobileDrawerContext.Provider value={value}>{children}</MobileDrawerContext.Provider>;
}

/** Native drawer — undefined when not under provider (e.g. web). */
export function useMobileDrawerOptional() {
  return useContext(MobileDrawerContext);
}
