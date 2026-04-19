import React from 'react';
import { usePanelContext } from '../context/PanelContext';
import { useItemActions } from '../context/ItemActionsContext';

interface TabDef {
  id: string;
  label: string;
}

const ITEM_BASE_TABS: TabDef[] = [
  { id: 'reference', label: 'Referenz' },
  { id: 'instance', label: 'Exemplar' },
  { id: 'images', label: 'Bilder' },
  { id: 'attachments', label: 'Anhänge' },
  { id: 'accessories', label: 'Zubehör' },
  { id: 'events', label: 'Aktivitäten' },
];

const REVIEW_TAB: TabDef = { id: 'review', label: 'Review' };

// review tab inserted after 'instance' (index 1) only when agentic review is pending
const REVIEW_INSERT_INDEX = 2;

export default function DetailTabBar() {
  const { entityType, activeTab, setTab } = usePanelContext();
  const actions = useItemActions();

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
