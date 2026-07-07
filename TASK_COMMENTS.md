# Task Comments Feature

## What changed
- Added a persistent task comment thread backed by Prisma and a new comments table.
- Exposed a comments API under `/api/tasks/[id]/comments` with:
  - `GET` for chronological lists of comments
  - `POST` for project members to add comments
  - authorization checks so viewers can read but cannot post
- Added a comments section to the task detail UI so users can view and post comments without editing or deleting them.

## Verification
### Tests
```bash
npm test
```

Observed result:
- 5 test files passed
- 15 tests passed
- 0 failed

### Notes
Comments are append-only by design: the API only supports creating comments and does not expose edit/delete routes.
