# Chat Agent / chatFlow Planning

The chat experience is a minimal, isolated slice that mirrors existing action/agentic mechanics. The high-level goal is to let users query the database and interact with internal tools/actions through a chat agent. The MVP runs in dry-run mode: it only returns the queries it would issue.

## UI
- **MVP** — TODO(chat-ui): Minimal `/chat` page using the shared `card` class that keeps the conversation in memory and renders the agent's proposed SQLite queries for the `item` schema.
- TODO(chat-ui): Add client-side logging around send/display failures using existing logger utilities and introduce persistence hooks when storage lands.
- TODO(chat-ui): Reuse existing layout components to minimize new UI surface while wiring tool previews/action responses once available.

## Backend
- **MVP** — TODO(chat-backend): HTTP action that accepts chat messages, spins up `chatFlow`, and returns the agent's response payload (including proposed queries); include structured logging and guarded error handling.
- **MVP** — TODO(chat-flow): `chatFlow` with a single sqlAgent aware of the `item` schema, prompted to craft SQLite queries and surface them without executing tools; reject unsafe/ill-formed requests and align prompts with existing action/agentic patterns.
- TODO(chat-backend): Wire JSON-file session persistence for transcripts + tool calls once the schema is agreed; keep adapters lean to avoid touching unrelated actions.

## Tools & util (log, persistence)
- **MVP** — TODO(chat-tools): Provide a `SQLite-tool` that simply returns the formulated query string so the UI can display the intended statement.
- TODO(chat-tools): Extend tool adapters to cover future internal actions; prefer small extensions to current utility modules over new helpers.
- TODO(chat-ops): Centralize chat-specific logging helpers (reusing existing logger utilities) and validate persistence schemas before writes to avoid data shape drift.
