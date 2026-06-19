import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

/** Viewports below this width use off-canvas sidebar (drawer). */
export const SIDEBAR_WIDE_BREAKPOINT = 1024;

type SidebarDrawerContextValue = {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  closeDrawer: () => void;
  isCompact: boolean;
  width: number;
};

const SidebarDrawerContext = createContext<SidebarDrawerContextValue | null>(null);

export function SidebarDrawerProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const isCompact = width < SIDEBAR_WIDE_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = useCallback(() => setDrawerOpen((o) => !o), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const value = useMemo(
    () => ({
      drawerOpen,
      setDrawerOpen,
      toggleDrawer,
      closeDrawer,
      isCompact,
      width,
    }),
    [drawerOpen, isCompact, width, toggleDrawer, closeDrawer],
  );

  return <SidebarDrawerContext.Provider value={value}>{children}</SidebarDrawerContext.Provider>;
}

export function useSidebarDrawer() {
  const ctx = useContext(SidebarDrawerContext);
  if (!ctx) {
    throw new Error('useSidebarDrawer must be used within SidebarDrawerProvider');
  }
  return ctx;
}

/** Returns null when used outside SidebarDrawerProvider (e.g. on native). */
export function useSidebarDrawerOptional() {
  return useContext(SidebarDrawerContext);
}
