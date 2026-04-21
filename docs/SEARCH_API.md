# Search API

**Endpoint:** `GET /api/search`

Returns items, item references, or boxes matching a free-text query.

---

## Authentication

If `API_KEY` is set in the server environment, every `/api/*` request must include it.  
Two header formats are accepted:

```
Authorization: Bearer <key>
```
```
X-API-Key: <key>
```

If `API_KEY` is not configured the endpoint is open (suitable for development or fully internal deployments).

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

On error:

```json
{ "error": "query term is required" }
```

---

## curl Examples

### No authentication (API_KEY not set)

```bash
# Basic search — returns matching items and boxes
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

### With authentication (API_KEY set)

```bash
# Using Authorization: Bearer
curl -H "Authorization: Bearer your-api-key" \
  "http://localhost:8080/api/search?term=Lenovo"

# Using X-API-Key
curl -H "X-API-Key: your-api-key" \
  "http://localhost:8080/api/search?term=Lenovo&scope=items&limit=10"

# Store the key in a variable to avoid repeating it
API_KEY="your-api-key"
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:8080/api/search?term=Brother&scope=refs" | jq .
```

---

## Configuration

Add to your `.env` file:

```env
# Required if you want to protect the API
API_KEY=your-secret-key-here
```

Omit or leave blank to run without authentication.

---

## Error Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Missing or empty `term` parameter |
| 401 | `API_KEY` is configured and the supplied key is missing or wrong |
| 404 | Route not found |
| 500 | Internal server error |
