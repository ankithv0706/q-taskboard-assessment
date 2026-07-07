# Review

## 1) Any authenticated user can update arbitrary tasks
- File/Lines: [src/app/api/tasks/[id]/route.ts](src/app/api/tasks/[id]/route.ts#L16-L37)
- Category: Security
- Severity: Critical
- Description: The task update handler accepts a valid bearer token and updates a task without checking whether the caller belongs to the task’s project or has edit permission. That means a user who is logged in can change another project’s task status, title, or assignment, which directly undermines the project access model and can corrupt workflow state.
- Recommended fix: Enforce the same membership and role checks used by delete logic before applying any PATCH changes. The handler should load the existing task, verify the caller is a member of the project, and reject updates unless the user has task-edit privileges.

Reproduction:

```bash
curl -s -X PATCH http://localhost:3000/api/tasks/<task-id> \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"status":"done"}'
```

Response:

```json
{"task":{"id":"<task-id>","status":"done"}}
```

## 2) Task search uses raw SQL interpolation and is vulnerable to injection
- File/Lines: [src/app/api/projects/[id]/tasks/route.ts](src/app/api/projects/[id]/tasks/route.ts#L15-L46)
- Category: Security
- Severity: High
- Description: The search endpoint builds a SQL query by interpolating the incoming `q` parameter directly into a raw SQL string. Even though this is a small internal app, this pattern allows attackers to break out of the predicate, alter the query shape, or exfiltrate data from the `tasks` table. It is also brittle because a single malformed input can crash the endpoint or produce inconsistent results.
- Recommended fix: Replace the raw query with Prisma’s parameterized query API, or at minimum use a safe query builder and bind the search term as a parameter. The code should also validate the search input length and escape special characters.

## 3) Task assignees are not restricted to project members
- File/Lines: [src/app/api/projects/[id]/tasks/route.ts](src/app/api/projects/[id]/tasks/route.ts#L49-L88)
- Category: Data Integrity
- Severity: High
- Description: The task creation flow accepts any provided `assigneeId` and stores it without verifying that the assignee is a member of the target project. This creates inconsistent ownership and can assign work to users who should not be able to participate in the project, causing downstream confusion and permission gaps.
- Recommended fix: Before creating or updating a task, look up the assignee’s membership in the same project and reject assignments that are not valid project members. A shared helper for this validation would keep create and update paths consistent.

## 4) The test suite does not cover authorization regressions
- File/Lines: [src/tests/auth.test.ts](src/tests/auth.test.ts#L1-L14)
- Category: Testing
- Severity: Medium
- Description: The current tests only verify JWT helper behavior and do not exercise the route-level authorization paths that matter most for this application. Because the highest-risk bugs are in API access control, the lack of regression tests makes them easy to reintroduce without detection.
- Recommended fix: Add integration tests for task/project routes that cover unauthorized access, project-member permissions, and role-based editing rules. These should run against a test database and fail if a non-admin or non-member can modify restricted resources.
