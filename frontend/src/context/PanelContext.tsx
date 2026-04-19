import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useSearchParams } from 'react-router-dom';

export type EntityType = 'item' | 'box' | 'transport' | 'stub';

export interface PanelState {
  entityType: EntityType | null;
  entityId: string | null;
  activeTab: string | null;
  multiSelection: string[] | null;
}

export interface PanelContextValue extends PanelState {
  setEntity: (type: EntityType, id: string) => void;
  setCreateMode: (type: EntityType) => void;
  setTab: (tab: string | null) => void;
  setMultiSelection: (ids: string[]) => void;
  clearSelection: () => void;
}

const VALID_ENTITY_TYPES: EntityType[] = ['item', 'box', 'transport', 'stub'];

const PanelContext = createContext<PanelContextValue | undefined>(undefined);

function paramsToState(params: URLSearchParams): PanelState {
  const rawType = params.get('entity');
  const entityType = VALID_ENTITY_TYPES.includes(rawType as EntityType)
    ? (rawType as EntityType)
    : null;
  const multiRaw = params.get('multi');
  const multiSelection = multiRaw ? multiRaw.split(',').filter(Boolean) : null;
  return {
    entityType,
    // multiSelection and entityId are mutually exclusive per spec
    entityId: multiSelection?.length ? null : (params.get('id') ?? null),
    activeTab: params.get('tab') ?? null,
    multiSelection: multiSelection?.length ? multiSelection : null
  };
}

function stateToParams(state: PanelState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.entityType) params['entity'] = state.entityType;
  if (state.entityId) params['id'] = state.entityId;
  if (state.activeTab) params['tab'] = state.activeTab;
  if (state.multiSelection?.length) params['multi'] = state.multiSelection.join(',');
  return params;
}

export function PanelProvider({ children }: PropsWithChildren<{}>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<PanelState>(() => paramsToState(searchParams));
  // skip the initial URL write — state was already derived from the URL on mount
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    setSearchParams(stateToParams(state), { replace: true });
  }, [state, setSearchParams]);

  const setEntity = useCallback((type: EntityType, id: string) => {
    setState({ entityType: type, entityId: id, activeTab: null, multiSelection: null });
  }, []);

  const setCreateMode = useCallback((type: EntityType) => {
    setState({ entityType: type, entityId: null, activeTab: 'create', multiSelection: null });
  }, []);

  const setTab = useCallback((tab: string | null) => {
    setState((prev) => ({ ...prev, activeTab: tab }));
  }, []);

  const setMultiSelection = useCallback((ids: string[]) => {
    setState((prev) => ({
      ...prev,
      entityId: null,
      multiSelection: ids.length > 0 ? ids : null
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState({ entityType: null, entityId: null, activeTab: null, multiSelection: null });
  }, []);

  const value = useMemo<PanelContextValue>(
    () => ({ ...state, setEntity, setCreateMode, setTab, setMultiSelection, clearSelection }),
    [state, setEntity, setCreateMode, setTab, setMultiSelection, clearSelection]
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelContext(): PanelContextValue {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelContext must be used within a PanelProvider');
  }
  return context;
}
