import React from 'react';
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom';
import Layout from './Layout';
import BoxList from './BoxList';
import BoxDetail from './BoxDetail';
import ItemDetail from './ItemDetail';
import ItemEdit from './ItemEdit';
import ImportPage from './ImportPage';

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

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<BoxList />} />
          <Route path="/boxes/:boxId" element={<BoxRoute />} />
          <Route path="/items/:itemId" element={<ItemRoute />} />
          <Route path="/items/:itemId/edit" element={<ItemEditRoute />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}
