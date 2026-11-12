/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import UserSettingsDialog from '../UserSettingsDialog';
import { IdentityContext } from '../../context/IdentityContext';
import { FeaturesContext } from '../../context/FeaturesContext';
import type { FeatureSet } from '../../context/FeaturesContext';
import { FEATURE_KEYS } from '../../../../models/features';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function show(printing = true) {
  const features = Object.fromEntries(FEATURE_KEYS.map(key => [key, key === 'printing' ? printing : true])) as FeatureSet;
  return render(<FeaturesContext.Provider value={features}>
    <IdentityContext.Provider value={{ authenticated: true, username: 'Operator', groups: [], tenant: 'workshop', tenantLabel: 'Workshop', role: 'normal', isPlatformAdmin: false }}>
      <UserSettingsDialog currentUser="Operator" currentSimpleMode={false} onSave={() => {}} onCancel={() => {}} />
    </IdentityContext.Provider>
  </FeaturesContext.Provider>);
}

test('ordinary users can download the configured CA from the same host', async () => {
  global.fetch = jest.fn(async () => ({ ok: true })) as any;
  show();
  const link = await screen.findByRole('link', { name: 'Zertifikat herunterladen' });
  expect(link.getAttribute('href')).toBe('/api/print/proxy-ca.crt');
  expect(link.hasAttribute('download')).toBe(true);
  expect(global.fetch).toHaveBeenCalledWith('/api/print/proxy-ca.crt', expect.objectContaining({ method: 'HEAD', cache: 'no-store' }));
});

test('does not offer a missing certificate', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as any;
  show();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('link', { name: 'Zertifikat herunterladen' })).toBeNull();
});

test('does not probe or offer the download when printing is disabled', () => {
  global.fetch = jest.fn();
  show(false);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: 'Zertifikat herunterladen' })).toBeNull();
});
