// @ts-check

const { createHash, randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { mkdir, open, rename, unlink } = require('node:fs/promises');
const { dirname, join, resolve } = require('node:path');

const MAX_PLAN_REVIEW_BYTES = 2 * 1024 * 1024;
/** @type {Map<string, Promise<unknown>>} */
const writeQueues = new Map();

/** @param {string} userDataPath @param {string} planFile */
const getPlanReviewPath = (userDataPath, planFile) => {
  const key = createHash('sha256').update(resolve(planFile)).digest('hex');
  return join(userDataPath, 'plan-reviews', `${key}.json`);
};

/** @param {unknown} value */
const isRecord = (value) => value != null && typeof value === 'object' && !Array.isArray(value);

/** @param {unknown} value */
const isString = (value) => typeof value === 'string';

/** @param {unknown} value */
const isOptionalString = (value) => value == null || isString(value);

/** @param {unknown} value */
const isAuthor = (value) =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isOptionalString(value.avatarUrl) &&
  isOptionalString(value.email);

/** @param {unknown} value */
const isAnchor = (value) => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    (value.kind !== 'block' && value.kind !== 'text') ||
    !isRecord(value.block) ||
    !isString(value.block.fingerprint) ||
    !Array.isArray(value.block.path) ||
    !value.block.path.every((part) => Number.isInteger(part) && part >= 0) ||
    !isOptionalString(value.block.runtimeKey) ||
    !isString(value.block.text) ||
    !isString(value.block.type)
  ) {
    return false;
  }
  if (value.kind === 'block') {
    return value.quote == null;
  }
  return (
    isRecord(value.quote) &&
    Number.isInteger(value.quote.start) &&
    value.quote.start >= 0 &&
    Number.isInteger(value.quote.end) &&
    value.quote.end >= value.quote.start &&
    isString(value.quote.exact) &&
    isString(value.quote.prefix) &&
    isString(value.quote.suffix)
  );
};

/** @param {unknown} value */
const isMessage = (value) =>
  isRecord(value) &&
  isAuthor(value.author) &&
  isString(value.body) &&
  isString(value.createdAt) &&
  isString(value.id) &&
  isString(value.updatedAt);

/** @param {unknown} value */
const isThread = (value) =>
  isRecord(value) &&
  isAnchor(value.anchor) &&
  isString(value.createdAt) &&
  isAuthor(value.createdBy) &&
  isString(value.id) &&
  Array.isArray(value.messages) &&
  value.messages.every(isMessage) &&
  (value.status === 'open' || value.status === 'resolved') &&
  isString(value.updatedAt);

/** @param {unknown} value */
const normalizePlanReview = (value) => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.document) ||
    typeof value.document.id !== 'string' ||
    typeof value.document.path !== 'string' ||
    typeof value.document.version !== 'string' ||
    !Array.isArray(value.threads) ||
    !value.threads.every(isThread)
  ) {
    throw new Error('Invalid plan review.');
  }

  return value;
};

/** @param {string} userDataPath @param {string} planFile */
const readPlanReview = async (userDataPath, planFile) => {
  try {
    const raw = await readFile(getPlanReviewPath(userDataPath, planFile), 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > MAX_PLAN_REVIEW_BYTES) {
      throw new Error('Plan review exceeds the 2 MB limit.');
    }
    return normalizePlanReview(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

/** @param {string} path @param {string} content */
const atomicWrite = async (path, content) => {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const file = await open(temporaryPath, 'wx', 0o600);
  try {
    await file.writeFile(content, 'utf8');
    await file.sync();
    await file.close();
    await rename(temporaryPath, path);
  } catch (error) {
    await file.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
};

/** @param {string} userDataPath @param {string} planFile @param {unknown} review */
const writePlanReview = async (userDataPath, planFile, review) => {
  const normalized = normalizePlanReview(review);
  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  if (Buffer.byteLength(content, 'utf8') > MAX_PLAN_REVIEW_BYTES) {
    throw new Error('Plan review exceeds the 2 MB limit.');
  }

  const path = getPlanReviewPath(userDataPath, planFile);
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const write = previous
    .catch(() => {})
    .then(() => atomicWrite(path, content))
    .finally(() => {
      if (writeQueues.get(path) === write) {
        writeQueues.delete(path);
      }
    });
  writeQueues.set(path, write);
  await write;
  return normalized;
};

module.exports = {
  getPlanReviewPath,
  normalizePlanReview,
  readPlanReview,
  writePlanReview,
};
