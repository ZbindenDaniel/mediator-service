import React from 'react';
import { dialogService } from '../components/dialog';
import { logError } from '../utils/logger';

interface OrgInfo {
  id: string;
  label: string;
  contactEmail: string | null;
}

// Opened where another org's item shows the owner's name instead of a box/shelf (tenancy 3b):
// that name is not a location to navigate to, so it explains who holds the item and how to reach them.
export async function openOrgInfo(orgId: string | null | undefined, fallbackLabel?: string | null): Promise<void> {
  let info: OrgInfo | null = null;
  const id = (orgId ?? '').trim();
  if (id) {
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(id)}`);
      if (res.ok) info = (await res.json()) as OrgInfo;
    } catch (error) {
      logError('Failed to load organisation info', error, { orgId: id });
    }
  }
  const label = info?.label || fallbackLabel || 'Andere Organisation';
  await dialogService.alert({
    title: label,
    confirmLabel: 'Schliessen',
    message: (
      <div className="org-info">
        <p>Dieser Artikel gehört <strong>{label}</strong>. Der genaue Lagerort ist nur für diese Organisation sichtbar.</p>
        {info?.contactEmail ? (
          <p>
            Kontakt: <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a>
          </p>
        ) : (
          <p className="muted">Keine Kontaktadresse hinterlegt.</p>
        )}
      </div>
    )
  });
}
