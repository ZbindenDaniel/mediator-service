# docs/plans/

Designs for features that aren't built yet. When a plan ships, move what is still true into the domain
runbook in [`../detailed/`](../detailed/README.md) and delete the plan — git keeps the history.
Day-to-day tasks are in [`todo.md`](../../todo.md).

| Plan | Status |
|---|---|
| [instance-flow.md](instance-flow.md) | Design — reconcile intake evidence on compute devices against their reference, operator-gated (todo 53) |
| [transport-boxes.md](transport-boxes.md) | Draft, not started — `T-` transports between locations (todo 18) |
| [pricing-and-shop-tags.md](pricing-and-shop-tags.md) | Design, not started — base price × quality-grade factor + instance override; `Mietware` ref flag → Shopware tags (todo 59) |
| [inventory.md](inventory.md) | Draft, not started — passive inventory cycle and inventory day (todo 19b) |

Shipped or folded elsewhere (see git history): AI-runs optimization (remaining phase → todo 0z4),
Shopware integration (→ [detailed/shopware.md](../detailed/shopware.md), todo 54), multi-instance
(→ [ARCHITECTURE.md](../ARCHITECTURE.md)), stub boxes, placement actions, UI architecture, v2.3.
