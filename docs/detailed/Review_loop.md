# Review Loop Trigger Rollout

Reason: prevent confusion about which trigger guidance is already active versus still planned.
Higher-level goal: keep roadmap and expectations aligned while minimizing risky code changes in the current version.

| Status | Trigger guidance |
| --- | --- |
| Implemented now | `missing_spec_trigger` prompt guidance |
| Deferred | `wrong_information_trigger`, `wrong_physical_dimensions_trigger`, `information_present_low_trigger`, proactive `bad_format_trigger` |

## Current behavior (this version)
- Prompt guidance changes are active only for `missing_spec_trigger`.
- No additional trigger rollout is included in this version.

## Next-version behavior (planned)
- Add prompt guidance for `wrong_information_trigger`.
- Add prompt guidance for `wrong_physical_dimensions_trigger`.
- Add prompt guidance for `information_present_low_trigger`.
- Add proactive handling for `bad_format_trigger`.

<!-- TODO(agent-docs): Update this rollout status as deferred triggers move to implemented. -->
