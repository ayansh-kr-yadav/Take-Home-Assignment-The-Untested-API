const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const EDITABLE_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];
const MAX_ASSIGNEE_LENGTH = 100;

const isObject = (body) => body !== null && typeof body === 'object' && !Array.isArray(body);

const validateTaskFields = (body, requireTitle) => {
  if (requireTitle || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return requireTitle
        ? 'title is required and must be a non-empty string'
        : 'title must be a non-empty string';
    }
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    return 'description must be a string';
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (body.dueDate !== undefined && body.dueDate !== null) {
    if (typeof body.dueDate !== 'string' || Number.isNaN(Date.parse(body.dueDate))) {
      return 'dueDate must be a valid date string or null';
    }
  }
  return null;
};

const validateCreateTask = (body) => {
  if (!isObject(body)) return 'body must be a JSON object';
  return validateTaskFields(body, true);
};

const validateUpdateTask = (body) => {
  if (!isObject(body)) return 'body must be a JSON object';
  if (Object.keys(body).some((field) => !EDITABLE_FIELDS.includes(field))) {
    return `only these fields can be updated: ${EDITABLE_FIELDS.join(', ')}`;
  }
  return validateTaskFields(body, false);
};

const validateAssignTask = (body) => {
  if (!isObject(body)) return 'body must be a JSON object';
  if (typeof body.assignee !== 'string' || body.assignee.trim() === '') {
    return 'assignee is required and must be a non-empty string';
  }
  if (body.assignee.trim().length > MAX_ASSIGNEE_LENGTH) {
    return `assignee must be at most ${MAX_ASSIGNEE_LENGTH} characters`;
  }
  if (Object.keys(body).some((field) => field !== 'assignee')) {
    return 'only assignee can be updated through this endpoint';
  }
  return null;
};

const validateListQuery = (query) => {
  if (query.status !== undefined && !VALID_STATUSES.includes(query.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  for (const field of ['page', 'limit']) {
    const value = query[field];
    if (value !== undefined && (
      typeof value !== 'string' || !/^\d+$/.test(value)
      || !Number.isSafeInteger(Number(value)) || Number(value) < 1
    )) {
      return `${field} must be a positive safe integer`;
    }
  }
  return null;
};

module.exports = { validateCreateTask, validateUpdateTask, validateAssignTask, validateListQuery };
