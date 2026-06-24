import { readFileSync } from 'node:fs';

export const planOpenTimeoutMs = 15_000;

export const isProcessRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
};

export const waitForPlanResult = async (
  resultPath,
  child,
  { isRunning = isProcessRunning, openTimeoutMs = planOpenTimeoutMs, pollIntervalMs = 50 } = {},
) => {
  const startedAt = Date.now();
  let appPid = null;
  let childError = null;
  let childExit = null;
  child.once('error', (error) => {
    childError = error;
  });
  child.once('exit', (code, signal) => {
    childExit = { code, signal };
  });

  for (;;) {
    if (childError) {
      throw childError;
    }

    try {
      const result = JSON.parse(readFileSync(resultPath, 'utf8'));
      if (
        result?.status === 'done' ||
        result?.status === 'closed' ||
        result?.status === 'canceled'
      ) {
        return result;
      }
      if (result?.status === 'open' && Number.isInteger(result.pid) && result.pid > 0) {
        appPid = result.pid;
      }
    } catch {}

    if (appPid != null && !isRunning(appPid)) {
      return { status: 'canceled' };
    }
    if (appPid == null && childExit && childExit.code !== 0) {
      throw new Error(
        `Codiff exited before opening the plan${
          childExit.signal ? ` (${childExit.signal})` : ` (code ${childExit.code})`
        }.`,
      );
    }
    if (appPid == null && Date.now() - startedAt >= openTimeoutMs) {
      throw new Error(`Codiff did not open the plan within ${openTimeoutMs / 1000} seconds.`);
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, pollIntervalMs));
  }
};
