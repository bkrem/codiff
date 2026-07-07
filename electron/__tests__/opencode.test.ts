import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const {
  DEFAULT_OPENCODE_MODEL,
  FALLBACK_OPENCODE_MODEL,
  OPENCODE_MODELS,
  OPENCODE_NOT_FOUND_CODE,
  OPENCODE_TIMEOUT_MS,
  getOpenCodeCommand,
  isOpenCodeModelAvailabilityError,
  isOpenCodeNotFoundError,
  normalizeOpenCodeModel,
  normalizeOpenCodeOutput,
  renderOpenCodeCommand,
  runOpenCode,
} = require('../opencode.cjs') as {
  DEFAULT_OPENCODE_MODEL: string;
  FALLBACK_OPENCODE_MODEL: string;
  OPENCODE_MODELS: ReadonlyArray<{ id: string; label: string }>;
  OPENCODE_NOT_FOUND_CODE: string;
  OPENCODE_TIMEOUT_MS: number;
  getOpenCodeCommand: () => string;
  isOpenCodeModelAvailabilityError: (value: unknown) => boolean;
  isOpenCodeNotFoundError: (error: unknown) => boolean;
  normalizeOpenCodeModel: (value: unknown) => string;
  normalizeOpenCodeOutput: (output: string, schema: unknown) => string;
  renderOpenCodeCommand: (template: string, model: unknown) => string;
  runOpenCode: (
    repoRoot: string,
    prompt: string,
    schema: unknown,
    outputName?: string,
    timeoutMessage?: string,
    options?: {
      fallbackModel?: string;
      model?: string;
      onModelFallback?: (fallbackModel: string, originalModel: string) => void;
      onProgress?: (phase: string) => void;
    },
  ) => Promise<string>;
};

test('exposes selectable OpenCode models while keeping its configured default', () => {
  expect(DEFAULT_OPENCODE_MODEL).toBe('opencode-default');
  expect(FALLBACK_OPENCODE_MODEL).toBe(DEFAULT_OPENCODE_MODEL);
  expect(OPENCODE_TIMEOUT_MS).toBe(300_000);
  expect(OPENCODE_MODELS).toEqual([
    { id: DEFAULT_OPENCODE_MODEL, label: 'OpenCode configured default' },
    { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'openai/gpt-5.5', label: 'GPT-5.5' },
  ]);
  expect(normalizeOpenCodeModel(DEFAULT_OPENCODE_MODEL)).toBe(DEFAULT_OPENCODE_MODEL);
  expect(normalizeOpenCodeModel('openai/gpt-5.5')).toBe('openai/gpt-5.5');
  expect(normalizeOpenCodeModel('custom-provider/custom-model')).toBe(
    'custom-provider/custom-model',
  );
  expect(normalizeOpenCodeModel('amazon-bedrock/anthropic.claude-sonnet-v1:0')).toBe(
    'amazon-bedrock/anthropic.claude-sonnet-v1:0',
  );
  expect(normalizeOpenCodeModel('ollama/gpt-oss:120b')).toBe('ollama/gpt-oss:120b');
  expect(normalizeOpenCodeModel('openrouter/deepseek/deepseek-r1:free')).toBe(
    'openrouter/deepseek/deepseek-r1:free',
  );
  expect(normalizeOpenCodeModel('../../sessions')).toBe(DEFAULT_OPENCODE_MODEL);
});

test('renders the selected model into the managed OpenCode command', () => {
  const template = '---\n{{CODIFF_OPENCODE_MODEL}}\n---\nRun Codiff.\n';

  expect(renderOpenCodeCommand(template, DEFAULT_OPENCODE_MODEL)).toBe('---\n\n---\nRun Codiff.\n');
  expect(renderOpenCodeCommand(template, 'anthropic/claude-sonnet-4-6')).toBe(
    '---\nmodel: anthropic/claude-sonnet-4-6\n---\nRun Codiff.\n',
  );
  expect(() => renderOpenCodeCommand('Run Codiff.\n', DEFAULT_OPENCODE_MODEL)).toThrow(
    'exactly one',
  );
  expect(() =>
    renderOpenCodeCommand(
      '{{CODIFF_OPENCODE_MODEL}}\n{{CODIFF_OPENCODE_MODEL}}\n',
      DEFAULT_OPENCODE_MODEL,
    ),
  ).toThrow('exactly one');
});

test('detects OpenCode model availability errors', () => {
  expect(isOpenCodeModelAvailabilityError('Model not found: anthropic/missing')).toBe(true);
  expect(isOpenCodeModelAvailabilityError('ProviderModelNotFoundError')).toBe(true);
  expect(isOpenCodeModelAvailabilityError('unknown model anthropic/missing')).toBe(true);
  expect(isOpenCodeModelAvailabilityError('You do not have access to model openai/gpt-5.5')).toBe(
    true,
  );
  expect(isOpenCodeModelAvailabilityError('provider capacity exceeded')).toBe(false);
  expect(isOpenCodeModelAvailabilityError('repository request returned 404')).toBe(false);
  expect(isOpenCodeModelAvailabilityError('model request returned status 404')).toBe(true);
});

test('detects OpenCode-not-found errors and invalid overrides', () => {
  expect(isOpenCodeNotFoundError({ code: OPENCODE_NOT_FOUND_CODE })).toBe(true);
  expect(isOpenCodeNotFoundError({ code: 'ENOENT' })).toBe(true);
  expect(isOpenCodeNotFoundError(new Error('other'))).toBe(false);

  const previousOpenCodePath = process.env.CODIFF_OPENCODE_PATH;
  process.env.CODIFF_OPENCODE_PATH = '/tmp/codiff-missing-opencode';
  try {
    expect(() => getOpenCodeCommand()).toThrow('CODIFF_OPENCODE_PATH');
  } finally {
    if (previousOpenCodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpenCodePath;
    }
  }
});

test('normalizes OpenCode JSON text events', () => {
  const output = [
    JSON.stringify({ part: { id: 'step', text: 'Working...' }, type: 'text' }),
    JSON.stringify({ part: { id: 'answer', text: '{"reply":"Done."}' }, type: 'text' }),
  ].join('\n');

  expect(normalizeOpenCodeOutput(output, { required: ['reply'] })).toBe('{"reply":"Done."}');
});

test('runs OpenCode as an external read-only call', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-'));
  const fakeOpenCodePath = join(directory, 'opencode');
  const argsPath = join(directory, 'args.txt');
  const envPath = join(directory, 'env.txt');
  const stdinPath = join(directory, 'stdin.txt');
  const previousOpenCodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpenCodePath,
      `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
writeFileSync(${JSON.stringify(argsPath)}, process.argv.slice(2).join('\\n'));
writeFileSync(${JSON.stringify(envPath)}, process.env.OPENCODE_PERMISSION || '');
let stdin = '';
process.stdin.on('data', (chunk) => {
  stdin += chunk;
});
process.stdin.on('end', () => {
  writeFileSync(${JSON.stringify(stdinPath)}, stdin);
  process.stdout.write(JSON.stringify({
    type: 'text',
    part: { id: 'answer', text: '{"version":1}' },
  }) + '\\n');
});
`,
    );
    await chmod(fakeOpenCodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpenCodePath;

    await expect(
      runOpenCode(directory, 'prompt', { required: ['version'], type: 'object' }),
    ).resolves.toBe('{"version":1}');

    expect((await readFile(argsPath, 'utf8')).split('\n')).toEqual([
      'run',
      '--format',
      'json',
      '--pure',
      '--agent',
      'build',
      '--dir',
      directory,
    ]);
    expect(JSON.parse(await readFile(envPath, 'utf8'))).toEqual({ '*': 'deny' });
    const stdin = await readFile(stdinPath, 'utf8');
    expect(stdin).toContain('prompt');
    expect(stdin).toContain('Follow this JSON Schema exactly');
    expect(stdin).toContain('"required":["version"]');
  } finally {
    if (previousOpenCodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpenCodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('streams semantic progress from the OpenCode event server', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-progress-'));
  const fakeOpenCodePath = join(directory, 'opencode');
  const argsPath = join(directory, 'args.txt');
  const requestPath = join(directory, 'request.json');
  const previousOpenCodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpenCodePath,
      `#!/usr/bin/env node
const { appendFileSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(argsPath)}, JSON.stringify(args) + '\\n');
if (args[0] !== 'serve') process.exit(2);
const port = Number(args.find((arg) => arg.startsWith('--port='))?.slice(7));
const sessionID = 'session-1';
let events;
const readBody = (request) => new Promise((resolve) => {
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => resolve(body));
});
const sendEvent = (event) => {
  events.write('data: ' + JSON.stringify({ payload: event }) + '\\n\\n');
};
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'POST' && url.pathname === '/session') {
    const body = JSON.parse(await readBody(request));
    writeFileSync(${JSON.stringify(requestPath)}, JSON.stringify({ session: body }));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ id: sessionID }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/event') {
    events = response;
    response.writeHead(200, {
      'cache-control': 'no-cache',
      'content-type': 'text/event-stream',
    });
    response.flushHeaders();
    return;
  }
  if (request.method === 'POST' && url.pathname === '/session/' + sessionID + '/message') {
    const body = JSON.parse(await readBody(request));
    writeFileSync(
      ${JSON.stringify(requestPath)},
      JSON.stringify({ ...JSON.parse(require('node:fs').readFileSync(${JSON.stringify(requestPath)})), prompt: body }),
    );
    sendEvent({
      properties: {
        part: { messageID: 'user-1', type: 'text' },
        sessionID,
      },
      type: 'message.part.updated',
    });
    sendEvent({
      properties: {
        info: { id: 'assistant-1', role: 'assistant' },
        sessionID,
      },
      type: 'message.updated',
    });
    sendEvent({
      properties: {
        part: { messageID: 'assistant-1', type: 'step-start' },
        sessionID,
      },
      type: 'message.part.updated',
    });
    sendEvent({
      properties: {
        delta: '{"version":1}',
        field: 'text',
        messageID: 'assistant-1',
        partID: 'answer',
        sessionID,
      },
      type: 'message.part.delta',
    });
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      info: { role: 'assistant' },
      parts: [{ id: 'answer', text: '{"version":1}', type: 'text' }],
    }));
    return;
  }
  if (request.method === 'DELETE' && url.pathname === '/session/' + sessionID) {
    response.end('{}');
    return;
  }
  response.statusCode = 404;
  response.end();
});
server.listen(port, '127.0.0.1', () => {
  process.stdout.write('opencode server listening on http://127.0.0.1:' + port + '\\n');
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`,
    );
    await chmod(fakeOpenCodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpenCodePath;
    const phases: Array<string> = [];

    await expect(
      runOpenCode(
        directory,
        'prompt',
        { required: ['version'], type: 'object' },
        undefined,
        undefined,
        {
          onProgress: (phase) => phases.push(phase),
        },
      ),
    ).resolves.toBe('{"version":1}');

    expect(phases).toEqual(['agent-generation', 'response-received']);
    const calls = (await readFile(argsPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(calls).toEqual([expect.arrayContaining(['serve', '--pure', '--hostname=127.0.0.1'])]);
    const request = JSON.parse(await readFile(requestPath, 'utf8'));
    expect(request.session.permission).toEqual([{ action: 'deny', pattern: '*', permission: '*' }]);
    expect(request.prompt.parts[0].text).toContain('Follow this JSON Schema exactly');
    expect(request.prompt.tools).toEqual({});
  } finally {
    if (previousOpenCodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpenCodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('falls back to OpenCode CLI JSON mode when event streaming is unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-progress-fallback-'));
  const fakeOpenCodePath = join(directory, 'opencode');
  const argsPath = join(directory, 'args.txt');
  const previousOpenCodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpenCodePath,
      `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(argsPath)}, JSON.stringify(args) + '\\n');
if (args[0] === 'serve') {
  process.stderr.write('unknown command: serve');
  process.exit(1);
}
process.stdin.resume();
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    type: 'text',
    part: { id: 'answer', text: '{"version":1}' },
  }) + '\\n');
});
`,
    );
    await chmod(fakeOpenCodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpenCodePath;

    await expect(
      runOpenCode(
        directory,
        'prompt',
        { required: ['version'], type: 'object' },
        undefined,
        undefined,
        {
          onProgress: () => {},
        },
      ),
    ).resolves.toBe('{"version":1}');

    const calls = (await readFile(argsPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(calls[0][0]).toBe('serve');
    expect(calls[1].slice(0, 3)).toEqual(['run', '--format', 'json']);
  } finally {
    if (previousOpenCodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpenCodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('passes explicit models to OpenCode and falls back when they are unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-model-'));
  const fakeOpenCodePath = join(directory, 'opencode');
  const argsPath = join(directory, 'args.txt');
  const previousOpenCodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpenCodePath,
      `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(argsPath)}, JSON.stringify(args) + '\\n');
if (args.includes('--model')) {
  process.stderr.write('Model not found: anthropic/claude-sonnet-4-6');
  process.exit(1);
}
process.stdin.resume();
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    type: 'text',
    part: { id: 'answer', text: '{"version":1}' },
  }) + '\\n');
});
`,
    );
    await chmod(fakeOpenCodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpenCodePath;
    const fallbacks: Array<[string, string]> = [];

    await expect(
      runOpenCode(
        directory,
        'prompt',
        { required: ['version'], type: 'object' },
        undefined,
        undefined,
        {
          fallbackModel: DEFAULT_OPENCODE_MODEL,
          model: 'anthropic/claude-sonnet-4-6',
          onModelFallback: (fallbackModel, originalModel) => {
            fallbacks.push([fallbackModel, originalModel]);
          },
        },
      ),
    ).resolves.toBe('{"version":1}');

    const calls = (await readFile(argsPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('anthropic/claude-sonnet-4-6');
    expect(calls[1]).not.toContain('--model');
    expect(fallbacks).toEqual([[DEFAULT_OPENCODE_MODEL, 'anthropic/claude-sonnet-4-6']]);
  } finally {
    if (previousOpenCodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpenCodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});
