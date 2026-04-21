import React from 'react';
import { usePanelContext } from '../context/PanelContext';
import { useItemActions } from '../context/ItemActionsContext';

interface TabDef {
  id: string;
  label: string;
}

const ITEM_BASE_TABS: TabDef[] = [
  { id: 'reference', label: 'Referenz' },
  { id: 'ki', label: 'KI' },
  { id: 'instance', label: 'Vorrat' },
  { id: 'images', label: 'Bilder' },
  { id: 'attachments', label: 'Anhänge' },
  { id: 'accessories', label: 'Zubehör' },
  { id: 'events', label: 'Aktivitäten' },
];

const REVIEW_TAB: TabDef = { id: 'review', label: 'Review' };

// review tab inserted after 'instance' (index 1) only when agentic review is pending
const REVIEW_INSERT_INDEX = 2;

const BOX_BASE_TABS: TabDef[] = [
  { id: 'info', label: 'Info' },
  { id: 'images', label: 'Bilder' },
  { id: 'items', label: 'Artikel' },
  { id: 'events', label: 'Aktivitäten' },
];

// stubs tab appended only for shelves (BoxID starts with S-)
const STUBS_TAB: TabDef = { id: 'stubs', label: 'Stubs' };

function isShelfId(boxId: string): boolean {
  try {
    return boxId.trim().toUpperCase().startsWith('S-');
  } catch {
    return false;
  }
}

export default function DetailTabBar() {
  const { entityType, entityId, activeTab, setTab } = usePanelContext();
  const actions = useItemActions();

  if (entityType === 'box' && entityId) {
    const effective = activeTab ?? 'info';
    const tabs = isShelfId(entityId) ? [...BOX_BASE_TABS, STUBS_TAB] : BOX_BASE_TABS;
    return (
      <nav className="detail-tab-bar" aria-label="Behälter-Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`detail-tab-bar__tab${effective === tab.id ? ' is-active' : ''}`}
            onClick={() => setTab(tab.id)}
            aria-current={effective === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    );
  }

  if (entityType !== 'item') return null;

  const effective = activeTab ?? 'reference';

  const tabs = actions?.agenticNeedsReview
    ? [
        ...ITEM_BASE_TABS.slice(0, REVIEW_INSERT_INDEX),
        REVIEW_TAB,
        ...ITEM_BASE_TABS.slice(REVIEW_INSERT_INDEX),
      ]
    : ITEM_BASE_TABS;

  return (
    <nav className="detail-tab-bar" aria-label="Artikel-Tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`detail-tab-bar__tab${effective === tab.id ? ' is-active' : ''}`}
          onClick={() => setTab(tab.id)}
          aria-current={effective === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
