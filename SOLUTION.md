# Implementation walkthrough

This solution keeps the original Express/router/service structure and in-memory
store. No database, authentication system, or new runtime dependency was added.
The dependency lockfile is unchanged.

## How the debugging workflow was preserved

1. Install the existing locked dependencies with `npm ci`.
2. Add service and API tests while leaving the application source unchanged.
3. Run those tests: **42 failed, 59 passed, 101 total**.
4. Explain the failures and their causes in `BUG_REPORT.md` before editing source.
5. Write assignment tests before implementing the endpoint. The selected
   `npm test -- --runInBand -t assign` run had **23 failures and 100 skipped tests**;
   it included the existing PUT test for an unsupported assignee field.
6. Fix the reproduced problems and implement assignment.
7. Rerun the suite, measure coverage, and record the final results below.

The initial test output is preserved locally under `task-api/coverage/`. Generated
files in that directory are ignored; this document preserves submission evidence.
No failing assertions were removed or weakened to make the implementation pass.

## Changes to taskService.js

### Exact status filtering

`getByStatus(status)` compares `t.status === status`. Equality compares the whole
value, so `do` can no longer match both `todo` and `done`. The API validator also
rejects unsupported status queries before calling the service.

### Pagination

`getPaginated(page, limit, status)` optionally filters the store, then calculates
`(page - 1) * limit`. Subtracting one converts a one-based page number to a
zero-based array offset. `slice(offset, offset + limit)` returns up to one page.
An out-of-range page returns an empty array. Supplying status means pagination
operates on matching tasks, rather than on the original unfiltered array.

### Protected updates

`update(id, fields)` still returns null for a missing task and preserves omitted
fields. It copies the existing task, then copies only title, description, status,
priority, and dueDate from the input. The `!== undefined` check permits valid
values such as an empty description or a null due date. IDs, timestamps, arbitrary
fields, and assignee cannot be overwritten by this general update function.
The route rejects these unsupported fields explicitly rather than ignoring them.

### Completion

The priority override was removed from `completeTask()`. Spreading the existing
task preserves its title, priority, assignee, and other fields; status and
completedAt are the only overridden properties. Missing tasks still return null.
Repeating completion retains the original behavior of refreshing completedAt.

### Assignment

`assignTask(id, assignee)` locates the task, returns null when missing, and replaces
the stored object with a copy containing the trimmed assignee. `trim()` removes
surrounding whitespace without changing spaces inside a person's name. Replacing
the assignee supports reassignment without changing ID, status, priority, or dates.
Existing unassigned tasks keep their original shape until assignment happens.

Direct service calls assume valid field types, as they did originally. HTTP
input validation lives in validators. `_reset()` still empties the shared store.

## Changes to validators.js

`isObject()` ensures request bodies are non-null objects rather than arrays.
`validateTaskFields()` holds the shared create/update field rules to avoid writing
the same checks twice. Its `requireTitle` argument distinguishes required creation
titles from optional update titles.

The shared rules are:

- A title must be a string with non-whitespace content; stored title text is not
  otherwise normalized.
- Description, if supplied, must be a string. Empty description is valid.
- Status and priority are checked whenever supplied, rather than only when truthy.
  This rejects empty strings, nulls, booleans, and numbers while preserving defaults
  when fields are omitted during creation.
- A due date can be omitted, set to null, or be a parseable string. Type checks
  happen before `Date.parse()`, preventing coercion of numeric/boolean inputs.

`validateCreateTask()` checks object shape and requires title, then uses the shared
rules. Creation continues to ignore unknown fields through service destructuring.

`validateUpdateTask()` checks object shape, rejects keys outside the five editable
fields, and applies the shared rules without requiring title. It permits `{}`.

`validateAssignTask()` requires a non-blank string and rejects fields other than
assignee. It limits the trimmed name to 100 characters. It returns an error
message for invalid input or null for valid input.
The service trims and stores the validated name.

`validateListQuery()` validates status and supplied pagination values. The decimal
digits check rejects values such as `2abc`, `1.5`, and negative numbers. Type checks
reject repeated/nested query values that Express represents as arrays/objects.
`Number.isSafeInteger()` rejects numbers JavaScript cannot represent precisely,
and the minimum of one rejects zero. Leading zeros are accepted.

Each validator returns the first error string or null. Routes turn errors into
HTTP 400 responses. Invalid requests leave stored tasks unchanged.

## Changes to routes/tasks.js and app.js

The list route validates the entire supported query before selecting a result.
If pagination is requested, it defaults only omitted values, converts valid
strings with `Number()`, and passes the optional status to `getPaginated()`.
Otherwise it returns all tasks or all tasks matching the supplied status.

The new assignment route follows the existing PUT pattern: validate the body,
call `assignTask()`, return 404 for null, or return the updated task with 200.
Validation happens before the existence check, so an invalid body receives 400
even if the task ID does not exist. A valid body for a missing ID receives 404.

In `app.js`, JSON-parser errors with type `entity.parse.failed` now receive 400
and `{ "error": "Invalid JSON body" }`. Bodies over Express's default 100 KB limit
(`entity.too.large`) receive 413 and `{ "error": "Request body too large" }`
instead of a misleading 500. Unexpected application errors retain
the logged, generic 500 response, without returning internal error details.
The server startup guard and exported Express app are unchanged.

## Understanding the tests

`tests/taskService.test.js` exercises all exported service functions directly:
creation defaults, explicit fields, unique IDs, reading, filtering, pagination,
updates, deletion, completion, statistics, assignment, and resetting.

`tests/tasks.api.test.js` exercises every original endpoint using Supertest and
the real application, validators, and service. Invalid-body tests also assert
that tasks were not created or changed. Deletion tests verify the empty 204 body
and the remaining tasks. Update/completion tests verify that subsequent reads
contain the result. Query tests cover default values, invalid values, empty
results, and composition of filtering with pagination.
It also exercises a complete create/assign/update/complete/list/stats/delete
workflow through HTTP, using the generated ID returned by creation.

`tests/assign.api.test.js` covers successful assignment, trimming, reassignment,
repeating the same assignment, completed tasks, missing IDs, invalid names,
array/missing bodies, extra fields, and preservation through later updates and
completion. These are behavior tests rather than checks of a particular array
method or internal variable.

Useful syntax in the tests:

- `beforeEach()` calls `_reset()` so each test starts with an empty store. Test
  order does not determine results.
- `describe()` groups related tests; `test()` specifies a scenario.
- `test.each()` runs a scenario for each supplied invalid/valid value. The
  pagination test loops through several invalid query values as well.
- `expect(...).toEqual(...)` checks complete values; `toMatchObject()` checks a
  relevant subset; `expect.any(String)` handles generated values.
- Supertest's `.send()` supplies a JSON body and `.query()` supplies URL parameters.
  `.expect(200)` checks HTTP status. Every request is awaited so assertions run
  after the response arrives.
- Fake timers and `setSystemTime()` make service creation/completion and overdue
  boundary checks deterministic. `afterEach()` restores real timers. HTTP tests
  keep real timers; their overdue dates are deliberately far in the past/future.
- Most integration tests use no mocks. The unexpected-error test temporarily
  makes `getStats()` throw so the real Express error handler can be checked;
  `jest.restoreAllMocks()` prevents that injected fault leaking into later tests.

The Jest configuration now enforces a global minimum of 80% for each coverage
metric. It still collects every `src/**/*.js` file; no source is excluded to
inflate coverage. Importing the app avoids starting its normal port-3000 listener.

## Design decisions and limits

- Use the assignment's statuses: todo, in_progress, done. The README is corrected.
- Keep partial PUT updates for compatibility and explicitly document them. A
  strict replacement contract would require a separate agreed change.
- Apply filtering before pagination and return plain arrays, preserving the
  existing response format. Invalid supplied query values return 400.
- Assignees are trimmed, non-blank names of at most 100 characters. The length
  limit is a chosen validation policy, not an explicit assignment requirement.
  Reassignment is allowed, including for
  completed tasks; repeating the same assignment produces the same task data.
  No user lookup or unassignment behavior is invented. Null/blank names are invalid.
- Prefer ISO due-date strings, but retain parseable date strings rather than
  introducing a strict ISO parser. The validation message and README reflect this.
- Retain the existing completion timestamp lifecycle. Status changes through PUT
  do not synchronize completedAt; this needs clarification before production.
- Data remains process-local and disappears on restart. Authentication,
  persistence, choosing a request-size limit (Express's 100 KB default is kept),
  and dependency upgrades are outside this task.

## Final verification

Verified with Node.js 22.22.2 and npm 10.9.7, using the repository's locked
dependencies. Run these commands from `task-api`:

```text
npm test
Test Suites: 3 passed, 3 total
Tests:       133 passed, 133 total

npm run coverage -- --runInBand
Test Suites: 3 passed, 3 total
Tests:       133 passed, 133 total
```

| Source | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| All files | 98.92% | 98.29% | 97.14% | 98.76% |
| app.js | 88.23% | 87.5% | 50% | 88.23% |
| routes/tasks.js | 100% | 100% | 100% | 100% |
| services/taskService.js | 100% | 95.65% | 100% | 100% |
| utils/validators.js | 100% | 100% | 100% | 100% |

The global 80% threshold passes for every metric. The uncovered application
lines are the normal server-listen callback, which importing the app for Supertest
does not execute. The remaining service branch is the defensive statistics guard
for an unrecognized stored status; HTTP validators prevent such statuses.
No tests are skipped or marked `test.failing` in the final suite. Generated HTML
coverage can be opened at `task-api/coverage/lcov-report/index.html` after running
coverage. The original failing-test logs remain in the ignored coverage directory.
