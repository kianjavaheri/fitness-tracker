import { createContext, useContext } from 'react';

/**
 * Whether this bottom-tab page is the one on screen (TabPager keeps the others drawn, parked off screen). For a page
 * that should start fresh each time it's opened, as it did when pages were rebuilt on every visit.
 */
export const TabActiveContext = createContext(true);
export const useTabActive = () => useContext(TabActiveContext);
