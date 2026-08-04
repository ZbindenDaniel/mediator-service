import React, { useEffect } from 'react';
import { GoDependabot, GoFileMedia, GoInfo, GoPaperclip, GoPencil, GoCpu, GoLog, GoTag, GoPlug, GoBookmark } from 'react-icons/go';
import { usePanelContext } from '../context/PanelContext';

interface TabDef {
  id: string;
  label: string;
  icon: React.ReactElement;
  /**
   * Keep visible in simple mode. Simple mode hides by default: any tab without
   * this flag disappears when simple mode is on, so new tabs are hidden unless
   * explicitly opted in here. See lib/simpleMode.ts and styles.scss.
   */
  keepInSimple?: boolean;
}

interface Props {
  /** Dot indicator on the KI tab when an agentic review is pending. */
  agenticNeedsReview?: boolean;
  /** Dot indicator on the Markierung tab when the item is marked by the current user. */
  isMarked?: boolean;
}

// keepInSimple marks the tabs that stay visible in simple mode. The deliberately
// hidden ones (ki/attachments/accessories) simply omit it; any future tab added
// without it is hidden in simple mode by default.
const ITEM_BASE_TABS: TabDef[] = [
  { id: 'instance', label: 'Vorrat', icon: <GoCpu aria-hidden="true" />, keepInSimple: true },
  { id: 'reference', label: 'Referenz', icon: <GoTag aria-hidden="true" />, keepInSimple: true },
  { id: 'ki', label: 'KI', icon: <GoDependabot aria-hidden="true" /> },
  { id: 'images', label: 'Bilder', icon: <GoFileMedia aria-hidden="true" />, keepInSimple: true },
  { id: 'attachments', label: 'Anhänge', icon: <GoPaperclip aria-hidden="true" /> },
  { id: 'accessories', label: 'Zubehör', icon: <GoPlug aria-hidden="true" /> },
  { id: 'events', label: 'Aktivitäten', icon: <GoLog aria-hidden="true" />, keepInSimple: true },
  { id: 'markierung', label: 'Markierung', icon: <GoBookmark aria-hidden="true" />, keepInSimple: true },
];

const BOX_BASE_TABS: TabDef[] = [
  { id: 'info', label: 'Info', icon: <GoInfo aria-hidden="true" />, keepInSimple: true },
  { id: 'notizen', label: 'Notizen', icon: <GoPencil aria-hidden="true" />, keepInSimple: true },
  { id: 'items', label: 'Artikel', icon: <GoCpu aria-hidden="true" />, keepInSimple: true },
  { id: 'events', label: 'Aktivitäten', icon: <GoLog aria-hidden="true" />, keepInSimple: true },
];

const STUBS_TAB: TabDef = { id: 'stubs', label: 'Fundsachen', icon: <GoTag aria-hidden="true" />, keepInSimple: true };

function isShelfId(boxId: string): boolean {
  try {
    return boxId.trim().toUpperCase().startsWith('S-');
  } catch {
    return false;
  }
}

export default function DetailTabBar({ agenticNeedsReview = false, isMarked = false }: Props) {
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
            data-simple-keep={tab.keepInSimple ? 'true' : undefined}
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
          data-simple-keep={tab.keepInSimple ? 'true' : undefined}
          className={`detail-tab-bar__tab${effective === tab.id ? ' is-active' : ''}`}
          onClick={() => setTab(tab.id)}
          aria-current={effective === tab.id ? 'page' : undefined}
          title={tab.label}
          aria-label={tab.label}
        >
          {tab.icon}
          {tab.id === 'ki' && agenticNeedsReview && <span className="tab-badge" aria-label="Review ausstehend" />}
          {tab.id === 'markierung' && isMarked && <span className="tab-badge" aria-label="Markiert" />}
        </button>
      ))}
    </nav>
  );
}
