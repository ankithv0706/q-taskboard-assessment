# Airtable export feature

## What changed
- Added a project-level export trigger on the project detail page.
- Added a server-side endpoint at `/api/projects/[id]/export` that:
  - checks that the caller is an admin or member of the project
  - loads all tasks for the project
  - sends them to Airtable using the official `airtable` package when credentials are configured
  - falls back to the existing Airtable mock in test environments when real credentials are not set
- Added regression tests for both allowed and blocked export attempts.

## Verification
Run:

```bash
npm test
```

Observed result:
- 6 test files passed
- 17 tests passed
- 0 failed

## Notes
To use the real integration, configure:
- `AIRTABLE_PERSONAL_ACCESS_TOKEN` (the Airtable personal access token; `AIRTABLE_API_KEY` is still accepted for compatibility)
- `AIRTABLE_BASE_ID`
- optionally `AIRTABLE_TABLE_NAME`
