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
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';

export type MainView = 'items' | 'boxes' | 'transports' | 'stubs' | 'activities';

const MAIN_VIEW_PATHS: Record<MainView, string> = {
  items: '/items',
  boxes: '/boxes',
  transports: '/transports',
  stubs: '/stubs',
  activities: '/activities',
};

function pathToMainView(pathname: string): MainView {
  if (pathname.startsWith('/boxes')) return 'boxes';
  if (pathname.startsWith('/transports')) return 'transports';
  if (pathname.startsWith('/stubs')) return 'stubs';
  if (pathname.startsWith('/activities')) return 'activities';
  return 'items'; // / and /items both map to items
}

export type EntityType = 'item' | 'box' | 'transport' | 'stub';

// Default tab to activate when selecting an entity — avoids the legacy full-page fallback.
const DEFAULT_TAB: Record<EntityType, string> = {
  item: 'reference',
  box: 'info',
  transport: 'info',
  stub: 'info',
};

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
  mainView: MainView;
  setMainView: (view: MainView) => void;
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
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<PanelState>(() => paramsToState(searchParams));
  // skip the initial URL write — state was already derived from the URL on mount
  const isMounted = useRef(false);
  // Keep a ref of state for setMainView so it doesn't need state in its dep array.
  const stateRef = useRef(state);
  stateRef.current = state;

  const mainView = useMemo(() => pathToMainView(location.pathname), [location.pathname]);

  // Preserve panel search params when switching main views so the right column stays stable.
  const setMainView = useCallback((view: MainView) => {
    const panelParams = stateToParams(stateRef.current);
    const qs = new URLSearchParams(panelParams).toString();
    navigate(qs ? `${MAIN_VIEW_PATHS[view]}?${qs}` : MAIN_VIEW_PATHS[view]);
  }, [navigate]);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    // Merge panel params into existing search params instead of replacing all params.
    // Replacing would clobber list-page filter params like ?box= causing spurious refetches.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('entity');
      next.delete('id');
      next.delete('tab');
      next.delete('multi');
      for (const [k, v] of Object.entries(stateToParams(state))) {
        next.set(k, v);
      }
      return next;
    }, { replace: true });
  }, [state, setSearchParams]);

  // Auto-activate the entity's default tab so clicking a list row opens the shell view directly.
  const setEntity = useCallback((type: EntityType, id: string) => {
    setState({ entityType: type, entityId: id, activeTab: DEFAULT_TAB[type] ?? 'reference', multiSelection: null });
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
    () => ({ ...state, setEntity, setCreateMode, setTab, setMultiSelection, clearSelection, mainView, setMainView }),
    [state, setEntity, setCreateMode, setTab, setMultiSelection, clearSelection, mainView, setMainView]
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
