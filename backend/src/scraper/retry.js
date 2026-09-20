export function backoffMs(attempt) {
  return Math.min(4000, 400 * 2 ** (attempt - 1));
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries(maxAttempts, fn, onAttempt, { giveUpMs } = {}) {
  let lastError;
  const startedAll = Date.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (giveUpMs && Date.now() - startedAll >= giveUpMs) {
      lastError = lastError || new Error("Gave up waiting for a valid price");
      await onAttempt?.({
        attempt,
        status: "FAILED",
        error: lastError,
        duration_ms: Date.now() - startedAll,
      });
      break;
    }
    const started = Date.now();
    try {
      const result = await fn(attempt);
      await onAttempt?.({
        attempt,
        status: "SUCCESS",
        result,
        duration_ms: Date.now() - started,
      });
      return result;
    } catch (error) {
      lastError = error;
      const timedOut = giveUpMs && Date.now() - startedAll >= giveUpMs;
      const failed = attempt === maxAttempts || timedOut;
      await onAttempt?.({
        attempt,
        status: failed ? "FAILED" : "RETRIED",
        error,
        duration_ms: Date.now() - started,
      });
      if (failed) break;
      await sleep(backoffMs(attempt));
    }
  }
  throw lastError;
}
