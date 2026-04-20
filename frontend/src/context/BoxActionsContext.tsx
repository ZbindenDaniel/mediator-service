import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useState
} from 'react';

export interface BoxActions {
  boxId: string;
  onAddItem?: () => void;
  onUploadImage?: () => void;
}

// Split into two contexts so BoxDetail (writer) doesn't re-render when actions state changes.
const SetContext = createContext<((actions: BoxActions | null) => void) | null>(null);
const GetContext = createContext<BoxActions | null>(null);

export function BoxActionsProvider({ children }: PropsWithChildren<{}>) {
  const [actions, setActions] = useState<BoxActions | null>(null);
  const stableSet = useCallback((next: BoxActions | null) => setActions(next), []);
  return (
    <SetContext.Provider value={stableSet}>
      <GetContext.Provider value={actions}>
        {children}
      </GetContext.Provider>
    </SetContext.Provider>
  );
}

/** Used by BoxDetail to register its handlers — stable, does not trigger re-renders when actions change. */
export function useSetBoxActions(): ((actions: BoxActions | null) => void) | null {
  return useContext(SetContext);
}

/** Used by ActionPanel to read current box actions. */
export function useBoxActions(): BoxActions | null {
  return useContext(GetContext);
}
