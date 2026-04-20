import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useState
} from 'react';

export interface ItemActions {
  itemId: string;
  agenticNeedsReview: boolean;
  agenticCanStart: boolean;
  agenticCanRestart: boolean;
  agenticCanCancel: boolean;
  agenticActionPending: boolean;
  startLabel: string;
  onStart?: () => void | Promise<void>;
  onReview?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  onUploadImage?: () => void;
}

// Split into two contexts so ItemDetail (writer) doesn't re-render when actions state changes.
// SetContext is stable; GetContext changes when actions update.
const SetContext = createContext<((actions: ItemActions | null) => void) | null>(null);
const GetContext = createContext<ItemActions | null>(null);

export function ItemActionsProvider({ children }: PropsWithChildren<{}>) {
  const [actions, setActions] = useState<ItemActions | null>(null);
  const stableSet = useCallback((next: ItemActions | null) => setActions(next), []);
  return (
    <SetContext.Provider value={stableSet}>
      <GetContext.Provider value={actions}>
        {children}
      </GetContext.Provider>
    </SetContext.Provider>
  );
}

/** Used by ItemDetail to register its handlers — stable, does not trigger re-renders when actions change. */
export function useSetItemActions(): ((actions: ItemActions | null) => void) | null {
  return useContext(SetContext);
}

/** Used by ActionPanel and DetailTabBar to read current actions. */
export function useItemActions(): ItemActions | null {
  return useContext(GetContext);
}
