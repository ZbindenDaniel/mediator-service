import React from 'react';
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom';
// TODO: Assess additional global providers alongside the dialog provider when new cross-cutting concerns emerge.
import Layout from './Layout';
import { DialogProvider } from './dialog';
import BoxDetail from './BoxDetail';
import ItemDetail from './ItemDetail';
import ItemEdit from './ItemEdit';
import LandingPage from './LandingPage';
import QrScannerPage from './QrScannerPage';
import BoxEdit from './BoxEdit';
import ItemCreate from './ItemCreate';
import ItemListPage from './ItemListPage';
import BoxListPage from './BoxListPage';
import RecentActivitiesPage from './RecentActivitiesPage';
import ChatPlaceholder from './ChatPlaceholder';
import ShelfCreateForm from './ShelfCreateForm';

// TODO(agent): Confirm admin-only shelf create route visibility expectations with product.

function BoxRoute() {
  const { boxId } = useParams();
  return boxId ? <BoxDetail boxId={boxId} /> : <div>Behälter fehlt</div>;
}

function ItemRoute() {
  const { itemId } = useParams();
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
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/boxes" element={<BoxListPage />} />
      <Route path="/boxes/:boxId" element={<BoxRoute />} />
      <Route path="/boxes/:boxId/edit" element={<BoxEditRoute />} />
      <Route path="/items" element={<ItemListPage />} />
      <Route path="/items/new" element={<ItemCreate />} />
      <Route path="/items/:itemId" element={<ItemRoute />} />
      <Route path="/items/:itemId/edit" element={<ItemEditRoute />} />
      <Route path="/scan" element={<QrScannerPage />} />
      <Route path="/activities" element={<RecentActivitiesPage />} />
      <Route path="/chat" element={<ChatPlaceholder />} />
      <Route path="/admin/shelves/new" element={<ShelfCreateForm />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <DialogProvider>
        <Layout>
          <AppRoutes />
        </Layout>
      </DialogProvider>
    </Router>
  );
}
