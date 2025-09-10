# Mediator Service

This folder hosts the work-in-progress restructuring of the mediator service.
A component-based frontend (React) is introduced to separate data structures,
logic and presentation. The backend is split from the frontend to clarify
responsibilities.

## Layout

```
  backend/   # Node.js API and workers
  frontend/  # React application and static assets
```

Existing modules from the legacy project are being moved into these folders.
More migration steps will follow.

## Known Issues

- The build relies on the `sass` CLI (invoked in the `prebuild` script). In environments without this dependency the build and tests fail with `sh: 1: sass: not found`. Attempting to install `sass` may return `403 Forbidden` if the npm registry is unreachable.
