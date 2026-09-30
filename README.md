# Take-Home Assignment — The Untested API

A 2-day take-home assignment. You'll read unfamiliar code, write tests, track down bugs, and ship a small feature.

Read **[ASSIGNMENT.md](./ASSIGNMENT.md)** for the full brief before you start.

---

## A note on AI tools

You're welcome to use AI tools. What we're evaluating is your ability to read and reason about unfamiliar code — so your submission should reflect your own understanding, not just generated output.

Concretely:
- For each bug you report: include where in the code it lives and why it happens
- For the feature you implement: briefly explain the design decisions you made
- If something surprised you or you had to make a tradeoff, say so

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
cd task-api
npm install
npm start        # runs on http://localhost:3000
```

**Tests:**

```bash
npm test           # run test suite
npm run coverage   # run with coverage report
```

The checked-in lockfile can also be installed with `npm ci`. Coverage must meet
80% globally for statements, branches, functions, and lines. The implementation
walkthrough and recorded test results are in [SOLUTION.md](./SOLUTION.md); the
test-discovered bugs are in [BUG_REPORT.md](./BUG_REPORT.md).

---

## Project Structure

```
task-api/
  src/
    app.js                  # Express app setup
    routes/tasks.js         # Route handlers
    services/taskService.js # Business logic + in-memory data store
    utils/validators.js     # Input validation helpers
  tests/                    # Your tests go here
  package.json
  jest.config.js
ASSIGNMENT.md               # Full brief — read this first
```

> The data store is in-memory. It resets every time the server restarts.

---

## API Reference

| Method   | Path                      | Description                              |
|----------|---------------------------|------------------------------------------|
| `GET`    | `/tasks`                  | List all tasks. Supports `?status=`, `?page=`, `?limit=` |
| `POST`   | `/tasks`                  | Create a new task                        |
| `PUT`    | `/tasks/:id`              | Update supplied editable fields          |
| `DELETE` | `/tasks/:id`              | Delete a task (returns 204)              |
| `PATCH`  | `/tasks/:id/complete`     | Mark a task as complete                  |
| `GET`    | `/tasks/stats`            | Counts by status + overdue count         |
| `PATCH`  | `/tasks/:id/assign`       | Assign or reassign a task to a name       |

### Task shape

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "todo | in_progress | done",
  "priority": "low | medium | high",
  "dueDate": "date string or null (ISO 8601 recommended)",
  "completedAt": "ISO 8601 or null",
  "createdAt": "ISO 8601"
}
```

Unassigned tasks omit `assignee`. Assignment adds an `assignee` string.

### Query and update rules

- Status filters use exactly `todo`, `in_progress`, or `done`.
- Page numbers start at 1. Supplied `page` and `limit` values must be positive
  safe integers; invalid values return 400. If either is supplied, the omitted
  counterpart defaults to page 1 or limit 10. Without pagination parameters,
  the API returns all matching tasks.
- Filtering is applied before pagination. Results remain plain arrays.
- PUT retains the original partial-update behavior: omitted fields are preserved,
  and `{}` is a no-op. Editable fields are `title`, `description`, `status`,
  `priority`, and `dueDate`. Other PUT fields return 400.
- A title must contain non-whitespace text. Description must be a string. A due
  date must be a parseable string or null; null clears it. Status and priority
  must be valid enum values even when explicitly supplied as empty strings.
- Assignment accepts only `{ "assignee": "name" }`. Names are trimmed and must
  contain non-whitespace text, with at most 100 characters after trimming.
  Reassignment and assignment of completed tasks
  are allowed. Missing tasks return 404; invalid assignment bodies return 400.
- Completing a task preserves priority and records a completion timestamp.
  Repeating completion refreshes that timestamp. General status updates do not
  manage completion timestamps.

### Sample requests

**Create a task**
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Write tests", "priority": "high"}'
```

**List tasks with filter**
```bash
curl "http://localhost:3000/tasks?status=todo&page=1&limit=10"
```

**Mark complete**
```bash
curl -X PATCH http://localhost:3000/tasks/<id>/complete
```

**Assign a task**
```bash
curl -X PATCH http://localhost:3000/tasks/<id>/assign \
  -H "Content-Type: application/json" \
  -d '{"assignee": "Asha"}'
```

---

## What to Submit

See [ASSIGNMENT.md](./ASSIGNMENT.md) for full submission requirements. At minimum, include:

- **Test files** — covering the endpoints and edge cases you identified
- **Bug report** — what you found, where in the code, and why it's a bug (not just symptoms)
- **At least one fix** — with a note on your approach
- **`PATCH /tasks/:id/assign` implementation** — plus a short explanation of any design decisions (validation, edge cases, etc.)

See [SUBMISSION_NOTES.md](./SUBMISSION_NOTES.md) for the reflection and assistance
disclosure accompanying this solution.
