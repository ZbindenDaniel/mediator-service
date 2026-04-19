import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useState
} from 'react';
import type { Item } from '../../../models';

export interface BulkSelectionValue {
  selectedItems: Item[];
  onClearSelection: () => void;
  onActionComplete: () => void | Promise<void>;
}

// Split to avoid re-rendering the writer (ItemListPage) when readers update.
const SetContext = createContext<((value: BulkSelectionValue | null) => void) | null>(null);
const GetContext = createContext<BulkSelectionValue | null>(null);

export function BulkSelectionProvider({ children }: PropsWithChildren<{}>) {
  const [value, setValue] = useState<BulkSelectionValue | null>(null);
  const stableSet = useCallback((next: BulkSelectionValue | null) => setValue(next), []);
  return (
    <SetContext.Provider value={stableSet}>
      <GetContext.Provider value={value}>
        {children}
      </GetContext.Provider>
    </SetContext.Provider>
  );
}

/** Used by ItemListPage to register/clear bulk selection data. */
export function useSetBulkSelection(): ((value: BulkSelectionValue | null) => void) | null {
  return useContext(SetContext);
}

/** Used by ActionPanel and detail panel to read bulk selection data. */
export function useBulkSelection(): BulkSelectionValue | null {
  return useContext(GetContext);
}
