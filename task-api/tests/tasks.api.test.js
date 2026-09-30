const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /tasks', () => {
  test('creates a task with defaults', async () => {
    const response = await request(app).post('/tasks').send({ title: 'Write tests' }).expect(201);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
      createdAt: expect.any(String),
    });
    const list = await request(app).get('/tasks').expect(200);
    expect(list.body).toEqual([response.body]);
  });

  test('creates a task with all editable fields', async () => {
    const body = {
      title: 'Review', description: 'Review tests', status: 'in_progress',
      priority: 'low', dueDate: '2026-12-01T12:00:00.000Z',
    };
    const response = await request(app).post('/tasks').send(body).expect(201);
    expect(response.body).toMatchObject(body);
  });

  test.each([{}, { title: '' }, { title: '   ' }, { title: null }, { title: 123 }])(
    'rejects an invalid title: %j', async (body) => {
      const response = await request(app).post('/tasks').send(body).expect(400);
      expect(response.body.error).toMatch(/title/);
      expect(taskService.getAll()).toEqual([]);
    },
  );

  test.each(['pending', '', null, false, 0])('rejects invalid status %j', async (status) => {
    const response = await request(app).post('/tasks').send({ title: 'Test', status }).expect(400);
    expect(response.body.error).toMatch(/status/);
    expect(taskService.getAll()).toEqual([]);
  });

  test.each(['urgent', '', null, false, 0])('rejects invalid priority %j', async (priority) => {
    const response = await request(app).post('/tasks').send({ title: 'Test', priority }).expect(400);
    expect(response.body.error).toMatch(/priority/);
    expect(taskService.getAll()).toEqual([]);
  });

  test.each(['not-a-date', '', 123, false])('rejects invalid dueDate %j', async (dueDate) => {
    const response = await request(app).post('/tasks').send({ title: 'Test', dueDate }).expect(400);
    expect(response.body.error).toMatch(/dueDate/);
    expect(taskService.getAll()).toEqual([]);
  });

  test('rejects a non-string description', async () => {
    await request(app).post('/tasks').send({ title: 'Test', description: 42 }).expect(400);
    expect(taskService.getAll()).toEqual([]);
  });

  test('rejects an array body', async () => {
    await request(app).post('/tasks').send([]).expect(400);
  });

  test('rejects a missing body', async () => {
    await request(app).post('/tasks').expect(400);
  });

  test('returns 400 for malformed JSON without creating a task', async () => {
    const response = await request(app).post('/tasks')
      .set('Content-Type', 'application/json').send('{"title":').expect(400);
    expect(response.body).toEqual({ error: 'Invalid JSON body' });
    expect(taskService.getAll()).toEqual([]);
  });

  test('returns 413 for an oversized body without creating a task', async () => {
    const response = await request(app).post('/tasks')
      .send({ title: 'x'.repeat(200 * 1024) }).expect(413);
    expect(response.body).toEqual({ error: 'Request body too large' });
    expect(taskService.getAll()).toEqual([]);
  });
});

describe('GET /tasks', () => {
  test('returns all tasks in insertion order', async () => {
    const tasks = ['First', 'Second'].map((title) => taskService.create({ title }));
    const response = await request(app).get('/tasks').expect(200);
    expect(response.body).toEqual(tasks);
  });

  test('returns an empty list for an empty store', async () => {
    const response = await request(app).get('/tasks').expect(200);
    expect(response.body).toEqual([]);
  });

  test.each(['todo', 'in_progress', 'done'])('filters by status %s', async (status) => {
    const tasks = ['todo', 'in_progress', 'done'].map((value) =>
      taskService.create({ title: value, status: value }));
    const response = await request(app).get('/tasks').query({ status }).expect(200);
    expect(response.body).toEqual(tasks.filter((task) => task.status === status));
  });

  test('returns an empty list for a valid status with no matches', async () => {
    taskService.create({ title: 'Todo' });
    const response = await request(app).get('/tasks').query({ status: 'done' }).expect(200);
    expect(response.body).toEqual([]);
  });

  test.each(['do', 'pending', ''])('rejects invalid status query %j', async (status) => {
    taskService.create({ title: 'Todo' });
    const response = await request(app).get('/tasks').query({ status }).expect(400);
    expect(response.body.error).toMatch(/status/);
  });

  test('returns the first page followed by the remaining tasks', async () => {
    const tasks = ['First', 'Second', 'Third'].map((title) => taskService.create({ title }));
    const first = await request(app).get('/tasks').query({ page: 1, limit: 2 }).expect(200);
    const second = await request(app).get('/tasks').query({ page: 2, limit: 2 }).expect(200);
    expect(first.body).toEqual(tasks.slice(0, 2));
    expect(second.body).toEqual([tasks[2]]);
  });

  test('uses page one when only limit is supplied', async () => {
    const first = taskService.create({ title: 'First' });
    taskService.create({ title: 'Second' });
    const response = await request(app).get('/tasks').query({ limit: 1 }).expect(200);
    expect(response.body).toEqual([first]);
  });

  test('uses limit ten when only page is supplied', async () => {
    const tasks = Array.from({ length: 12 }, (_, index) => taskService.create({ title: `Task ${index}` }));
    const response = await request(app).get('/tasks').query({ page: 2 }).expect(200);
    expect(response.body).toEqual(tasks.slice(10));
  });

  test('returns an empty list beyond the last page', async () => {
    taskService.create({ title: 'First' });
    const response = await request(app).get('/tasks').query({ page: 20, limit: 2 }).expect(200);
    expect(response.body).toEqual([]);
  });

  test.each(['page', 'limit'])('rejects invalid %s values', async (field) => {
    for (const value of ['0', '-1', '1.5', 'abc', '2abc', '', '9007199254740992']) {
      const response = await request(app).get('/tasks').query({ [field]: value }).expect(400);
      expect(response.body.error).toMatch(new RegExp(field));
    }
  });

  test('filters before applying pagination', async () => {
    const first = taskService.create({ title: 'First todo' });
    taskService.create({ title: 'Done', status: 'done' });
    const second = taskService.create({ title: 'Second todo' });
    taskService.create({ title: 'Third todo' });
    const pageOne = await request(app).get('/tasks').query({ status: 'todo', page: 1, limit: 1 }).expect(200);
    const pageTwo = await request(app).get('/tasks').query({ status: 'todo', page: 2, limit: 1 }).expect(200);
    expect(pageOne.body).toEqual([first]);
    expect(pageTwo.body).toEqual([second]);
  });

  test('validates pagination even when a status filter is supplied', async () => {
    await request(app).get('/tasks').query({ status: 'todo', page: -1 }).expect(400);
  });

  test.each([
    '/tasks?page=1&page=2', '/tasks?limit[value]=2',
    '/tasks?status=todo&status=done', '/tasks?status[value]=todo',
  ])('rejects repeated or nested query values: %s', async (url) => {
    const response = await request(app).get(url).expect(400);
    expect(response.body.error).toEqual(expect.any(String));
  });
});

describe('task lifecycle through HTTP', () => {
  test('creates, assigns, updates, completes, lists, and deletes the same task', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Review', priority: 'high' }).expect(201);
    const id = created.body.id;
    await request(app).patch(`/tasks/${id}/assign`).send({ assignee: 'Asha' }).expect(200);
    await request(app).put(`/tasks/${id}`).send({ title: 'Reviewed' }).expect(200);
    const completed = await request(app).patch(`/tasks/${id}/complete`).expect(200);
    expect(completed.body).toEqual({
      ...created.body, title: 'Reviewed', assignee: 'Asha',
      status: 'done', completedAt: expect.any(String),
    });
    const list = await request(app).get('/tasks').query({ status: 'done', page: 1, limit: 1 }).expect(200);
    expect(list.body).toEqual([completed.body]);
    const stats = await request(app).get('/tasks/stats').expect(200);
    expect(stats.body).toEqual({ todo: 0, in_progress: 0, done: 1, overdue: 0 });
    await request(app).delete(`/tasks/${id}`).expect(204);
    const afterDeletion = await request(app).get('/tasks').expect(200);
    expect(afterDeletion.body).toEqual([]);
  });
});

describe('PUT /tasks/:id', () => {
  test('updates editable fields and persists the result', async () => {
    const original = taskService.create({ title: 'Original', priority: 'high' });
    const fields = {
      title: 'Updated', description: 'Changed', status: 'in_progress',
      priority: 'low', dueDate: '2026-12-01T12:00:00.000Z',
    };
    const response = await request(app).put(`/tasks/${original.id}`).send(fields).expect(200);
    expect(response.body).toEqual({ ...original, ...fields });
    const list = await request(app).get('/tasks').expect(200);
    expect(list.body).toEqual([response.body]);
  });

  test('preserves omitted fields during a partial update', async () => {
    const original = taskService.create({ title: 'Original', priority: 'high' });
    const response = await request(app).put(`/tasks/${original.id}`).send({ title: 'Updated' }).expect(200);
    expect(response.body).toEqual({ ...original, title: 'Updated' });
  });

  test('allows an empty update without changing the task', async () => {
    const original = taskService.create({ title: 'Original' });
    const response = await request(app).put(`/tasks/${original.id}`).send({}).expect(200);
    expect(response.body).toEqual(original);
  });

  test('allows clearing the due date with null', async () => {
    const task = taskService.create({ title: 'Test', dueDate: '2026-12-01T12:00:00.000Z' });
    const response = await request(app).put(`/tasks/${task.id}`).send({ dueDate: null }).expect(200);
    expect(response.body.dueDate).toBeNull();
  });

  test.each([
    { title: '' }, { title: '   ' }, { title: 42 }, { title: null },
    { status: 'pending' }, { status: '' }, { status: null },
    { priority: 'urgent' }, { priority: '' }, { priority: false },
    { dueDate: 'not-a-date' }, { dueDate: '' }, { dueDate: false },
    { description: null },
  ])('rejects invalid fields without changing the task: %j', async (fields) => {
    const original = taskService.create({ title: 'Original' });
    const response = await request(app).put(`/tasks/${original.id}`).send(fields).expect(400);
    expect(response.body.error).toEqual(expect.any(String));
    expect(taskService.findById(original.id)).toEqual(original);
  });

  test.each([
    { id: 'replacement' }, { createdAt: '2000-01-01T00:00:00.000Z' },
    { completedAt: '2000-01-01T00:00:00.000Z' }, { unexpected: true }, { assignee: 'Asha' },
  ])('rejects protected or unknown fields: %j', async (fields) => {
    const original = taskService.create({ title: 'Original' });
    await request(app).put(`/tasks/${original.id}`).send(fields).expect(400);
    expect(taskService.findById(original.id)).toEqual(original);
  });

  test('rejects an array body', async () => {
    const original = taskService.create({ title: 'Original' });
    await request(app).put(`/tasks/${original.id}`).send([]).expect(400);
    expect(taskService.findById(original.id)).toEqual(original);
  });

  test('returns 404 for a missing task', async () => {
    const response = await request(app).put('/tasks/missing').send({ title: 'Updated' }).expect(404);
    expect(response.body).toEqual({ error: 'Task not found' });
  });
});

describe('DELETE /tasks/:id', () => {
  test('returns 204 with no body and removes only the requested task', async () => {
    const first = taskService.create({ title: 'First' });
    const second = taskService.create({ title: 'Second' });
    const response = await request(app).delete(`/tasks/${first.id}`).expect(204);
    expect(response.text).toBe('');
    const list = await request(app).get('/tasks').expect(200);
    expect(list.body).toEqual([second]);
  });

  test('returns 404 for a missing task', async () => {
    const response = await request(app).delete('/tasks/missing').expect(404);
    expect(response.body).toEqual({ error: 'Task not found' });
  });

  test('returns 404 when deleting the same task twice', async () => {
    const task = taskService.create({ title: 'Delete me' });
    await request(app).delete(`/tasks/${task.id}`).expect(204);
    await request(app).delete(`/tasks/${task.id}`).expect(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks a task done, preserves priority, and stores a completion timestamp', async () => {
    const task = taskService.create({ title: 'Finish me', priority: 'high' });
    const response = await request(app).patch(`/tasks/${task.id}/complete`).expect(200);
    expect(response.body).toEqual({ ...task, status: 'done', completedAt: expect.any(String) });
    expect(new Date(response.body.completedAt).toISOString()).toBe(response.body.completedAt);
    const list = await request(app).get('/tasks').expect(200);
    expect(list.body).toEqual([response.body]);
  });

  test('returns 404 for a missing task', async () => {
    const response = await request(app).patch('/tasks/missing/complete').expect(404);
    expect(response.body).toEqual({ error: 'Task not found' });
  });

  test('repeating completion keeps one completed task', async () => {
    const task = taskService.create({ title: 'Finish me' });
    await request(app).patch(`/tasks/${task.id}/complete`).expect(200);
    const response = await request(app).patch(`/tasks/${task.id}/complete`).expect(200);
    expect(response.body.status).toBe('done');
    expect(taskService.getAll()).toHaveLength(1);
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts and excludes completed tasks from overdue', async () => {
    taskService.create({ title: 'Late', dueDate: '2000-01-01T00:00:00.000Z' });
    taskService.create({ title: 'Future', status: 'in_progress', dueDate: '2999-01-01T00:00:00.000Z' });
    taskService.create({ title: 'Done', status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });
    const response = await request(app).get('/tasks/stats').expect(200);
    expect(response.body).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 1 });
  });

  test('returns zero counts for an empty store', async () => {
    const response = await request(app).get('/tasks/stats').expect(200);
    expect(response.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('does not count tasks without a due date as overdue', async () => {
    taskService.create({ title: 'No deadline' });
    const response = await request(app).get('/tasks/stats').expect(200);
    expect(response.body).toEqual({ todo: 1, in_progress: 0, done: 0, overdue: 0 });
  });

  test('returns a generic 500 for an unexpected service error', async () => {
    jest.spyOn(taskService, 'getStats').mockImplementation(() => {
      throw new Error('Private implementation detail');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(app).get('/tasks/stats').expect(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
