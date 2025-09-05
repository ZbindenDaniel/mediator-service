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
