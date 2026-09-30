# Submission notes

## What I would test next

The completion-timestamp lifecycle once it is agreed (today `PUT` with
`status: "done"` does not set `completedAt`, and completing twice refreshes it),
stricter calendar and date-format rules for `dueDate`, a deliberately chosen
request-size limit, and repeated updates under whatever persistence and
concurrency model replaces the in-memory store.

## What surprised me

Completing a task silently reset its priority to `medium`. Page 1 of the
pagination skipped the first page of results. The README's status names
(`pending`, `in-progress`, `completed`) do not match the code or the assignment
(`todo`, `in_progress`, `done`), and the README calls `PUT` a full update while the
code merges only the supplied fields.

## Questions before production

- Should `PUT` replace a task? Today it merges supplied fields and returns 400 if
  the body contains anything other than the five editable fields. A client that
  sends back a whole task, including `id` and `createdAt`, gets 400. Should
  read-only fields be ignored instead?
- Should reassigning a task need authorization or a lookup against real users?
- How should `completedAt` behave when status changes through `PUT`?
- Where will data persist, and how will dependency updates be maintained?

## Design and verification

**133 tests pass** across three suites. Coverage is **98.92% statements, 98.29%
branches, 97.14% functions and 98.76% lines**. The full table is in
[SOLUTION.md](./SOLUTION.md). Each bug's location, cause and fix is in
[BUG_REPORT.md](./BUG_REPORT.md).

The API keeps its original structure and partial `PUT` updates. Assignment accepts
a trimmed, non-blank name of at most 100 characters, allows reassignment, and
preserves unrelated task fields.

The provided lockfile was retained. Installation reported 11 dependency
vulnerabilities (2 low, 3 moderate, 6 high); reviewing and upgrading dependencies
would be a separate production-readiness step.

## AI assistance disclosure

I used AI assistants on this assignment: an OpenAI GPT/Codex-based assistant for
repository analysis, test creation, implementation, debugging and documentation,
and Claude (Anthropic) for reviewing the result, adding the 413 handling for
oversized request bodies, and tidying these documents. The 100-character
assignee limit came from an earlier draft written with Claude; I kept it and added
boundary tests for it. Tests were first run against the original source to
confirm which failed, and the finished implementation was checked with Jest and
Supertest.
