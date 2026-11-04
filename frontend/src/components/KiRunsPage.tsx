import React from 'react';
import PipelineCockpit from './PipelineCockpit';

// The KI cockpit route (/ki): a surface to manage the enrichment pipeline's data quality as a whole —
// global levers + health now, findings aggregation next. Deliberately NOT an item list (that lives at
// /items); the cockpit's angle is aggregate control, not per-row browsing.
export default function KiRunsPage(): JSX.Element {
  return <PipelineCockpit />;
}
