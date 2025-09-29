# AGENTS.md
# Component ownership and guidance for AI contributors.

version: 1.1

meta:
  project: mediator-service
  description: Inventory coordination platform with a TypeScript backend and React frontend for managing boxes, items, and labels.
  documentation:
    overview: ./OVERVIEW.md
    architecture: ./ARCHITECTURE.md
    bugs: ./BUGS.md
  ai_guidance:
    - Review the overview, architecture, and bugs documents before implementing changes.
    - Maintain existing logging and error handling patterns; add safeguards when expanding functionality.
    - Respect shared TypeScript models when editing backend or frontend logic to avoid data shape drift.

components:

  - name: backend
    path: ../backend
    language: typescript
    framework: node-http
    owner: @operations-backend
    responsibilities:
      - Load HTTP actions dynamically and expose REST endpoints for boxes, items, imports, and health checks.
      - Manage database transactions, agentic run persistence, and QR scan logging.
      - Produce printable label payloads and coordinate CSV ingestion workflows.
    ai_notes:
      - Action handlers live in `actions/` and should remain side-effect aware with robust try/catch logging.
      - Database helpers and migrations reside in `db.ts`; consult [ARCHITECTURE.md](ARCHITECTURE.md) for details.
    agents:
      - name: backend-ci
        type: github-actions
        tasks:
          - npm install
          - npm run lint
          - npm test
          - build backend bundle

  - name: frontend
    path: ../frontend
    language: typescript
    framework: react
    owner: @operations-frontend
    responsibilities:
      - Deliver SPA routes for landing pages, box/item details, CSV import/export, and agentic workflows.
      - Integrate with backend APIs using shared models and ensure responsive layouts for operations teams.
      - Host print templates and QR scanning experiences within `public/`.
    ai_notes:
      - Components live in `src/components/`; coordinate styling updates with `src/styles.css`.
      - When adding UI logic ensure state transitions are logged or surfaced for debugging as needed.
    agents:
      - name: frontend-ci
        type: github-actions
        tasks:
          - npm install
          - npm run lint
          - npm run build
          - npm test

  - name: shared-models
    path: ../models
    language: typescript
    owner: @platform-shared
    responsibilities:
      - Define entity interfaces (boxes, items, event logs, agentic runs) consumed by backend and frontend.
      - Coordinate schema changes with migrations and UI updates.
    ai_notes:
      - Validate changes against dependent code using TypeScript compilation.
      - Reference [ARCHITECTURE.md](ARCHITECTURE.md) when introducing new entities or fields.

  - name: data-ops
    path: ../data
    language: typescript
    owner: @operations-support
    responsibilities:
      - Provide seed data, CSV examples, and operational scripts supporting imports/exports.
      - Document media naming and storage practices.
    ai_notes:
      - Confirm CSV formats align with backend ingestion expectations.
      - Keep large files out of version control; prefer scripts that regenerate artifacts.

  - name: legacy-runtime
    path: ..
    language: javascript
    owner: @operations-legacy
    responsibilities:
      - Maintain compatibility scripts, vendor assets, and deployment helpers required by production printers.
      - Serve as fallback for workflows not yet ported to TypeScript modules.
    ai_notes:
      - Changes here should be conservative; prefer enhancing backend/frontend unless explicitly requested.
      - Update documentation in [OVERVIEW.md](OVERVIEW.md) when migrating features away from legacy code.

ai_agents:
  - name: codex
    type: ai
    capabilities:
      - generate: tests, CRUD endpoints, React components, documentation
      - assist: refactoring, logging improvements, type validation, migration planning
    preferences:
      - follows repository directory conventions
      - prefers enhancing error handling and observability when modifying logic
    notes:
      - Coordinate updates with CI tasks listed above and avoid altering deployment scripts without approval.
