# Search API

**Endpoint:** `GET /api/search`

Returns items, item references, or boxes matching a free-text query. No authentication required.

---

## Query Parameters

| Parameter | Alias(es) | Required | Default | Description |
|-----------|-----------|----------|---------|-------------|
| `term` | `q`, `material` | Yes | — | Free-text search query |
| `scope` | — | No | items + boxes | One of `items`, `instances`, `refs`, `references`, `boxes` |
| `dedupe` | — | No | `false` | `true`/`1`/`yes` → forces `scope=refs` (deduped references) |
| `limit` | — | No | `3` | Maximum number of results to return |
| `deepSearch` | `DeepSearch` | No | `true` | Include `Kurzbeschreibung` and `Langtext` fields in scoring |

---

## Scopes

| Scope | Searches | Returns |
|-------|----------|---------|
| `items` / `instances` | item instances | Full item rows |
| `refs` / `references` | item_refs table | Deduplicated: `ItemUUID`, `BoxID`, `Location` |
| `boxes` | boxes | `BoxID`, `Label`, `LocationId` |
| *(none)* | items + boxes | Both arrays |

---

## Response

```json
{
  "items": [ { "ItemUUID": "...", "Artikelbeschreibung": "...", ... } ],
  "boxes": [ { "BoxID": "...", "Label": "...", "LocationId": "..." } ],
  "scope": "items"
}
```

Error:

```json
{ "error": "query term is required" }
```

---

## curl Examples

```bash
# Basic search — items and boxes
curl "http://localhost:8080/api/search?term=Lenovo"

# Pretty-print
curl "http://localhost:8080/api/search?term=Lenovo" | jq .

# Items only, up to 20 results
curl "http://localhost:8080/api/search?term=Lenovo&scope=items&limit=20"

# Deduplicated references
curl "http://localhost:8080/api/search?term=07045&scope=refs"

# Boxes only
curl "http://localhost:8080/api/search?term=B-151025&scope=boxes"

# Disable deep-field search
curl "http://localhost:8080/api/search?term=widget&deepSearch=false"
```

---

## Error Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Missing or empty `term` |
| 404 | Route not found |
| 500 | Internal server error |
