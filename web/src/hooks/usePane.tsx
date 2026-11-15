// Tells a screen that it is shown as one of the side-by-side panes of the
// desktop layout. In a pane a screen has no back button and no tab bar, and
// leaves out links to screens that are already visible next to it.

import { createContext, useContext, type ReactNode } from 'react';

const PaneContext = createContext(false);

export function useInPane(): boolean {
  return useContext(PaneContext);
}

export function PaneProvider({ children }: { children: ReactNode }) {
  return <PaneContext.Provider value={true}>{children}</PaneContext.Provider>;
}
