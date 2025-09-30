# Open Bugs & Issues

This list tracks defects that require fixes. Cross-reference the planning context in [OVERVIEW.md](OVERVIEW.md) and the component guidance in [AGENTS.md](AGENTS.md). When fixing a Bug remove it from this list.

## items list

- Behälter is often times 'nicht gesetzt' although the item is in a Box. Make sure it displays the box id

## item form

- when editing the existing images are not set in the Inputs. the file input should show the filename
- 'Hauptkategorie' and 'Unterkategorie' are dropdown selections. the value lookup is missing. the Unterkategorie selection depends on the Hauptkategorie. Implement the structure with one example (Computer - Thin Client). this selection is fetched from a new file 'ItemCategories'
- 'Anzahl' default should be 1

## item search

- often times 'nicht gesetzt' is displayed but when navigating to the item a box is set. (see bug in itemList)

## item detail

- images ar not rendered. the request returns 404
- activities are not translated
  
### agentic Status

- always visible button 'cancel' is missing.

## box detail

- when adding a new item with the button 'neu' it seems like the previous item is deleted. This mustn't happen
- At the same time it seems that the location of the box is reset.

### activities

- this list should show the last 5 events. not more. (this also goes for ite detail)

## landing page

### recent activities

- The list should be move to its own page and on the landing page there should be simply a link card. the card should contain the last 3 activities.
- translation issues
- often times no actor is registered

### Letzte Behälter

- should contain a button 'Alle Behälter' which leads to a new view (similar to ItemList)

### CSV import

- the validation should return the number of parsed items

## Printing

- labelpdf.ts need to get updated:
  -  It should take itemData/boxData as param. this data consists of the basic info about the entity
  -  this data is then encoded into the QR code instead of a URL (See actions/qr-scan to see the expected format)
  -  Also the labels should be larger (A5) and also contain the same information in human readbale text.
  
## Build & Tooling
- `sass` CLI is required for tests and builds. When unavailable the build fails with `sh: 1: sass: not found`. Registry restrictions can block installation.

## UX & Workflow
- Confirming "Entnehmen" is not yet implemented; users can remove items without a confirmation step.
- Double-clicking the username should allow editing, but the behavior is currently missing.

## Data Handling
- Moving boxes or items does not trigger a full reload, causing stale views after mutations.
- Monitoring persisted image writes and `agenticSearchQuery` handling in `backend/actions/import-item.ts` is needed to ensure data consistency.

## Layout & Presentation
- Item short description (Kurzbeschreibung) layout needs improvement for readability.

## Agentic Flow
- Switching from the agentic edit form to manual editing is missing a direct link button in `ItemForm_Agentic`.
- The asynchronous agentic run trigger in `frontend/src/components/ItemCreate.tsx` still needs refinement based on UX feedback.
