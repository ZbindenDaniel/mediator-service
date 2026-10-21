import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './Layout';
import { DialogProvider } from './dialog';
import { PanelProvider, usePanelContext } from '../context/PanelContext';
import { UserMarksProvider } from '../context/UserMarksContext';
import { TaxonomyProvider } from '../context/TaxonomyContext';
import { IdentityProvider } from '../context/IdentityContext';
import { FeaturesProvider, useFeatures } from '../context/FeaturesContext';
import BoxDetail from './BoxDetail';
import ItemDetail from './ItemDetail';
import ItemEdit from './ItemEdit';
import QrScannerPage from './QrScannerPage';
import BoxEdit from './BoxEdit';
import ItemCreate from './ItemCreate';
import ItemListPage from './ItemListPage';
import BoxListPage from './BoxListPage';
import RecentActivitiesPage from './RecentActivitiesPage';
import ChatPlaceholder from './ChatPlaceholder';
import ShelfCreateForm from './ShelfCreateForm';
import AdminPage from './AdminPage';
import TaxonomyAdminPage from './admin/TaxonomyAdminPage';
import OrganisationsAdminPage from './admin/OrganisationsAdminPage';
import PlacementScanView from './PlacementScanView';
import StubListPage from './StubListPage';
import HilfePage from './HilfePage';
import EinzelteilePage from './einzelteile/EinzelteilePage';
import { createScanDetector } from '../utils/scannerDetection';
import { applySimpleModeClass } from '../lib/simpleMode';

// TODO(agent): Confirm admin-only shelf create route visibility expectations with product.

function BoxRoute() {
  const { boxId } = useParams();
  const { setEntity } = usePanelContext();
  // populate the panel so panel-detail shows BoxDetail for direct /boxes/:id deep links
  useEffect(() => {
    if (boxId) {
      setEntity('box', boxId);
    }
  }, [boxId, setEntity]);
  return boxId ? <BoxDetail boxId={boxId} /> : <div>Behälter fehlt</div>;
}

function ItemRoute() {
  const { itemId } = useParams();
  const { setEntity } = usePanelContext();
  // populate the panel so panel-detail shows ItemDetail for direct /items/:id deep links
  useEffect(() => {
    if (itemId) {
      setEntity('item', itemId);
    }
  }, [itemId, setEntity]);
  return itemId ? <ItemDetail itemId={itemId} /> : <div>Missing item</div>;
}

function ItemEditRoute() {
  const { itemId } = useParams();
  return itemId ? <ItemEdit itemId={itemId} /> : <div>Missing item</div>;
}

function BoxEditRoute() {
  const { boxId } = useParams();
  return boxId ? <BoxEdit boxId={boxId} /> : <div>Behälter fehlt</div>;
}

export function AppRoutes() {
  const features = useFeatures();
  // Disabled pages fall back to the start page, so old bookmarks don't open blocked features.
  const gate = (enabled: boolean, element: React.ReactElement) => (enabled ? element : <Navigate to="/" replace />);
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/items?entity=item&tab=create" replace />} />
      <Route path="/boxes" element={<BoxListPage />} />
      <Route path="/boxes/:boxId" element={<BoxRoute />} />
      <Route path="/boxes/:boxId/edit" element={<BoxEditRoute />} />
      <Route path="/items" element={<ItemListPage />} />
      <Route path="/items/new" element={<ItemCreate />} />
      <Route path="/items/:itemId" element={<ItemRoute />} />
      <Route path="/items/:itemId/edit" element={<ItemEditRoute />} />
      <Route path="/items/:itemId/einzelteile" element={<EinzelteilePage />} />
      <Route path="/scan" element={gate(features['qr-scan'], <QrScannerPage />)} />
      <Route path="/activities" element={gate(features.logs, <RecentActivitiesPage />)} />
      <Route path="/stubs" element={gate(features.stubs, <StubListPage />)} />
      <Route path="/chat" element={gate(features.agentic, <ChatPlaceholder />)} />
      <Route path="/placement/:targetId" element={gate(features['qr-scan'], <PlacementScanView />)} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/organisationen" element={<OrganisationsAdminPage />} />
      <Route path="/admin/taxonomy" element={gate(features['admin-taxonomy'], <TaxonomyAdminPage />)} />
      <Route path="/admin/shelves/new" element={<Navigate to="/admin" replace />} />
      <Route path="/hilfe" element={gate(features.help, <HilfePage />)} />
    </Routes>
  );
}

export default function App() {
  // Apply the stored simple-mode preference to <body> once on load; all hiding is CSS-driven.
  useEffect(() => {
    applySimpleModeClass();
  }, []);

  useEffect(() => {
    const detector = createScanDetector();
    const onKeyDown = (event: KeyboardEvent) => {
      // Capture phase runs before React handlers and native implicit form submission, so
      // cancelling the scanner's trailing Enter here stops any form from submitting. Only
      // machine-fast Enter bursts are cancelled; human Enter-to-submit is preserved.
      if (detector.observe(event.key, event.timeStamp, event.repeat)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return (
    <FeaturesProvider>
    <IdentityProvider>
      <Router>
        <DialogProvider>
          <PanelProvider>
            <UserMarksProvider>
              <TaxonomyProvider>
                <Layout>
                  <AppRoutes />
                </Layout>
              </TaxonomyProvider>
            </UserMarksProvider>
          </PanelProvider>
        </DialogProvider>
      </Router>
    </IdentityProvider>
    </FeaturesProvider>
  );
}
