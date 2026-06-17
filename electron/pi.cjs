// @ts-check

const { spawn } = require('node:child_process');
const { homedir } = require('node:os');
const { join } = require('node:path');
const {
  findExecutableOnPath,
  isExecutableFile,
  normalizeEnum,
  oneLine,
} = require('./agent-shared.cjs');

// Pi can take longer than Codex/Claude because it may use read-only repository
// tools before producing a structured answer.
const PI_TIMEOUT_MS = 180_000;
const DEFAULT_PI_MODEL = 'pi-default';
const FALLBACK_PI_MODEL = 'pi-default';
const PI_NOT_FOUND_CODE = 'PI_NOT_FOUND';
const PI_NOT_FOUND_MESSAGE =
  'Pi CLI was not found. Install Pi and verify `pi --version` works in Terminal. Codiff searches PATH, ~/.local/bin/pi, /opt/homebrew/bin/pi, and /usr/local/bin/pi. If Pi is installed somewhere else, launch Codiff with `CODIFF_PI_PATH=/absolute/path/to/pi codiff -w`.';

/**
 * @typedef {{
 *   fallbackModel?: string;
 *   model?: string;
 *   onModelFallback?: (fallbackModel: string, originalModel: string) => Promise<void> | void;
 *   onPartialText?: (delta: string) => void;
 * }} PiOptions
 */
/**
 * @typedef {{
 *   id: string;
 *   label: string;
 * }} PiModel
 */

/** @type {ReadonlyArray<PiModel>} */
const PI_MODELS = Object.freeze([{ id: DEFAULT_PI_MODEL, label: 'Pi default' }]);
const PI_MODEL_IDS = new Set(PI_MODELS.map((model) => model.id));

/** @param {string} [detail] */
const createPiNotFoundError = (detail) =>
  Object.assign(new Error(detail ? `${PI_NOT_FOUND_MESSAGE} ${detail}` : PI_NOT_FOUND_MESSAGE), {
    code: PI_NOT_FOUND_CODE,
  });

const getPiCommand = () => {
  const piPath = process.env.CODIFF_PI_PATH?.trim();
  if (piPath) {
    if (isExecutableFile(piPath)) {
      return piPath;
    }

    throw createPiNotFoundError(
      `CODIFF_PI_PATH is set to ${JSON.stringify(piPath)}, but that file is not executable.`,
    );
  }

  const pathCommand = findExecutableOnPath('pi');
  if (pathCommand) {
    return pathCommand;
  }

  for (const path of [
    join(homedir(), '.local/bin/pi'),
    '/opt/homebrew/bin/pi',
    '/usr/local/bin/pi',
  ]) {
    if (isExecutableFile(path)) {
      return path;
    }
  }

  throw createPiNotFoundError();
};

/** @param {unknown} error */
const isPiNotFoundError = (error) =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === PI_NOT_FOUND_CODE || error.code === 'ENOENT'),
  );

/** @param {unknown} error */
const getPiLaunchError = (error) => {
  if (isPiNotFoundError(error)) {
    return createPiNotFoundError();
  }

  return error instanceof Error ? error : new Error(String(error ?? ''));
};

/** @param {unknown} value @returns {string} */
const normalizePiModel = (value) => normalizeEnum(value, PI_MODEL_IDS, DEFAULT_PI_MODEL);

/**
 * Walk `text` and return the first balanced JSON object or array, or `null`
 * if none is found. Used as a last-resort fallback when the model replies
 * with prose that contains an embedded JSON document.
 *
 * @param {string} text
 * @returns {string | null}
 */
const extractFirstJson = (text) => {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    const open = ch;
    const close = ch === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < text.length; j += 1) {
      const c = text[j];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (c === '\\') {
          escape = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === open) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(i, j + 1);
        }
      }
    }
  }
  return null;
};

/**
 * Common alternative keys the model tends to use when the structured-output
 * prompt instruction is ambiguous. Used as a last-resort coercion when the
 * model returns a JSON document that does not match the supplied schema.
 *
 * @type {ReadonlyArray<readonly [string, string]>}
 */
const SCHEMA_FIELD_ALIASES = Object.freeze([
  ['reply', 'text'],
  ['reply', 'response'],
  ['reply', 'answer'],
  ['reply', 'message'],
  ['reply', 'body'],
]);

/**
 * @param {unknown} schema
 * @returns {ReadonlyArray<string>}
 */
const schemaRequiredFields = (schema) => {
  if (!schema || typeof schema !== 'object') return [];
  const required = /** @type {any} */ (schema).required;
  if (!Array.isArray(required)) return [];
  return required.filter((field) => typeof field === 'string');
};

/**
 * @param {unknown} parsed
 * @param {ReadonlyArray<string>} required
 * @returns {boolean}
 */
const hasAllRequiredFields = (parsed, required) => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  for (const field of required) {
    if (!(field in parsed)) return false;
  }
  return true;
};

/**
 * @param {unknown} parsed
 * @param {unknown} schema
 * @returns {unknown}
 */
const coerceResultToSchema = (parsed, schema) => {
  const required = schemaRequiredFields(schema);
  if (!required.length) return parsed;
  if (hasAllRequiredFields(parsed, required)) return parsed;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;

  /** @type {Record<string, unknown>} */
  const next = { .../** @type {object} */ (parsed) };
  for (const [target, alias] of SCHEMA_FIELD_ALIASES) {
    if (required.includes(target) && !(target in next) && alias in next) {
      next[target] = next[alias];
    }
  }
  if (hasAllRequiredFields(next, required)) return next;
  return parsed;
};

/**
 * @param {unknown} schema
 * @returns {string}
 */
const buildSchemaReminder = (schema) => {
  const required = schemaRequiredFields(schema);
  if (!required.length) return '';
  return `\n\nYour final reply must be a single JSON object that includes the field${
    required.length === 1 ? '' : 's'
  }: ${required.map((field) => `\`${field}\``).join(', ')}. Do not include any prose outside the JSON.`;
};

/**
 * @param {string} output
 * @param {unknown} schema
 * @returns {string}
 */
const normalizePiOutput = (output, schema) => {
  const text = output.trim();
  const serialize = (value) => JSON.stringify(coerceResultToSchema(value, schema));

  try {
    return serialize(JSON.parse(text));
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return serialize(JSON.parse(fenced[1].trim()));
    } catch {}
  }

  const balanced = extractFirstJson(text);
  if (balanced) {
    try {
      return serialize(JSON.parse(balanced));
    } catch {}
  }

  if (text) {
    return JSON.stringify({ text });
  }

  throw new Error('Pi did not produce a final answer.');
};

/**
 * @param {string} repoRoot
 * @param {string} prompt
 * @param {unknown} schema
 * @param {string} [_outputName]
 * @param {string} [timeoutMessage]
 * @param {PiOptions} [options]
 */
const runPi = async (
  repoRoot,
  prompt,
  schema,
  _outputName = 'pi-output.json',
  timeoutMessage = 'Pi timed out.',
  options = {},
) => {
  const model = normalizePiModel(options.model);
  const effectivePrompt = `${prompt}${buildSchemaReminder(schema)}`;

  return await /** @type {Promise<string>} */ (
    new Promise((resolve, reject) => {
      let stderr = '';
      /** @type {Error | null} */
      let stdinError = null;
      let stdout = '';
      let finished = false;

      const piCommand = getPiCommand();
      const piArgs = [
        '--print',
        '--no-session',
        '--no-skills',
        '--no-prompt-templates',
        '--no-context-files',
        '--tools',
        'read,grep,find,ls',
        ...(model === DEFAULT_PI_MODEL ? [] : ['--model', model]),
      ];
      const child = spawn(piCommand, piArgs, {
        cwd: repoRoot,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          child.kill('SIGTERM');
          reject(new Error(timeoutMessage));
        }
      }, PI_TIMEOUT_MS);

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        options.onPartialText?.(text);
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.stdin.on('error', (error) => {
        stdinError = error;
      });
      child.on('error', (error) => {
        finished = true;
        clearTimeout(timer);
        reject(getPiLaunchError(error));
      });
      child.on('close', (code, signal) => {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(timer);

        if (code !== 0) {
          const message = oneLine(
            stderr || stdout || stdinError?.message,
            signal ? `Pi was terminated by ${signal}.` : `Pi exited with code ${code}.`,
          );
          reject(new Error(message));
          return;
        }

        try {
          resolve(normalizePiOutput(stdout, schema));
        } catch (error) {
          reject(error);
        }
      });

      child.stdin.end(effectivePrompt, () => {});
    })
  );
};

module.exports = {
  DEFAULT_PI_MODEL,
  FALLBACK_PI_MODEL,
  PI_MODELS,
  PI_NOT_FOUND_CODE,
  PI_NOT_FOUND_MESSAGE,
  PI_TIMEOUT_MS,
  getPiCommand,
  isPiNotFoundError,
  normalizePiModel,
  normalizePiOutput,
  runPi,
};
