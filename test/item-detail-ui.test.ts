// import React from 'react';
// import { renderToStaticMarkup } from 'react-dom/server';

// import {
//   AgenticStatusCard,
//   AgenticStatusCardProps,
//   agenticStatusDisplay
// } from '../frontend/src/components/ItemDetail';
// import { dialogService } from '../frontend/src/components/dialog';
// import type { DialogContextValue } from '../frontend/src/components/dialog';
// import type { AgenticRun } from '../models';

// const testDialog: DialogContextValue = {
//   alert: async () => undefined,
//   confirm: async () => true,
//   prompt: async () => ''
// };

// beforeAll(() => {
//   dialogService.register(testDialog);
// });

// afterAll(() => {
//   dialogService.unregister(testDialog);
// });

// describe('AgenticStatusCard cancel button visibility', () => {
//   function renderCard(overrides: Partial<AgenticStatusCardProps> = {}) {
//     const props: AgenticStatusCardProps = {
//       status: {
//         label: 'Test',
//         className: 'pill status status-info',
//         description: 'Beschreibung',
//         variant: 'info',
//         needsReviewBadge: false,
//         isTerminal: false
//       },
//       rows: [],
//       actionPending: false,
//       reviewIntent: null,
//       error: null,
//       needsReview: false,
//       hasFailure: false,
//       isInProgress: false,
//       onRestart: () => undefined,
//       onReview: () => undefined,
//       onCancel: () => undefined,
//       ...overrides
//     };
//     return renderToStaticMarkup(React.createElement(AgenticStatusCard, props));
//   }

//   test('renders cancel button when review is pending', () => {
//     const html = renderCard({ needsReview: true });
//     expect(html).toContain('Abbrechen');
//   });

//   test('renders cancel button when no review is required', () => {
//     const html = renderCard({ needsReview: false, hasFailure: true });
//     expect(html).toContain('Abbrechen');
//   });
// });

// describe('AgenticStatusCard progress spinner', () => {
//   function renderCard(overrides: Partial<AgenticStatusCardProps> = {}) {
//     const props: AgenticStatusCardProps = {
//       status: {
//         label: 'Test',
//         className: 'pill status status-info',
//         description: 'Beschreibung',
//         variant: 'info',
//         needsReviewBadge: false,
//         isTerminal: false
//       },
//       rows: [],
//       actionPending: false,
//       reviewIntent: null,
//       error: null,
//       needsReview: false,
//       hasFailure: false,
//       isInProgress: false,
//       onRestart: () => undefined,
//       onReview: () => undefined,
//       onCancel: () => undefined,
//       ...overrides
//     };
//     return renderToStaticMarkup(React.createElement(AgenticStatusCard, props));
//   }

//   test('renders spinner for in-progress states', () => {
//     const html = renderCard({ isInProgress: true });
//     expect(html).toContain('status-spinner');
//   });

//   test('hides spinner when not in progress', () => {
//     const html = renderCard({ isInProgress: false });
//     expect(html).not.toContain('status-spinner');
//   });
// });

// describe('agenticStatusDisplay', () => {
//   function buildRun(overrides: Partial<AgenticRun>): AgenticRun {
//     return {
//       Id: 1,
//       ItemUUID: 'test-item',
//       SearchQuery: null,
//       Status: 'pending',
//       LastModified: new Date().toISOString(),
//       ReviewState: 'not_required',
//       ReviewedBy: null,
//       ...overrides
//     };
//   }

//   test('maps pending review status to localized labels', () => {
//     const run = buildRun({ Status: 'pending_review', ReviewState: 'pending' });
//     const display = agenticStatusDisplay(run);
//     expect(display.label).toBe('Review ausstehend');
//     expect(display.description).toBe('Das Ergebnis wartet auf Freigabe.');
//     expect(display.variant).toBe('pending');
//     expect(display.needsReviewBadge).toBe(true);
//   });

//   test('uses review state for approved decisions', () => {
//     const run = buildRun({ Status: 'completed', ReviewState: 'approved' });
//     const display = agenticStatusDisplay(run);
//     expect(display.label).toBe('Freigegeben');
//     expect(display.description).toBe('Das Ergebnis wurde freigegeben.');
//     expect(display.variant).toBe('success');
//     expect(display.isTerminal).toBe(true);
//   });

//   test('uses review state for rejected decisions', () => {
//     const run = buildRun({ Status: 'completed', ReviewState: 'rejected' });
//     const display = agenticStatusDisplay(run);
//     expect(display.label).toBe('Abgelehnt');
//     expect(display.description).toBe('Das Ergebnis wurde abgelehnt.');
//     expect(display.variant).toBe('error');
//     expect(display.isTerminal).toBe(true);
//   });
// });
