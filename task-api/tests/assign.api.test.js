const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

describe('PATCH /tasks/:id/assign', () => {
  test('assigns a task, trims the name, and preserves every other field', async () => {
    const task = taskService.create({ title: 'Review', priority: 'high', status: 'in_progress' });
    const response = await request(app).patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '  Asha  ' }).expect(200);
    expect(response.body).toEqual({ ...task, assignee: 'Asha' });
    const list = await request(app).get('/tasks').expect(200);
    expect(list.body).toEqual([response.body]);
  });

  test('allows reassignment to another person', async () => {
    const task = taskService.create({ title: 'Review' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Asha' }).expect(200);
    const response = await request(app).patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Ravi' }).expect(200);
    expect(response.body).toEqual({ ...task, assignee: 'Ravi' });
    expect(taskService.findById(task.id).assignee).toBe('Ravi');
  });

  test('allows assigning the same name again', async () => {
    const task = taskService.create({ title: 'Review' });
    const first = await request(app).patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Asha' }).expect(200);
    const second = await request(app).patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Asha' }).expect(200);
    expect(second.body).toEqual(first.body);
  });

  test('allows assigning a completed task without changing completion data', async () => {
    const task = taskService.create({ title: 'Finished' });
    const completed = taskService.completeTask(task.id);
    const response = await request(app).patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Asha' }).expect(200);
    expect(response.body).toEqual({ ...completed, assignee: 'Asha' });
  });

  test('accepts a name at the 100-character limit after trimming', async () => {
    const task = taskService.create({ title: 'Review' });
    const name = 'A'.repeat(100);
    const response = await request(app).patch(`/tasks/${task.id}/assign`)
      .send({ assignee: `  ${name}  ` }).expect(200);
    expect(response.body.assignee).toBe(name);
  });

  test('rejects names longer than 100 characters without changing an existing assignment', async () => {
    const task = taskService.create({ title: 'Review' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Asha' }).expect(200);
    const original = taskService.findById(task.id);
    const response = await request(app).patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'A'.repeat(101) }).expect(400);
    expect(response.body.error).toMatch(/at most 100/);
    expect(taskService.findById(task.id)).toEqual(original);
  });

  test('returns 404 for a missing task', async () => {
    const response = await request(app).patch('/tasks/missing/assign')
      .send({ assignee: 'Asha' }).expect(404);
    expect(response.body).toEqual({ error: 'Task not found' });
    expect(taskService.getAll()).toEqual([]);
  });

  test('validates the body before looking up a missing task', async () => {
    const response = await request(app).patch('/tasks/missing/assign')
      .send({ assignee: '' }).expect(400);
    expect(response.body.error).toMatch(/assignee/);
  });

  test.each([
    {}, { assignee: '' }, { assignee: '   ' }, { assignee: '\t\n' },
    { assignee: null }, { assignee: 123 }, { assignee: false },
    { assignee: [] }, { assignee: {} },
  ])('rejects invalid assignment without changing the task: %j', async (body) => {
    const task = taskService.create({ title: 'Review' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Asha' }).expect(200);
    const original = taskService.findById(task.id);
    const response = await request(app).patch(`/tasks/${task.id}/assign`).send(body).expect(400);
    expect(response.body.error).toMatch(/assignee/);
    expect(taskService.findById(task.id)).toEqual(original);
  });

  test.each([{ id: 'replacement' }, { title: 'Changed' }])('rejects extra fields: %j', async (extra) => {
    const task = taskService.create({ title: 'Review' });
    await request(app).patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Asha', ...extra }).expect(400);
    expect(taskService.findById(task.id)).toEqual(task);
  });

  test('rejects an array body', async () => {
    const task = taskService.create({ title: 'Review' });
    await request(app).patch(`/tasks/${task.id}/assign`).send([]).expect(400);
  });

  test('rejects a missing body', async () => {
    const task = taskService.create({ title: 'Review' });
    await request(app).patch(`/tasks/${task.id}/assign`).expect(400);
  });

  test('assignment survives later updates and completion', async () => {
    const task = taskService.create({ title: 'Review' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Asha' }).expect(200);
    const updated = await request(app).put(`/tasks/${task.id}`).send({ title: 'Reviewed' }).expect(200);
    expect(updated.body.assignee).toBe('Asha');
    const completed = await request(app).patch(`/tasks/${task.id}/complete`).expect(200);
    expect(completed.body.assignee).toBe('Asha');
  });
});
