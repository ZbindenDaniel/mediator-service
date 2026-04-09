# Item Detail Layout — User Perspective

## Who uses this page and why

The item detail view is visited in several distinct situations, each with a different primary need:

| Persona / situation | Primary question | Secondary need |
|---|---|---|
| Warehouse staff scanning a label | "Where does this go / where did this come from?" | Confirm identity (photo, description) |
| Staff checking in a delivery | "Is this the right item, and in what condition?" | Log quality, place it |
| Staff pulling an item for a customer | "Is this the one? Can I take it out?" | Print label, confirm stock count |
| Admin / purchaser checking specs | "What are the full specs, price, EAN?" | Edit if wrong |
| Tech lead doing KI enrichment | "What did the AI find? Should I confirm or fix it?" | Trigger / review / cancel KI run |
| Anyone investigating a problem | "What happened to this item recently?" | Activity log, which box it was in |

---

## Information hierarchy — what users actually need first

### Always critical (above the fold)
- **Photo** — instant visual confirmation ("is this the right item?")
- **Article description + key specs** — name, Artikel_Nummer, category, dimensions
- **Where it is right now** — Behälter (container), Standort (location)

### Usually needed next
- **Quality / condition** — is it OK to use or sell?
- **Take out / relocate** — the two most common actions in daily warehouse use
- **All copies in stock** — how many exist and where (Vorrat)

### Situational (only needed for specific tasks)
- **KI Status + Label printing** — only relevant during enrichment workflows or shipping prep
- **Accessories** — only relevant if this item is part of a set
- **Attachments** — rarely accessed; manuals, invoices
- **Activity log** — only for investigation / audit

---

## Problems with the current layout

```
┌─────────────────────────────┬───────────────────┐
│ Artikel info (tall, many    │ Fotos             │
│ fields: desc, specs, price) │                   │
│                             ├───────────────────┤
│                             │ (gap / empty)     │
├────────────────┬────────────┴───────────────────┤
│ dieser Artikel │ Artikel umlagern               │  ← good: both instance-level
├────────────────┴────────────────────────────────┤
│ Vorrat (full width table)                       │  ← good: naturally wide
├────────────────┬────────────────────────────────┤
│ KI Status      │ Label drucken                  │  ← odd: print button as right-col peer
├────────────────┴────────────────────────────────┤
│ Passendes Zubehör (full width)                  │
├─────────────────────────────────────────────────┤
│ Anhänge (full width)                            │  ← far from Fotos; both are "files"
├─────────────────────────────────────────────────┤
│ Aktivitäten (full width, always expanded)       │  ← long, low priority
└─────────────────────────────────────────────────┘
```

**Problems identified:**
1. **Fotos is isolated** — photos appear only at the top right, small, next to a long text card. If article info is long, photos are left with a large gap below them.
2. **KI Status + Print Label** — these two sit as left/right column peers but are logically different weight. KI Status can be a tall card; Print Label is a single button. The pairing looks arbitrary.
3. **Anhänge is far from Fotos** — both are "files attached to this item" but separated by four other cards.
4. **Aktivitäten always expanded** — the event log is low-priority archival content but always visible and can be very long.
5. **No visual grouping** — the page is a flat list of cards. A user's eye has no guidance about which sections relate to each other.

---

## User workflow analysis

### Workflow A: Daily pickup (most common)
1. Scan QR → land on item detail
2. **Check photo** to confirm correct item
3. **Check Behälter/Standort** (in "dieser Artikel") to know where to go
4. **Check Qualität** — is it OK to give out?
5. Press **Entnehmen** — done

→ Needs: Photo + "dieser Artikel" visible immediately, close together.

### Workflow B: Receiving / intake
1. Have item in hand, look up by number
2. **Check photo + specs** to verify it's the right article
3. **Check Qualität + Behälter** — where was it stored before?
4. Press **Relocate** — move to new box

→ Needs: Photo + Article info + Relocation quick to reach.

### Workflow C: KI enrichment run
1. Open item detail
2. Check current **KI Status** — is a run pending, done, or failed?
3. Adjust **search term** if needed
4. Start / review / cancel
5. Print label after successful run

→ Needs: KI Status and Print Label near each other, ideally in the same card or adjacent.

### Workflow D: Spec check / edit
1. Review full spec table
2. Press **Bearbeiten** → edit form
3. Come back, verify

→ Needs: Article info card with edit button, nothing special.

### Workflow E: Audit / investigation
1. Open item detail for a specific instance
2. Check **Aktivitäten** log — what happened, when, by whom?
3. Cross-reference **Vorrat** to see all instances

→ Needs: Activities accessible but doesn't need to be prominent.

---

## Proposed layout principles

Based on the above, a better layout should follow these rules:

**Rule 1: Photo must be near article info, always.**
The visual confirmation and the text description belong together. They answer the same question: "what is this thing?"

**Rule 2: Instance actions must be a coherent block.**
"dieser Artikel" (where is THIS copy), Relocation, and Quality/KI — these all describe and act on *this specific instance*. They should read as one section.

**Rule 3: KI Status and Print Label belong together.**
They're both part of the enrichment-and-label workflow. KI Status should be a card; Print Label should be a button *inside or immediately below* it, not a separate peer card.

**Rule 4: Vorrat is naturally full-width.**
It's a table with 6 columns. It always needs full width. No change needed.

**Rule 5: Anhänge is secondary and can be compact.**
It's rarely accessed. It should be present but not prominent.

**Rule 6: Aktivitäten should be collapsible.**
It's audit/investigation content. Collapsed by default saves significant vertical space.

---

## Candidate layout A — "Article left, actions right"

```
┌──────────────────────────┬──────────────────────┐
│ Artikel info             │ Fotos                │
│ (desc, specs, edit btn)  │                      │
│                          ├──────────────────────┤
│                          │ KI Status            │
│                          │ [Print Label]        │
├──────────────────────────┴──────────────────────┤
│ dieser Artikel  │  Artikel umlagern             │
├─────────────────┴───────────────────────────────┤
│ Vorrat (full width)                             │
├─────────────────────────────────────────────────┤
│ Passendes Zubehör (full width)                  │
├──────────────────────┬──────────────────────────┤
│ Anhänge              │ (future use or empty)    │
├──────────────────────┴──────────────────────────┤
│ Aktivitäten ▼ (collapsible)                     │
└─────────────────────────────────────────────────┘
```

**Pros:** KI Status and Print Label in the right column next to article info — visible early, grouped logically.
**Cons:** Article info on the left must row-span to match Photos + KI Status height. If article info is short, there's a gap.

---

## Candidate layout B — "Instance zone full width"

Keep the top (Article info + Photos) exactly as-is. Change only what comes after:

```
┌──────────────────────────┬──────────────────────┐
│ Artikel info             │ Fotos                │  ← unchanged
│ (grid-span-row-2)        │ (grid-span-row-2)    │
│                          │                      │
├──────────────────────────┴──────────────────────┤
│ dieser Artikel  │  Artikel umlagern             │  ← unchanged
├─────────────────┴───────────────────────────────┤
│ Vorrat (full width)                             │  ← unchanged
├─────────────────────────────────────────────────┤
│ KI Status  │  Anhänge                           │  ← swap: KI left, Anhänge right
├────────────┴──────[Print Label inside KI card]──┤
│ Passendes Zubehör (full width)                  │
├─────────────────────────────────────────────────┤
│ Aktivitäten ▼ (collapsible)                     │
└─────────────────────────────────────────────────┘
```

**Key changes from current layout:**
- KI Status stays left, but **Print Label moves inside the KI Status card** (it logically belongs there)
- **Anhänge replaces Print Label** as the right-column peer of KI Status — both are now "secondary file/action" content
- Aktivitäten is collapsible

**Pros:** Minimal structural change. Works within existing CSS grid. No wrapper divs needed. Only card-internal changes + reordering in JSX.
**Cons:** KI Status and Anhänge aren't strongly related — the pairing is pragmatic, not semantic.

---

## Candidate layout C — "Minimal change, maximum impact"

Only two changes, zero structural risk:

1. **Move Print Label button inside AgenticStatusCard** (or immediately adjacent as a sibling, not a separate grid item). This eliminates the awkward left/right peer relationship.
2. **Make Aktivitäten collapsible** — collapsed by default.

Everything else stays exactly where it is.

```
┌──────────────────────────┬──────────────────────┐
│ Artikel info             │ Fotos                │
├──────────────────────────┴──────────────────────┤
│ dieser Artikel  │  Artikel umlagern             │
├─────────────────┴───────────────────────────────┤
│ Vorrat (full width)                             │
├─────────────────────────────────────────────────┤
│ KI Status [+ Print Label inside]  │ (right col) │
├───────────────────────────────────┴─────────────┤
│ Passendes Zubehör (full width)                  │
├─────────────────────────────────────────────────┤
│ Anhänge (full width)                            │
├─────────────────────────────────────────────────┤
│ Aktivitäten ▼ (collapsible)                     │
└─────────────────────────────────────────────────┘
```

**Pros:** Lowest risk. Solves the two most visible problems (Print Label isolation, long Activities).
**Cons:** Doesn't address Fotos gap, Anhänge still far from Fotos.

---

## Recommendation

Start with **Layout C** (minimal change). It fixes the two most visible problems without touching the grid structure. Once it's confirmed to look correct, evaluate **Layout A** or **B** as a follow-up for the Photos/KI grouping.
