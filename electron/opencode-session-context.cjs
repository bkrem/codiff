// @ts-check

const { spawn } = require('node:child_process');
const { closeSync, mkdtempSync, openSync, rmSync } = require('node:fs');
const { readFile, stat } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { cleanText, truncate } = require('./agent-shared.cjs');
const { getOpenCodeCommand } = require('./opencode.cjs');

const OPENCODE_EXPORT_TIMEOUT_MS = 15_000;
const MAX_OPENCODE_EXPORT_BYTES = 16 * 1024 * 1024;
const MAX_SESSION_MESSAGE_CHARS = 2_400;
const MAX_SESSION_MESSAGES = 18;
const MAX_SESSION_CONTEXT_CHARS = 28_000;
const SESSION_ID_PATTERN = /^ses_[a-z0-9]{8,}$/i;

/**
 * @typedef {import('../core/types.ts').WalkthroughContext} WalkthroughContext
 */

/** @param {unknown} value */
const normalizeOpenCodeSessionId = (value) =>
  typeof value === 'string' && SESSION_ID_PATTERN.test(value) ? value : '';

/** @param {string} text */
const isNoiseMessage = (text) => {
  const normalized = cleanText(text).toLowerCase();
  return (
    normalized === '/codiff' ||
    normalized === '$codiff' ||
    normalized === 'codiff' ||
    normalized === 'show me codiff' ||
    normalized === 'open codiff'
  );
};

/** @param {unknown} value */
const extractMessage = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const info = 'info' in value ? value.info : null;
  if (!info || typeof info !== 'object') {
    return null;
  }

  const role = 'role' in info ? info.role : undefined;
  if (role !== 'assistant' && role !== 'user') {
    return null;
  }

  const parts = 'parts' in value && Array.isArray(value.parts) ? value.parts : [];
  const text = truncate(
    cleanText(
      parts
        .map((part) =>
          part &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'text' &&
          'text' in part &&
          typeof part.text === 'string'
            ? part.text
            : '',
        )
        .filter(Boolean)
        .join('\n'),
    ),
    MAX_SESSION_MESSAGE_CHARS,
  );
  if (!text || isNoiseMessage(text)) {
    return null;
  }

  return { role, text };
};

/** @param {unknown} input */
const extractSessionMessages = (input) => {
  if (
    !input ||
    typeof input !== 'object' ||
    !('messages' in input) ||
    !Array.isArray(input.messages)
  ) {
    return [];
  }

  const messages = input.messages.map(extractMessage).filter(Boolean);
  /** @type {Array<{role: 'assistant' | 'user'; text: string}>} */
  const selected = [];
  let totalChars = 0;

  for (const message of messages.slice().reverse()) {
    if (selected.length >= MAX_SESSION_MESSAGES) {
      break;
    }

    const cost = message.role.length + message.text.length + 2;
    if (selected.length > 0 && totalChars + cost > MAX_SESSION_CONTEXT_CHARS) {
      break;
    }

    selected.push(message);
    totalChars += cost;
  }

  return selected.reverse();
};

/** @param {unknown} input @param {string} sessionId */
const isMatchingSessionExport = (input, sessionId) =>
  Boolean(
    input &&
    typeof input === 'object' &&
    'info' in input &&
    input.info &&
    typeof input.info === 'object' &&
    'id' in input.info &&
    input.info.id === sessionId,
  );

/**
 * @param {string} sessionId
 * @param {number} [timeoutMs]
 */
const exportOpenCodeSession = (sessionId, timeoutMs = OPENCODE_EXPORT_TIMEOUT_MS) =>
  new Promise((resolve) => {
    const directory = mkdtempSync(join(tmpdir(), 'codiff-opencode-session-'));
    const path = join(directory, 'session.json');
    let output;
    let settled = false;
    let timedOut = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timeout;

    const closeOutput = () => {
      if (output == null) {
        return;
      }

      try {
        closeSync(output);
      } catch {}
      output = undefined;
    };

    const removeDirectory = () => {
      try {
        rmSync(directory, { force: true, recursive: true });
      } catch {}
    };

    /** @param {unknown} value */
    const finish = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      closeOutput();
      removeDirectory();
      resolve(value);
    };

    try {
      output = openSync(path, 'w', 0o600);
      // OpenCode can truncate large exports when stdout is a pipe. Writing
      // directly to a file descriptor preserves the complete JSON document.
      const child = spawn(getOpenCodeCommand(), ['export', '--pure', sessionId], {
        stdio: ['ignore', output, 'ignore'],
        windowsHide: true,
      });
      timeout = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {}
        finish(null);
      }, timeoutMs);
      child.once('error', () => finish(null));
      child.once('close', async (code) => {
        if (settled) {
          closeOutput();
          removeDirectory();
          return;
        }

        if (timedOut || code !== 0) {
          finish(null);
          return;
        }

        if (timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
        closeOutput();

        try {
          if ((await stat(path)).size > MAX_OPENCODE_EXPORT_BYTES) {
            finish(null);
            return;
          }

          const input = JSON.parse(await readFile(path, 'utf8'));
          finish(isMatchingSessionExport(input, sessionId) ? input : null);
        } catch {
          finish(null);
        }
      });
    } catch {
      finish(null);
    }
  });

/**
 * @param {string | undefined} opencodeSessionId
 * @returns {Promise<WalkthroughContext | null>}
 */
const readOpenCodeSessionContext = async (opencodeSessionId) => {
  const threadId = normalizeOpenCodeSessionId(opencodeSessionId);
  if (!threadId) {
    return null;
  }

  let session;
  try {
    session = await exportOpenCodeSession(threadId);
  } catch {
    session = null;
  }
  const messages = extractSessionMessages(session);
  return {
    messages,
    risks:
      messages.length === 0
        ? ['Codiff could not find recent readable messages for the linked OpenCode session.']
        : undefined,
    source: {
      generatedAt: new Date().toISOString(),
      threadId,
      type: 'opencode-session-excerpt',
    },
    version: 1,
  };
};

module.exports = { readOpenCodeSessionContext };
