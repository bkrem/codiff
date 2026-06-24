// @ts-check

const { createHash, randomUUID } = require('node:crypto');
const { realpathSync, watch } = require('node:fs');
const { open, readFile, rename, stat, unlink } = require('node:fs/promises');
const { basename, dirname, relative, resolve, sep } = require('node:path');

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;

class MarkdownDocumentConflictError extends Error {
  /**
   * @param {import('../core/types.ts').CodiffMarkdownDocument} document
   */
  constructor(document) {
    super(`Markdown document changed on disk: ${document.path}`);
    this.document = document;
    this.name = 'MarkdownDocumentConflictError';
  }
}

/** @param {string} content */
const hashContent = (content) => createHash('sha256').update(content).digest('hex');

/** @param {string} path */
const isMarkdownPath = (path) => /\.md$/i.test(path);

/**
 * @param {string} root
 * @param {string} filePath
 */
const isPathWithinRoot = (root, filePath) => {
  const relativePath = relative(root, filePath);
  return (
    relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !relativePath.startsWith(sep)
  );
};

/**
 * @param {string} root
 * @param {string} filePath
 */
const resolveRepositoryMarkdownPath = (root, filePath) => {
  if (
    !filePath ||
    filePath.includes('\0') ||
    filePath.startsWith('/') ||
    filePath.startsWith('\\') ||
    !isMarkdownPath(filePath)
  ) {
    throw new Error('Invalid repository Markdown path.');
  }

  const repositoryRoot = realpathSync(resolve(root));
  const requestedPath = resolve(repositoryRoot, filePath);
  const relativePath = relative(repositoryRoot, requestedPath);
  if (!relativePath || !isPathWithinRoot(repositoryRoot, requestedPath)) {
    throw new Error('Markdown path escapes the repository.');
  }

  const absolutePath = realpathSync(requestedPath);
  if (!isPathWithinRoot(repositoryRoot, absolutePath)) {
    throw new Error('Markdown path escapes the repository.');
  }

  return {
    absolutePath,
    id: `repository:${relativePath.replaceAll('\\', '/')}`,
    kind: /** @type {const} */ ('repository'),
    path: relativePath.replaceAll('\\', '/'),
  };
};

/** @param {string} filePath */
const resolvePlanMarkdownPath = (filePath) => {
  const requestedPath = resolve(filePath);
  if (!isMarkdownPath(requestedPath)) {
    throw new Error('Plan files must use the .md extension.');
  }
  const absolutePath = realpathSync(requestedPath);

  return {
    absolutePath,
    id: `plan:${requestedPath}`,
    kind: /** @type {const} */ ('plan'),
    path: requestedPath,
  };
};

/**
 * @param {{kind: 'plan' | 'repository'; path: string}} request
 * @param {{planFile?: string; repositoryRoot: string}} context
 */
const resolveMarkdownPath = (request, context) => {
  if (request.kind === 'plan') {
    if (!context.planFile) {
      throw new Error('This window does not have a plan document.');
    }

    const plan = resolvePlanMarkdownPath(context.planFile);
    if (request.path && resolve(request.path) !== plan.path) {
      throw new Error('The requested plan does not belong to this window.');
    }
    return plan;
  }

  return resolveRepositoryMarkdownPath(context.repositoryRoot, request.path);
};

/**
 * @param {{absolutePath: string; id: string; kind: 'plan' | 'repository'; path: string}} resolved
 * @returns {Promise<import('../core/types.ts').CodiffMarkdownDocument>}
 */
const readResolvedMarkdownDocument = async (resolved) => {
  const [content, fileStat] = await Promise.all([
    readFile(resolved.absolutePath, 'utf8'),
    stat(resolved.absolutePath),
  ]);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${resolved.path}`);
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) {
    throw new Error('Markdown document exceeds the 2 MB limit.');
  }

  return {
    content,
    id: resolved.id,
    kind: resolved.kind,
    path: resolved.path,
    version: hashContent(content),
  };
};

/**
 * @param {{kind: 'plan' | 'repository'; path: string}} request
 * @param {{planFile?: string; repositoryRoot: string}} context
 */
const readMarkdownDocument = async (request, context) =>
  readResolvedMarkdownDocument(resolveMarkdownPath(request, context));

/**
 * @param {{
 *   baseVersion: string;
 *   content: string;
 *   kind: 'plan' | 'repository';
 *   path: string;
 * }} request
 * @param {{planFile?: string; repositoryRoot: string}} context
 */
const writeMarkdownDocument = async (request, context) => {
  if (Buffer.byteLength(request.content, 'utf8') > MAX_MARKDOWN_BYTES) {
    throw new Error('Markdown document exceeds the 2 MB limit.');
  }

  const resolved = resolveMarkdownPath(request, context);
  const current = await readResolvedMarkdownDocument(resolved);
  if (current.version !== request.baseVersion) {
    if (current.content === request.content) {
      return current;
    }
    throw new MarkdownDocumentConflictError(current);
  }
  if (current.content === request.content) {
    return current;
  }

  const temporaryPath = resolve(
    dirname(resolved.absolutePath),
    `.${basename(resolved.absolutePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const fileMode = (await stat(resolved.absolutePath)).mode & 0o7777;
  const file = await open(temporaryPath, 'wx', fileMode);

  try {
    await file.chmod(fileMode);
    await file.writeFile(request.content, 'utf8');
    await file.sync();
    await file.close();
    await rename(temporaryPath, resolved.absolutePath);
  } catch (error) {
    await file.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return readResolvedMarkdownDocument(resolved);
};

/**
 * Watches parent directories so atomic file replacement does not detach the watcher.
 *
 * @param {{
 *   onChange: (document: import('../core/types.ts').CodiffMarkdownDocument) => void;
 *   onDelete?: (id: string) => void;
 *   resolved: {absolutePath: string; id: string; kind: 'plan' | 'repository'; path: string};
 * }} options
 */
const watchMarkdownDocument = ({ onChange, onDelete, resolved }) => {
  let timer = null;
  const watcher = watch(
    dirname(resolved.absolutePath),
    { persistent: false },
    (_event, filename) => {
      if (filename && String(filename) !== basename(resolved.absolutePath)) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void readResolvedMarkdownDocument(resolved).then(onChange, (error) => {
          if (error?.code === 'ENOENT') {
            onDelete?.(resolved.id);
          }
        });
      }, 30);
    },
  );

  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    watcher.close();
  };
};

module.exports = {
  MarkdownDocumentConflictError,
  readMarkdownDocument,
  resolveMarkdownPath,
  watchMarkdownDocument,
  writeMarkdownDocument,
};
