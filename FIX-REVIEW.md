# Fix Review: Task Update Authorization

## Summary
The critical issue was that any authenticated user could update any task via the PATCH endpoint, even when they were not a member of the task’s project. The fix adds the missing membership and permission checks before applying updates.

## What changed
- Added project-membership validation in [src/app/api/tasks/[id]/route.ts](src/app/api/tasks/[id]/route.ts)
- Reused the existing role-based permission helper so task updates now follow the same rules as delete operations
- Added a regression test in [src/tests/task-auth.test.ts](src/tests/task-auth.test.ts)

## Verification
### Tests
```bash
npm test
```

Observed result:
- 4 test files passed
- 13 tests passed
- 0 failed

### Before fix
```bash
curl -s -X PATCH http://localhost:3000/api/tasks/cmrayh67e000nv3eebts26o7n \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"status":"done"}'
```

Response:
```json
{"task":{"id":"cmrayh67e000nv3eebts26o7n","status":"done"}}
```

### After fix
```bash
curl -s -X PATCH http://localhost:3000/api/tasks/cmrayh67e000nv3eebts26o7n \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"status":"done"}'
```

Response:
```json
{"error":"you are not a member of this project"}
```
