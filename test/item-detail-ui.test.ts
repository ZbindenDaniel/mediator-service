// import React from 'react';
// import { renderToStaticMarkup } from 'react-dom/server';

// import {
//   AgenticStatusCard,
//   AgenticStatusCardProps,
//   agenticStatusDisplay,
//   isAgenticRunInProgress
// } from '../frontend/src/components/ItemDetail';
// import type { AgenticRun } from '../models';

// // TODO: Expand these tests to cover the full ItemDetail component once dedicated fetch mocks exist.

// function buildRun(overrides: Partial<AgenticRun> = {}): AgenticRun {
//   return {
//     Id: 1,
//     ItemUUID: 'test-item',
//     SearchQuery: null,
//     Status: 'pending',
//     LastModified: new Date().toISOString(),
//     ReviewState: 'not_required',
//     ReviewedBy: null,
//     ...overrides
//   };
// }

// function renderCardForRun(run: AgenticRun, overrides: Partial<AgenticStatusCardProps> = {}) {
//   const normalizedStatus = (run.Status || '').toLowerCase();
//   const status = agenticStatusDisplay(run);
//   const props: AgenticStatusCardProps = {
//     status,
//     rows: [],
//     actionPending: false,
//     reviewIntent: null,
//     error: null,
//     needsReview: (run.ReviewState || '').toLowerCase() === 'pending',
//     hasFailure: ['failed', 'error', 'errored', 'cancelled', 'canceled'].includes(normalizedStatus),
//     isInProgress: isAgenticRunInProgress(run),
//     onRestart: () => undefined,
//     onReview: () => undefined,
//     onCancel: () => undefined,
//     ...overrides
//   };

//   return renderToStaticMarkup(React.createElement(AgenticStatusCard, props));
// }

// describe('AgenticStatusCard progress spinner', () => {
//   test('shows spinner while the run is pending', () => {
//     const run = buildRun({ Status: 'pending', ReviewState: 'not_required' });
//     const html = renderCardForRun(run);

//     expect(html).toContain('status-spinner');
//   });

//   test('hides spinner after a review decision even if status is review pending', () => {
//     const run = buildRun({ Status: 'pending_review', ReviewState: 'approved' });
//     const html = renderCardForRun(run);

//     expect(html).not.toContain('status-spinner');
//   });

//   test('hides spinner once the run reports completion', () => {
//     const run = buildRun({ Status: 'completed', ReviewState: 'approved' });
//     const html = renderCardForRun(run);

//     expect(html).not.toContain('status-spinner');
//   });
// });

// describe('AgenticStatusCard cancel button', () => {
//   test('renders cancel button while a run is still in progress', () => {
//     const run = buildRun({ Status: 'running', ReviewState: 'not_required' });
//     const html = renderCardForRun(run);

//     expect(html).toContain('Abbrechen');
//   });

//   test('hides cancel button once a run is approved', () => {
//     const run = buildRun({ Status: 'pending_review', ReviewState: 'approved' });
//     const html = renderCardForRun(run);

//     expect(html).not.toContain('Abbrechen');
//   });

//   test('hides cancel button for completed runs', () => {
//     const run = buildRun({ Status: 'completed', ReviewState: 'not_required' });
//     const html = renderCardForRun(run);

//     expect(html).not.toContain('Abbrechen');
//   });
// });
