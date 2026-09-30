# Bug report

## Evidence and workflow

Dependencies were installed with `npm ci`, using the original lockfile. The first
tests were written before changing any application code, against original commit
`2b32db7`. Running `npm test -- --runInBand` inside `task-api` produced:

```text
Test Suites: 2 failed, 2 total
Tests:       42 failed, 59 passed, 101 total
```

The raw initial output is available locally in
`task-api/coverage/baseline-tests.txt` (ignored by Git). The failures below refer
to those original tests, not assumptions made from reading the source. Location
line numbers refer to the original commit because fixes will move some lines.
Some expectations, such as rejecting malformed pagination, define validation
rules where the assignment leaves the exact policy open; those choices are
identified explicitly.

## 1. Pagination skips the first page

- **Expected:** Page 1, limit 2 returns the first two tasks; page 2 returns the
  next two. The assignment's page-1 example supports one-based page numbering.
- **Actual:** With three tasks, page 1 returns only the third, and page 2 is empty.
- **Discovered by:** `taskService.test.js`: `page one contains the first tasks`
  and `the next page contains the remaining tasks`; API pagination tests also fail.
- **Location/cause:** `src/services/taskService.js:11-13` uses `page * limit`.
  `src/routes/tasks.js:20` defaults to page 1, so the service skips a whole page.
- **Possible fix:** Calculate `(page - 1) * limit`.

## 2. Status filtering matches substrings

- **Expected:** Filtering matches one exact status value.
- **Actual:** Filtering by `do` returns both `todo` and `done` tasks.
- **Discovered by:** `taskService.test.js`: `does not match a status substring`.
- **Location/cause:** `src/services/taskService.js:9` uses string `includes()`.
- **Possible fix:** Compare statuses using strict equality. At the HTTP boundary,
  reject query statuses outside `todo`, `in_progress`, and `done` with 400.

## 3. Completing a task changes its priority

- **Expected:** Completion changes status and completion time, preserving priority.
- **Actual:** Completing a high-priority task changes its priority to `medium`.
- **Discovered by:** Service and API completion tests asserting the full task.
- **Location/cause:** `src/services/taskService.js:69` explicitly overwrites priority.
- **Possible fix:** Remove the priority override from `completeTask()`.

## 4. Falsy status and priority values bypass validation

- **Expected:** If supplied, status and priority must be valid enum values.
  Omitting them during creation still uses the documented defaults.
- **Actual:** POST accepts `""`, `null`, `false`, and `0` with 201. PUT accepts
  invalid falsy values with 200. These values are then stored.
- **Discovered by:** Parameterized POST and PUT invalid-field tests.
- **Location/cause:** `src/utils/validators.js:8-12,24-28` checks truthiness.
  Service destructuring defaults only replace `undefined`, not explicit falsy values.
- **Possible fix:** Check whether the field is supplied (`!== undefined`), then
  validate its value against the enum.

## 5. Updates can replace identity and server-owned fields

- **Expected:** Only title, description, status, priority, and dueDate are editable
  through PUT. IDs and timestamps remain server-owned; assignment uses its own route.
- **Actual:** PUT accepts replacement IDs, creation/completion timestamps,
  assignees, and unknown fields. Replacing the ID makes the old ID disappear.
- **Discovered by:** `taskService.test.js`: `does not allow an update to overwrite
  server-owned or unknown fields`, and the API protected-field tests.
- **Location/cause:** `src/services/taskService.js:50` spreads the entire supplied
  object over the task. `validateUpdateTask()` never rejects unknown keys.
- **Possible fix:** Reject unsupported PUT fields with 400 and let service updates
  copy only the five editable fields. This protects identity without redesigning PUT.

## 6. Filtering prevents pagination

- **Expected:** Filter first, then paginate the matching tasks. The README's
  combined filter/page/limit example suggests that these options can be composed.
- **Actual:** `status=todo&page=1&limit=1` returns all matching todo tasks.
  Invalid pagination also bypasses validation when a filter is present.
- **Discovered by:** API tests `filters before applying pagination` and
  `validates pagination even when a status filter is supplied`.
- **Location/cause:** `src/routes/tasks.js:14-17` returns the filtered result
  before executing the pagination branch.
- **Possible fix:** Validate all supplied query values, then paginate the filtered
  collection when pagination parameters are supplied.

## 7. Invalid pagination values are accepted

- **Expected/policy:** Supplied page and limit values must be positive safe
  integers. Invalid values get 400; omitted page/limit default to 1/10.
- **Actual:** The first invalid case, zero, returns 200 instead of 400. Source
  inspection explains additional cases: negatives remain negative, `2abc` parses
  as 2, and unparseable values silently become defaults.
- **Discovered by:** API tests `rejects invalid page values` and
  `rejects invalid limit values` fail on their first value, `0`. They also cover
  negative, decimal, empty, non-numeric, partially numeric, and unsafe integers
  once that first failure is fixed.
- **Location/cause:** `src/routes/tasks.js:20-21` uses `parseInt(value) || default`
  without validating the whole value.
- **Possible fix:** Validate a decimal integer string and its safe numeric range
  before converting it. The assignment does not prescribe the error policy;
  explicit 400 responses were chosen over silent defaulting.

## 8. Due dates and descriptions accept invalid field types

- **Expected/policy:** Description is a string. A supplied dueDate is a parseable
  date string or null; blank, numeric, and boolean values get 400.
- **Actual:** Empty/boolean due dates and numeric descriptions are accepted.
  A numeric dueDate of 123 also passes `Date.parse()` through coercion.
- **Discovered by:** POST invalid dueDate/description tests and PUT invalid-field tests.
- **Location/cause:** `src/utils/validators.js:14,30` only checks truthy values
  with `Date.parse()` and never validates description type.
- **Possible fix:** Validate description type and explicitly check date type,
  nullability, and parseability. Strict ISO-format enforcement is left as a future
  contract decision; the existing parser remains permissive about string formats.

## 9. Malformed or oversized JSON is reported as a server failure

- **Expected:** Invalid JSON gets a 400 client-error response and an oversized
  body gets 413. Neither creates a task.
- **Actual:** The malformed JSON test receives 500. A body over Express's default
  100 KB limit (for example a 200 KB title) also receives 500.
- **Discovered by:** API test `returns 400 for malformed JSON without creating a task`.
  The oversized case was found later by sending a 200 KB request by hand, and is
  now covered by `returns 413 for an oversized body without creating a task`.
- **Location/cause:** `src/app.js:9-11` converts every middleware error, including
  Express JSON parser errors, into 500.
- **Possible fix:** Handle `entity.parse.failed` with 400 and `entity.too.large`
  with 413, each with a useful JSON error, while preserving the generic 500
  response for unexpected application errors.

## Documentation mismatch and deliberately retained behavior

These points were found by inspection rather than failing tests:

- README lists `pending`, `in-progress`, `completed`, but the assignment and
  implementation use `todo`, `in_progress`, `done`. Update the README vocabulary.
- README calls PUT a full update, but the assignment only says update and the
  existing API merges supplied fields. Keep partial updates for compatibility,
  document them, and test that omitted fields remain unchanged. An empty object
  remains a valid no-op update.
- Completion timestamps are set by the completion endpoint. General status
  updates do not synchronize them, and repeating completion refreshes the time.
  The brief does not define a full timestamp lifecycle, so this is left unchanged
  and called out as a question before production.
- `getAll()` copies the array but not its task objects. This is adequate for the
  current HTTP interface; deeper immutability is outside this small assignment.

## Fix status

The causes and possible fixes above were documented before editing application
code. All nine reproduced problems now have fixes or the documented validation
policy implemented. The README's status names and update/assignment descriptions
have also been corrected. Partial PUT and the existing completion-timestamp
lifecycle were deliberately retained as explained above.

Final verification:

```text
npm test
Test Suites: 3 passed, 3 total
Tests:       133 passed, 133 total

npm run coverage -- --runInBand
Statements: 98.92%
Branches:   98.29%
Functions:  97.14%
Lines:      98.76%
```

There are no skipped or expected-failure tests in the final full suite. The
assignment endpoint and its 100-character name policy are covered by additional
tests; see `SOLUTION.md` for the complete verification and design explanation.
