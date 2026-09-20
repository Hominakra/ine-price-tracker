export function backoffMs(attempt) {
  return Math.min(2500, 400 * 2 ** (attempt - 1));
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries(maxAttempts, fn, onAttempt) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
      const failed = attempt === maxAttempts;
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
