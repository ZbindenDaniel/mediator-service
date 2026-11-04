# Play layer: a lively, rewarding cataloguing and review flow

**Status:** Draft, not started (todo 56). Direction agreed 2026-11-04: a cooperative "daily quest"
model (option A from the gamification discussion), focused on playfulness and novelty, with no
competition.

## 1. Goal

Cataloguing and reviewing are repetitive. The app should **respond** to the operator's work:
short-term goals they can actually reach, small rewards that keep changing, fun facts drawn from the
real data, and transitions that make each step feel like progress.

**Non-goals:** leaderboards, ranking people, performance monitoring, points as currency, anything that
blocks or slows down the work. If a feature makes someone wait, it's out.

## 2. Psychological needs → building blocks

| Need | What the operator gets | Block |
|---|---|---|
| **Novelty** | Rotating reward effects, fun facts and quests drawn from today's real data, rare surprises | §4, §5, §6 |
| **Empowerment** | Pick or re-roll a quest, choose the play level, visible impact ("dein Teil ist jetzt im Shop") | §5, §8 |
| **Oversight** | A "Mein Tag" card: what I did, how close the quest is, how the team is doing | §7 |
| **Playfulness** | Living transitions, small animations, light-hearted copy | §3, §4 |
| **Reward** | Micro-celebrations sized to the achievement (small for routine, big for rare) | §4 |

The guardrails in §8 apply to every block. They are the actual design; the rest is decoration.

## 3. Living transitions (ambient, always on)

Cheap, no backend, and they make the app feel alive even when nothing is being celebrated.

- **Step transitions** in multi-step flows (item create, `AgenticReviewWizard`, `QualityReviewStep`,
  intake): the finished step slides or folds away, and the next one comes in from the side it
  logically lives on. A progress dot fills in with a short tick.
- **Save → result morph:** after "Speichern", the form card collapses into the new item's row/label
  chip instead of hard-swapping the view.
- **Counters roll** (odometer style) when a number on screen changes: box item count, review queue,
  Mein-Tag counts.
- **Scan acknowledgement:** a success pulse on the scanned entity (on top of the existing scan flash).
- **Empty states with character:** an empty review queue says "Alles reviewt. Kaffee?" instead of
  "Keine Einträge".

Rules: ≤ 250 ms, CSS-only where possible (`transform`/`opacity`), never delays input focus or
navigation, and switched off under `prefers-reduced-motion` (styles.scss already has the media block)
and under play level "Aus".

## 4. Reward vocabulary (rotating micro-celebrations)

Instead of one confetti effect, a small **library of effects**, each with a rarity tier. A
celebration draws one effect from its tier at random, skipping the last one used. That gives novelty
without new rules.

| Tier | When | Effects (examples) |
|---|---|---|
| **Klein** | Quest step, routine save that counts | Counter roll + sparkle on the chip, check-mark draw, "+1" float |
| **Mittel** | Quest done, review queue emptied | Confetti (short, corner burst), stamp "Erledigt ✓", label chip does a hop, shelf-colour glow |
| **Selten** | Milestones (§6), first-of-a-kind | Full-width confetti, a falling-parts animation (screws, RAM sticks, a mouse), a one-line headline card |

- Effects are a frontend module (`frontend/src/lib/play/`), lazy-loaded, pure CSS/canvas, no
  dependency over a few KB (e.g. `canvas-confetti` or hand-rolled).
- **Sound:** off by default; one subtle "pling" as an opt-in in user settings.
- Each effect has a reduced-motion fallback (a static badge/toast) so nobody is left out.

## 5. Mini-quests (meaningful short-term goals)

1–3 quests per person per day, **generated from current data** so they are always relevant and
always doable. Examples:

- "Katalogisiere 5 Teile aus Box **B-12**" (a box with many uncatalogued stubs)
- "Gib 3 Teilen ohne Foto ein Foto" (items with no photo)
- "Reviewe 3 KI-Ergebnisse, die älter als 7 Tage sind" (stale review backlog)
- "Bewerte die Qualität von 4 Teilen" (items missing `QualityAssessment`)
- "Räume den Behälter **B-07** auf" (items without a location in a box the operator is working in)

Mechanics:
- **Choice (empowerment):** shown as cards; the operator accepts one and can **re-roll** once a day.
- **Size:** each quest takes about 10–30 minutes. A small win beats a big goal.
- **Quality-gated:** a step only counts if the work is complete (photo present, quality set, review
  not reverted within the day). This keeps it from becoming a speedrun for bad data.
- **Deterministic:** quests are derived from `hash(date, actor)` plus a candidate query, so no quest
  table is needed. Progress is counted from `events` / `agentic_run_review_history` (both already
  carry `Actor` / `ReviewedBy`).
- **No loss mechanics:** unfinished quests just quietly expire. No "streak lost" messages, no red.

## 6. Fun facts and data events (novelty from real data)

Short, true, slightly absurd facts computed from the live DB and shown **at natural pauses** (after
a save, on the dashboard, in empty states). Never as a modal.

- **Weight/CO₂ equivalents:** "Heute katalogisiert: 18 kg Elektronik, ungefähr ein Rennvelo."
  "Diese Woche: 42 kg CO₂ eingespart, so viel wie 210 km Autofahren." (CO₂ and weight already exist:
  `co2Calculator`, `totalWeightKg` in overview.)
- **Firsts:** "Erstes Teil der Marke *Fujitsu* im System!", "Erste Grafikkarte diesen Monat."
- **Records and oddities:** "Älteste Box im Lager: **B-003**, seit 412 Tagen nicht bewegt.",
  "Schwerstes Teil heute: ein Netzteil mit 3,4 kg."
- **Global milestones** (shared by the whole org, the "data events"): the 10'000th item, 1'000th
  review, shelf X full. Everyone in the org sees a "Selten" celebration once and a line in
  `RecentEventsCard`. This is collective, so it builds team spirit without comparing people.
- **Seasonal/day flavour (optional, phase 4):** e.g. International Repair Day, Friday afternoon copy.
  Use sparingly; this is exactly where overload starts.

Fact generators are small pure functions `(stats) → Fact | null` with a German template each, so new
ones are easy to add and the pool keeps growing (novelty over time).

## 7. "Mein Tag" card (oversight)

One card on the dashboard (`DashboardPanel`) and a compact progress pill in the `Header`:

- Today: catalogued / reviewed / photographed (own counts, rolling numbers)
- Active quest with progress (e.g. 3/5) and the re-roll button
- Team bar for the week (org aggregate, no names)
- One fun fact

Personal numbers are **visible only to the person**. Team numbers are aggregated per org.

## 8. Guardrails against overload (mandatory)

1. **Celebration budget:** at most one "Mittel" every ~10 minutes and one "Selten" per hour per
   person; anything over budget falls back to "Klein" or nothing. Routine saves outside a quest get
   no effect at all.
2. **Fact cooldown:** at most one fun fact every ~15 minutes, never the same fact twice a day.
3. **Never blocking:** no modals, no extra clicks, no delay before the next input or scan. Effects run
   on top of the UI, then disappear.
4. **Play level in user settings** (`UserSettingsDialog`, next to theme and simple mode):
   **Verspielt** (everything) / **Dezent** (transitions + Klein only, default for simple mode) /
   **Aus** (transitions only if motion is allowed, nothing else). Stored like the other settings.
5. **Accessibility:** `prefers-reduced-motion` wins over everything; colours only via styles.scss
   tokens; effects never carry information that isn't also in text.
6. **No individual surveillance:** no per-person data leaves the person's own view; no admin report
   per operator (Swiss ArGV 3 Art. 26; and comparison tends to demotivate in a work-integration setting).
7. **Global kill switch:** host config flag `PLAY_ENABLED` (default off until phase 1 is tested).

## 9. Architecture sketch

- **Backend:** one read-only action `GET /api/play/today` → `{ me: counts, quests, team, fact,
  milestones: newSince(cursor) }`. It aggregates `events` + `agentic_run_review_history` scoped to
  caller and org (reusing the `ownership.ts` scope helpers). The only new table is `play_milestones`
  (`Key`, `Tenant`, `ReachedAt`, `Actor`), which makes sure each global milestone fires once.
- **Frontend:** `lib/play/` with a tiny event bus. Existing success paths (save item, review decision,
  photo upload, quality assessment) emit `play.emit('saved', …)`. The bus re-fetches `/api/play/today`
  (debounced), compares with the previous state and asks the **budget gate** whether to celebrate.
  If the call fails, nothing happens and the work flow is untouched.
- No changes to the write actions themselves beyond the emit calls.

## 10. Phases

| Phase | Content | Size |
|---|---|---|
| **1. Feel alive** | §3 transitions in create + review flows, rolling counters, empty states with character, play-level setting, reduced-motion handling | ~2 days |
| **2. Reward + oversight** | §4 effect library with budget gate, §7 Mein-Tag card + header pill, `/api/play/today` with counts | ~2–3 days |
| **3. Quests + facts** | §5 quest generators, §6 fact generators, global milestones + `play_milestones` | ~3 days |
| **4. Seasoning (optional)** | Seasonal days, more effects and facts, opt-in sound | ongoing, small |

Ship phase 1, watch operators use it for a week, then decide on phase 2. If they don't notice the
difference, that's a sign it's at the right dose.

## 11. Open questions

- **Q1:** Personal stats strictly private (assumed), or may coaches/job coaches see an opt-in view?
- **Q2:** Quest sizes: one global default, per org, or adjustable per person (e.g. for
  part-time/integration placements)?
- **Q3:** Default play level for new users: "Dezent" (proposed) or "Verspielt"?
- **Q4:** Global milestones per org, or deployment-wide ("zusammen 50'000 Teile gerettet")?
- **Q5:** Do the intake station and warehouse monitors get the play layer too, or only the main app?
