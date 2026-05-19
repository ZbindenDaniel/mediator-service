import React, { useEffect } from 'react';
import { GoDependabot, GoFileMedia, GoInfo, GoPaperclip, GoPencil, GoCpu, GoLog, GoTag, GoPlug } from 'react-icons/go';
import { usePanelContext } from '../context/PanelContext';

interface TabDef {
  id: string;
  label: string;
  icon: React.ReactElement;
}

interface Props {
  /** Dot indicator on the KI tab when an agentic review is pending. */
  agenticNeedsReview?: boolean;
}

const ITEM_BASE_TABS: TabDef[] = [
  { id: 'instance', label: 'Vorrat', icon: <GoCpu aria-hidden="true" /> },
  { id: 'reference', label: 'Referenz', icon: <GoTag aria-hidden="true" /> },
  { id: 'ki', label: 'KI', icon: <GoDependabot aria-hidden="true" /> },
  { id: 'images', label: 'Bilder', icon: <GoFileMedia aria-hidden="true" /> },
  { id: 'attachments', label: 'Anhänge', icon: <GoPaperclip aria-hidden="true" /> },
  { id: 'accessories', label: 'Zubehör', icon: <GoPlug aria-hidden="true" /> },
  { id: 'events', label: 'Aktivitäten', icon: <GoLog aria-hidden="true" /> },
];

const BOX_BASE_TABS: TabDef[] = [
  { id: 'info', label: 'Info', icon: <GoInfo aria-hidden="true" /> },
  { id: 'notizen', label: 'Notizen', icon: <GoPencil aria-hidden="true" /> },
  { id: 'items', label: 'Artikel', icon: <GoCpu aria-hidden="true" /> },
  { id: 'events', label: 'Aktivitäten', icon: <GoLog aria-hidden="true" /> },
];

const STUBS_TAB: TabDef = { id: 'stubs', label: 'Stubs', icon: <GoTag aria-hidden="true" /> };

function isShelfId(boxId: string): boolean {
  try {
    return boxId.trim().toUpperCase().startsWith('S-');
  } catch {
    return false;
  }
}

export default function DetailTabBar({ agenticNeedsReview = false }: Props) {
  const { entityType, entityId, activeTab, setTab } = usePanelContext();

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      let tabs: TabDef[];
      let effective: string;
      if (entityType === 'box' && entityId) {
        tabs = isShelfId(entityId) ? [...BOX_BASE_TABS, STUBS_TAB] : BOX_BASE_TABS;
        effective = activeTab ?? 'info';
      } else if (entityType === 'item') {
        tabs = ITEM_BASE_TABS;
        effective = (activeTab === 'review' ? 'ki' : activeTab) ?? 'instance';
      } else {
        return;
      }

      const idx = tabs.findIndex((t) => t.id === effective);
      if (event.key === 'ArrowLeft' && idx > 0) {
        event.preventDefault();
        setTab(tabs[idx - 1].id);
      } else if (event.key === 'ArrowRight' && idx < tabs.length - 1) {
        event.preventDefault();
        setTab(tabs[idx + 1].id);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [entityType, entityId, activeTab, setTab]);

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
            title={tab.label}
            aria-label={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </nav>
    );
  }

  if (entityType !== 'item') return null;

  // 'review' was a separate tab; it's merged into 'ki' so old URLs still work visually.
  const effective = (activeTab === 'review' ? 'ki' : activeTab) ?? 'instance';

  return (
    <nav className="detail-tab-bar" aria-label="Artikel-Tabs">
      {ITEM_BASE_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`detail-tab-bar__tab${effective === tab.id ? ' is-active' : ''}`}
          onClick={() => setTab(tab.id)}
          aria-current={effective === tab.id ? 'page' : undefined}
          title={tab.label}
          aria-label={tab.label}
        >
          {tab.icon}
          {tab.id === 'ki' && agenticNeedsReview && <span className="tab-badge" aria-label="Review ausstehend" />}
        </button>
      ))}
    </nav>
  );
}
