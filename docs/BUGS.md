# Open Bugs & Issues

This list tracks defects that require fixes. Cross-reference the planning context in [OVERVIEW.md](/docs/OVERVIEW.md) and the component guidance in [../AGENTS.md](../AGENTS.md). When fixing a Bug remove it from this list.

## Current bug focus (v2.3)

1. **Fix eventLog display on item and box detail.** Currently displays nothing. Likely a rendering or data-fetch regression.

2. **Fix agentic runs for references.** Agentic runs are broken for reference items. Runs can be started and run but immediately fall back to not started.

3. **Ensure waiting agentic runs restart on application restart.** All runs in a waiting state should automatically resume when the app restarts. Max-parallel-runs must be respected.

4. **Fix AUTO_PRINT_ITEM_LABEL for multiple instances.** When multiple instances are created, multiple different labels should be printed; currently this does not work correctly.

5. **Transform transcript persistence from HTML to JSON.** Store transcripts in a new location. UI restructuring of the transcript viewer (collapsible, step-separated) follows after persistence is changed.

6. **Fix shelf location display in box item list.** Items in the items list in a box should display the shelf as location when the item or its containing box is on a shelf. Current placement context is incomplete for operators during box workflows.

<!-- TODO(bugs-v2.4): keep this list limited to currently actionable bugs only. -->