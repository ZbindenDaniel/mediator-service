import React from 'react';
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom';
import Layout from './Layout';
import BoxDetail from './BoxDetail';
import ItemDetail from './ItemDetail';
import ItemEdit from './ItemEdit';
import LandingPage from './LandingPage';
import BoxEdit from './BoxEdit';
import ItemCreate from './ItemCreate';
import ItemListPage from './ItemListPage';

function BoxRoute() {
  const { boxId } = useParams();
  return boxId ? <BoxDetail boxId={boxId} /> : <div>Missing box</div>;
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
  return boxId ? <BoxEdit boxId={boxId} /> : <div>Missing box</div>;
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/boxes/:boxId" element={<BoxRoute />} />
          <Route path="/boxes/:boxId/edit" element={<BoxEditRoute />} />
          <Route path="/items" element={<ItemListPage />} />
          <Route path="/items/new" element={<ItemCreate />} />
          <Route path="/items/:itemId" element={<ItemRoute />} />
          <Route path="/items/:itemId/edit" element={<ItemEditRoute />} />
        </Routes>
      </Layout>
    </Router>
  );
}
