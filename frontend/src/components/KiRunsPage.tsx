import React from 'react';
import ItemListPage from './ItemListPage';

// The standalone KI-Runs workbench. It reuses the ItemListPage shell in its 'ki' variant rather than
// forking it — the KI list is the same inventory seen through an AI-status lens (shared work queue),
// so one component keeps filters, columns and bulk actions in lockstep. A dedicated page (vs. an inline
// element in the router) gives the surface a home to grow richer KI columns/filters into.
export default function KiRunsPage(): JSX.Element {
  return <ItemListPage variant="ki" />;
}
