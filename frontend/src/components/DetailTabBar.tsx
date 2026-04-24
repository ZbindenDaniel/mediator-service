import React from 'react';
import { usePanelContext } from '../context/PanelContext';

interface TabDef {
  id: string;
  label: string;
}

interface Props {
  /** Dot indicator on the KI tab when an agentic review is pending. */
  agenticNeedsReview?: boolean;
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

const BOX_BASE_TABS: TabDef[] = [
  { id: 'info', label: 'Info' },
  { id: 'images', label: 'Bilder' },
  { id: 'items', label: 'Artikel' },
  { id: 'events', label: 'Aktivitäten' },
];

const STUBS_TAB: TabDef = { id: 'stubs', label: 'Stubs' };

function isShelfId(boxId: string): boolean {
  try {
    return boxId.trim().toUpperCase().startsWith('S-');
  } catch {
    return false;
  }
}

export default function DetailTabBar({ agenticNeedsReview = false }: Props) {
  const { entityType, entityId, activeTab, setTab } = usePanelContext();

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

  // 'review' was a separate tab; it's merged into 'ki' so old URLs still work visually.
  const effective = (activeTab === 'review' ? 'ki' : activeTab) ?? 'reference';

  return (
    <nav className="detail-tab-bar" aria-label="Artikel-Tabs">
      {ITEM_BASE_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`detail-tab-bar__tab${effective === tab.id ? ' is-active' : ''}`}
          onClick={() => setTab(tab.id)}
          aria-current={effective === tab.id ? 'page' : undefined}
        >
          {tab.label}
          {tab.id === 'ki' && agenticNeedsReview && <span className="tab-badge" aria-label="Review ausstehend" />}
        </button>
      ))}
    </nav>
  );
}
