# PLANNING — AI Runs Optimization

> **Status:** in progress. ✅ Phase 1a shipped (Thread 5 Ollama timeout + Thread 4B queue-transition observability, agentic #915) · ✅ Phase 1b shipped (Thread 2A search-evidence surfaced in the KI tab, agentic #916). Next: phase 2 (Thread 4A/4C state-machine correctness), then grounding (Thread 1) and rework closure (Thread 3). Open questions in §6 still need a brainstorm before their phases.
> **Domain:** [agentic](changelogs/agentic.md) · Runbooks: [item-flow](detailed/item-flow.md), [review-flow](detailed/review-flow.md), [agentic-basics](detailed/agentic-basics.md)
> **Goal:** make agentic runs cheaper, more accurate, and — above all — **legible and steerable**: an operator should always be able to see what a run did, why it is in the state it is in, and act on it without restarting from zero.

---

## 1. The problem, as reported

Three operator-facing symptoms plus one state-machine bug surfaced during scoping:

1. **Bad `Artikelbeschreibung` derails the whole run.** A misleading free-text description sends the search off the rails (a PC was once catalogued as a Pokémon card set). The run then confidently extracts data for the wrong thing.
2. **No visibility into existing search results.** It is not clear whether an item already has stored search evidence, what was searched, or how many queries a run burned.
3. **Rework is not "closed down."** "KI Überarbeitung" exists but is unintuitive — you cannot reach it at the moment you actually notice a wrong field (during review), and a failed rework destroys the item's prior good state.
4. **Waiting runs silently fall to `failed`, untraceably.** Runs that look like they are "waiting" end up `failed` with no usable trail in the logs.
5. **Ollama first-token timeouts (`UND_ERR_HEADERS_TIMEOUT`) burn runs.** The local model is slow to return the first response headers (cold VRAM load / GPU contention / heavy prompt); undici times out, and the retry re-sends the whole prompt into the same wall.

The unifying thread: **a run is currently an opaque object.** You can start it and read a final status, but you cannot see its evidence, its state history, or steer it mid-flight. #2 and #4 are two faces of the same opacity; #1 is the input-quality problem upstream; #3 is the "act on the result" problem downstream. This doc proposes to treat them as one design centred on **run transparency + steerability**, with grounding as the upstream quality fix.

---

## 2. Root-cause analysis (grounded in code)

### Thread 1 — Grounding: the search anchor is the raw free-text

The primary search query **is** the `Artikelbeschreibung`, verbatim:

- Trigger sets `searchQuery = artikelbeschreibung` — `backend/actions/agentic-trigger.ts:156`.
- The contract-audit re-queue path does the same — `SearchQuery: candidate.Artikelbeschreibung ?? candidate.Artikel_Nummer` (`backend/agentic/index.ts:1401`).
- The primary search plan is `Gerätedaten ${searchTerm}` and the planner receives `searchTerm` as its **authoritative** basis — `backend/agentic/flow/item-flow-search.ts:937`, `prompts/search-planner.md`.

There is no structured identity anchor. We often *know* more than the free-text: `Hersteller` is a first-class field, the intake scan carries `vendor`/`model`/`cpu`, and the item usually has a `SubCategory`. None of that is forced into the anchor when the free-text is unreliable.

**Worse, nothing gates acceptance.** After search, results flow straight into extraction (`runExtractionAttempts`, `docs/detailed/item-flow.md` §4). If the sources are about Pokémon cards, extraction happily extracts Pokémon-card data — there is no check that the retrieved evidence is even the same *kind of thing* as the item's known category. The bad description poisons the anchor, and the absent relevance gate lets the poison through to the output.

### Thread 2 — Search-result visibility: persisted but never surfaced

Search sources **are** persisted: `persistAgenticSearchLinks` writes `LastSearchLinksJson` the moment results arrive (`backend/agentic/invoker.ts:931-936`), and they are read back for reuse (`invoker.ts:874-900`). The reuse-vs-live decision is a single, sensible choke point ("search at most once until reset").

But **nothing in `frontend/src` ever reads `LastSearchLinksJson`.** Confirmed: zero references. So the operator cannot see:
- whether stored evidence exists for this item,
- what URLs/domains were consulted,
- how many queries ran (todo #24), or
- whether the last run reused stored search or went live.

The data is there; the window into it is missing. (todo #21, #24.)

### Thread 3 — Rework not closed down

Rework ("KI Überarbeitung") is real (`applyReworkPartialUpdate`, `docs/detailed/item-flow.md` §"Rework mode"), but two gaps make it feel unfinished:

- **Unreachable when you need it.** `canRework = !needsReview && Boolean(onReworkSubmit) && (reworkFieldOptions?.length ?? 0) > 0` (`frontend/src/components/item-tabs/ItemKiTab.tsx:72`). Rework is hidden during `review` — the exact moment an operator spots a wrong field. During review you can only accept, reject, or restart the *entire* run.
- **No failure closure.** A failed rework lands in `failed` like any other run (`docs/detailed/item-flow.md` §"Rework mode" and todo #50 "Deferred behavior"). So a targeted fix on an already-good item can *demote* it from `approved` to `failed`, losing the prior result. The intended policy ("on rework failure, discard changes and keep prior `approved` state") is documented as deferred and **not implemented**.

### Thread 4 — Waiting → failed, untraceable

There is **no `waiting` status** — `waiting` normalizes to `queued` (`models/agentic-statuses.ts:42`). A "waiting" run is a `queued` run held below the concurrency cap. Three distinct queue-level paths turn such runs into `failed`, each with only a `logger.warn` and a terse `LastError` code:

| Path | Trigger | `LastError` | Code ref |
|---|---|---|---|
| `missing-search-query` | queued run dispatched with empty `SearchQuery` | `missing-search-query` | `index.ts:1220-1242` |
| `stale-run-auto-cancelled` | `running` > 10 min (`STALE_RUN_TIMEOUT_MINUTES`) | `stale-run-auto-cancelled` | `index.ts:1100-1119` |
| `over-cap-cancelled` | more `running` rows than the cap | `over-cap-cancelled` | `index.ts:1138-1155` |

Problems this creates:

- **Silent demotion.** A reset clears `SearchQuery` (#876). If such a row is re-queued, the very next dispatch tick fails it with `missing-search-query` — no operator action, no event. This is the most likely "waiting run fell to failed."
- **Infra-cancel conflated with pipeline-fail.** `over-cap-cancelled` and `stale-run-auto-cancelled` are *infrastructure* decisions (capacity, zombie reclaim), not "the extraction failed." Collapsing them into the same terminal `failed` as a genuine schema/provider error makes the two indistinguishable.
- **No trace.** These transitions never call `logEvent`, so the item's history shows nothing (event-log coverage gap, todo #25). There is no per-run transition audit; `LastError` carries a code but not the sequence that led there. The failure descriptions *are* mapped for the UI (`frontend/src/lib/agentic.ts:13,24,25`), so the operator sees "Kapazitätsgrenze erreicht" — but cannot reconstruct *why this run* got there.
- **State lost on restart.** `pendingSkipSearch`, `pendingRework`, `pendingOcrImageData` are in-memory Maps (`index.ts`), dropped on restart (todo #49). A queued run that depended on one loses it silently.

### Thread 5 — Ollama first-token timeout

The recurring production error:

```
TypeError: fetch failed … at withLlmRetry (invoker.js:70)
  cause: HeadersTimeoutError  code: 'UND_ERR_HEADERS_TIMEOUT'
msg: 'LLM transient failure; retrying', label: 'ollama.invoke', attempt: 1
```

`ChatOllama` runs on global `fetch` (undici) with **no custom dispatcher** (`invoker.ts:490`). The current mitigation is retry + `keepAlive: '10m'` (`invoker.ts:48`, `withLlmRetry` `invoker.ts:67`) — explicitly chosen over a dispatcher fix (todo 0z2: *"Ollama undici `headersTimeout` mitigated via keepAlive+retry rather than a custom dispatcher"*). Two reasons it still fails:

- **The wall is never moved.** undici's `headersTimeout` is not raised, so a *legitimately* slow first token (large `num_ctx`, the heavy categorizer prompt — todo 0-1) is misclassified as a transport failure. Each of the 3 retries re-sends the entire prompt and hits the **same** timeout, so a slow-but-healthy model exhausts retries and the run terminates `failed`.
- **Retry throws away work.** A re-send restarts generation from scratch, wasting the compute already spent and multiplying GPU contention — the very condition that caused the timeout.

Retry is the right tool for a genuine *cold load* (warms up between attempts); it is the wrong tool for "the model is just slow to first byte." Compounds with todo 0-1 (categorizer context overflow): a bloated prompt raises first-token latency **and** empty-completion risk at once.

---

## 3. Proposed direction (options + recommendation per thread)

Each thread lists options; the **bold** one is the recommendation to carry into the brainstorm.

### Thread 1 — Grounding

- **A. Structured-identity anchor (recommended).** Build the primary query from what we *know*: `Hersteller` + `SubCategory` label + model/type tokens (from intake `model`/`deviceLabelText`), and demote raw `Artikelbeschreibung` to a secondary/fallback plan. When free-text and structured identity disagree, trust structure.
- **C. Categorize-first (recommended, pairs with A).** Resolve the category *before* search (from intake category when present, else a cheap categorizer pass) so the category is a hard constraint on both the query and acceptance. Aligns with todo #11 ("assure category then start extraction").
- **B. Relevance/sanity gate (recommended as safety net).** After search, a cheap check that retrieved sources are consistent with the known category/type; on divergence, discard the off-topic sources and either re-anchor or route to `review` with a clear reason — never extract from mismatched evidence. This is the structural guard against the Pokémon failure mode.
- D. Do nothing structural, only tighten the planner prompt. Rejected: prompt-only fixes don't help when the *input string itself* is wrong.

**Recommendation: A + C as the fix, B as the guard.** A/C stop the anchor from being poisoned; B stops poison that slips through from reaching the output.

### Thread 2 — Search-result visibility

- **A. Read-only "Suchergebnisse" panel in the KI tab (recommended first).** Render `LastSearchLinksJson` (title / domain / url), the per-run query count, and a "reused stored search / live search" indicator. Pure visibility, no behavior change.
- B. Curation (follow-up). Pin/remove sources, add a manual link, "search again to refresh." Feeds Thread 1 (a curated source set is a better grounding input) and todo #21/#22 (WebLinks on ItemRef).

**Recommendation: A first** — it is also the window that makes Thread 4 debuggable, so it doubles as observability.

### Thread 3 — Rework closure

- **B. Rework-failure closure (recommended, the core of "close it down").** A failed rework must restore the pre-rework state (`approved`/`auto_approved`/`review`) instead of dropping to `failed`. Requires the run to remember its pre-rework terminal state (a column, or a saved snapshot) before entering rework.
- **A. Reachable from review (recommended).** Surface targeted rework in the review UI, not only after completion — fix-the-field-you-see-is-wrong without a full restart.
- C. Row-level regenerate on spec rows (follow-up, todo #50).

**Recommendation: B + A.** B removes the "rework can destroy a good item" trap; A puts rework where the operator forms the intent.

### Thread 4 — State machine + observability

- **B. Observability backbone (recommended, do first).** (i) Emit a `logEvent` on every terminal agentic transition (`failed`/`cancelled`/`approved`/`auto_approved`) so item history records it. (ii) One structured transition log line everywhere: `runId`, `from → to`, `reason`, `retryCount`. (iii) Optionally a lightweight per-run transition trail persisted alongside the run. This alone makes #1–#4 traceable.
- **A. Separate infra-cancel from pipeline-fail (recommended).** Give capacity/zombie cancellations a distinct terminal reason class (or re-queue instead of fail when a run was merely waiting / never produced a token), so "waiting got bumped" ≠ "extraction failed."
- **C. Fix the silent `missing-search-query` fail (recommended).** Repair the empty query (fall back to structured identity / `Artikel_Nummer`) rather than failing, and log *why* it was empty. With Thread 1's structured anchor, an empty query should be nearly impossible.
- D. Persist the pending flags (todo #49) so `skipSearch`/rework/OCR survive restart.

**Recommendation: B + A + C**, with D as cleanup. B is the backbone the other three threads borrow.

### Thread 5 — Ollama first-token timeout

- **A. Raise `headersTimeout`/`bodyTimeout` explicitly (recommended).** Give the Ollama client an undici dispatcher (`Agent` with generous `headersTimeout`/`bodyTimeout`) or a custom `fetch`, sized to the worst realistic first-token latency. Stops misclassifying slow-but-healthy generations as failures. Keep retry only for *true* transport drops.
- **B. Cap prompt size / set `numCtx` explicitly (recommended, pairs with A).** Bound `num_ctx` and trim the heaviest prompts (categorizer, todo 0-1) so first-token latency and empty-completion risk both drop. Lower latency shrinks the timeout window A has to cover.
- C. Keep retry as-is. Rejected as the primary fix: it never moves the wall and wastes work — but retain it as the fallback for genuine cold loads/transport drops, layered under A.
- D. Pre-warm the model on startup / dispatch (a tiny priming call) so the first real run isn't the one paying the cold-load cost.

**Recommendation: A + B**, retry (C) retained underneath, D optional. Scope the dispatcher deliberately — see open questions.

---

## 4. The shared backbone

Threads 2 and 4 are the same missing capability from two angles: **the run has no observable record of what it did and how its state moved.** One piece of work serves both — and gives Thread 3 a place to show what a rework changed:

> **Per-run evidence + transition record, surfaced in the KI tab.**
> - Evidence: stored search sources + query count + reuse/live flag (Thread 2A).
> - State: terminal-transition events on the item history + structured `from → to / reason` logging (Thread 4B).

Build this first and the other bugs stop being invisible; grounding (#1) is the upstream quality fix, rework closure (#3) the downstream action fix.

---

## 5. Proposed sequencing

1. **Observability backbone** — Thread 4B + Thread 2A. Low risk, no behavior change, immediately makes everything else diagnosable. *This is where "cheapest high-impact" lives.*
2. **Resilience + state-machine correctness** — Thread 5 A + B (Ollama timeout — arguably do first, it is a live production failure), then Thread 4A + 4C (+ 4D cleanup): stop silent fails; separate infra-cancel from fail; kill the `missing-search-query` trap.
3. **Grounding** — Thread 1 A + C, then B as the safety net.
4. **Rework closure** — Thread 3 B + A.

Each phase is independently shippable and leaves the pipeline better than before.

---

## 6. Open questions for the brainstorm

- **Grounding anchor:** when structured identity (Hersteller/SubCategory/model) and `Artikelbeschreibung` disagree, which wins — always structure, or a confidence heuristic?
- **Relevance gate outcome:** on a category mismatch, do we auto-re-anchor and retry, or stop and route to `review` with the mismatch flagged? (Retry burns a query; review burns operator time.)
- **Infra-cancel semantics:** should a waiting run bumped by the cap **re-queue** (never terminal) rather than get any terminal state at all? If so, `over-cap` stops being a failure entirely.
- **Transition trail storage:** item `events` (reuse existing log) vs a dedicated `agentic_run_transitions` table vs extend the transcript. How much history is worth keeping?
- **Rework pre-state memory:** a `PreReworkStatus` column vs a full pre-rework snapshot for rollback — how much do we need to restore on failure?
- **Rework from review:** does targeted rework during review keep the run in `review` (partial refresh) or move it back through the pipeline?
- **Source curation scope (Thread 2B):** per-run stored sources, or promote to first-class `ItemRef.WebLinks` (todo #22) so curation survives resets?
- **Ollama dispatcher scope (Thread 5A):** a global `setGlobalDispatcher` (affects Tavily/Shopware fetch too) vs a client-scoped dispatcher/`fetch` for Ollama only? And what is the worst-case first-token latency we should size `headersTimeout` for?

---

## 7. Related todo items

Consolidates/relates to: #9 (substatus), #10 (don't discard partial data on field failure), #11 (assure category then extract), #21 (search links in UI), #22 (WebLinks on ItemRef), #23 (normalize bad queries), #24 (track queries per run), #25 (event log coverage), #49 (persist skipSearch/rework), #50 (rework mechanism).
