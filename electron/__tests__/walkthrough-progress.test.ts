import { createRequire } from 'node:module';
import { expect, test, vi } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { createWalkthroughProgressReporter } = require('../walkthrough-progress.cjs') as {
  createWalkthroughProgressReporter: (webContents: {
    isDestroyed: () => boolean;
    send: (channel: string, progress: { phase: string }) => void;
  }) => (phase: string) => void;
};

test('forwards repeated real progress events while the request is current', () => {
  let destroyed = false;
  let current = true;
  const send = vi.fn();
  const reportProgress = createWalkthroughProgressReporter(
    {
      isDestroyed: () => destroyed,
      send,
    },
    () => current,
  );

  reportProgress('response-received');
  reportProgress('response-received');

  expect(send.mock.calls).toEqual([
    ['codiff:walkthroughProgress', { phase: 'response-received' }],
    ['codiff:walkthroughProgress', { phase: 'response-received' }],
  ]);

  destroyed = true;
  reportProgress('agent-generation');
  expect(send).toHaveBeenCalledTimes(2);

  destroyed = false;
  current = false;
  reportProgress('agent-generation');
  expect(send).toHaveBeenCalledTimes(2);
});
