const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('create and read tasks', () => {
  test('creates a task with defaults and stores it', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const task = taskService.create({ title: 'Write tests' });

    expect(task).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
      createdAt: '2026-01-15T12:00:00.000Z',
    });
    expect(taskService.getAll()).toEqual([task]);
  });

  test('preserves explicitly supplied editable fields', () => {
    const fields = {
      title: 'Review code',
      description: 'Check the routes',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-02-01T12:00:00.000Z',
    };

    expect(taskService.create(fields)).toMatchObject(fields);
  });

  test('generates a different ID for each task', () => {
    const first = taskService.create({ title: 'First' });
    const second = taskService.create({ title: 'Second' });
    expect(first.id).not.toBe(second.id);
  });

  test('returns an empty list for an empty store', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  test('returns tasks in insertion order without exposing the array itself', () => {
    const first = taskService.create({ title: 'First' });
    const second = taskService.create({ title: 'Second' });
    const result = taskService.getAll();
    expect(result).toEqual([first, second]);
    result.pop();
    expect(taskService.getAll()).toEqual([first, second]);
  });

  test('finds an existing task by ID', () => {
    const task = taskService.create({ title: 'Find me' });
    expect(taskService.findById(task.id)).toEqual(task);
  });

  test('returns undefined for a missing ID', () => {
    expect(taskService.findById('missing')).toBeUndefined();
  });

  test('reset clears previously stored tasks', () => {
    taskService.create({ title: 'Discard me' });
    taskService._reset();
    expect(taskService.getAll()).toEqual([]);
  });
});

describe('filtering and pagination', () => {
  test('filters tasks by their exact status', () => {
    taskService.create({ title: 'First', status: 'todo' });
    const matching = taskService.create({ title: 'Second', status: 'in_progress' });
    taskService.create({ title: 'Third', status: 'done' });
    expect(taskService.getByStatus('in_progress')).toEqual([matching]);
  });

  test('does not match a status substring', () => {
    taskService.create({ title: 'First', status: 'todo' });
    taskService.create({ title: 'Second', status: 'done' });
    expect(taskService.getByStatus('do')).toEqual([]);
  });

  test('returns an empty list when no task matches', () => {
    taskService.create({ title: 'First', status: 'todo' });
    expect(taskService.getByStatus('done')).toEqual([]);
  });

  test('page one contains the first tasks', () => {
    const tasks = ['First', 'Second', 'Third'].map((title) => taskService.create({ title }));
    expect(taskService.getPaginated(1, 2)).toEqual(tasks.slice(0, 2));
  });

  test('the next page contains the remaining tasks', () => {
    const tasks = ['First', 'Second', 'Third'].map((title) => taskService.create({ title }));
    expect(taskService.getPaginated(2, 2)).toEqual([tasks[2]]);
  });

  test('returns an empty list beyond the last page', () => {
    taskService.create({ title: 'First' });
    expect(taskService.getPaginated(10, 2)).toEqual([]);
  });
});

describe('update and remove', () => {
  test('updates supplied fields while preserving omitted fields', () => {
    const original = taskService.create({ title: 'Original', description: 'Keep me', priority: 'high' });
    const updated = taskService.update(original.id, { title: 'Updated', status: 'in_progress' });
    expect(updated).toEqual({ ...original, title: 'Updated', status: 'in_progress' });
    expect(taskService.findById(original.id)).toEqual(updated);
  });

  test('does not allow an update to overwrite server-owned or unknown fields', () => {
    const original = taskService.create({ title: 'Original' });
    const updated = taskService.update(original.id, {
      title: 'Updated',
      id: 'replacement',
      createdAt: '2000-01-01T00:00:00.000Z',
      completedAt: '2000-01-01T00:00:00.000Z',
      unexpected: true,
    });
    expect(updated).toEqual({ ...original, title: 'Updated' });
    expect(taskService.findById(original.id)).toEqual(updated);
  });

  test('returns null when updating a missing task', () => {
    expect(taskService.update('missing', { title: 'Updated' })).toBeNull();
    expect(taskService.getAll()).toEqual([]);
  });

  test('removes only the requested task', () => {
    const first = taskService.create({ title: 'First' });
    const second = taskService.create({ title: 'Second' });
    expect(taskService.remove(first.id)).toBe(true);
    expect(taskService.findById(first.id)).toBeUndefined();
    expect(taskService.getAll()).toEqual([second]);
  });

  test('returns false when removing a missing task', () => {
    const task = taskService.create({ title: 'Keep me' });
    expect(taskService.remove('missing')).toBe(false);
    expect(taskService.getAll()).toEqual([task]);
  });

  test('returns false when removing a task twice', () => {
    const task = taskService.create({ title: 'Delete me' });
    taskService.remove(task.id);
    expect(taskService.remove(task.id)).toBe(false);
  });
});

describe('completion and statistics', () => {
  test('completes a task, records the time, and preserves its priority', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const task = taskService.create({ title: 'Finish me', priority: 'high' });
    const completed = taskService.completeTask(task.id);
    expect(completed).toEqual({
      ...task,
      status: 'done',
      completedAt: '2026-01-15T12:00:00.000Z',
    });
    expect(taskService.findById(task.id)).toEqual(completed);
  });

  test('returns null when completing a missing task', () => {
    expect(taskService.completeTask('missing')).toBeNull();
  });

  test('returns zero statistics for an empty store', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts each status and only overdue unfinished tasks', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    taskService.create({ title: 'Late todo', dueDate: '2026-01-14T12:00:00.000Z' });
    taskService.create({ title: 'Late active', status: 'in_progress', dueDate: '2026-01-14T12:00:00.000Z' });
    taskService.create({ title: 'Done', status: 'done', dueDate: '2026-01-14T12:00:00.000Z' });
    taskService.create({ title: 'Future', dueDate: '2026-01-16T12:00:00.000Z' });
    taskService.create({ title: 'No due date' });
    taskService.create({ title: 'Exactly now', dueDate: '2026-01-15T12:00:00.000Z' });
    expect(taskService.getStats()).toEqual({ todo: 4, in_progress: 1, done: 1, overdue: 2 });
  });

  test('completion removes a task from overdue statistics', () => {
    const task = taskService.create({ title: 'Late', dueDate: '2000-01-01T00:00:00.000Z' });
    expect(taskService.getStats().overdue).toBe(1);
    taskService.completeTask(task.id);
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 1, overdue: 0 });
  });
});

describe('assignTask', () => {
  test('stores a trimmed assignee and preserves all other fields', () => {
    const task = taskService.create({ title: 'Review', priority: 'high' });
    const assigned = taskService.assignTask(task.id, '  Asha  ');
    expect(assigned).toEqual({ ...task, assignee: 'Asha' });
    expect(taskService.findById(task.id)).toEqual(assigned);
  });

  test('returns null for a missing task', () => {
    expect(taskService.assignTask('missing', 'Asha')).toBeNull();
    expect(taskService.getAll()).toEqual([]);
  });

  test('replaces an existing assignee without creating another task', () => {
    const task = taskService.create({ title: 'Review' });
    taskService.assignTask(task.id, 'Asha');
    expect(taskService.assignTask(task.id, 'Ravi')).toEqual({ ...task, assignee: 'Ravi' });
    expect(taskService.getAll()).toHaveLength(1);
  });
});
