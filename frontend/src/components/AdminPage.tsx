import React from 'react';
import ImportCard from './ImportCard';
import ShelfCreateForm from './ShelfCreateForm';
import ExportCard from './admin/ExportCard';
import PrintQueueCard from './admin/PrintQueueCard';
import AgenticOverviewCard from './admin/AgenticOverviewCard';
import SystemStatusCard from './admin/SystemStatusCard';

export default function AdminPage() {
  return (
    <div className="admin-page">
      <h1 className="admin-page__title">Administration</h1>
      <div className="admin-page__grid">
        <ImportCard />
        <ExportCard />
        <ShelfCreateForm />
        <PrintQueueCard />
        <AgenticOverviewCard />
        <SystemStatusCard />
      </div>
    </div>
  );
}
