// lib/withRetry.js
//
// Small helper for retrying a flaky async call once (Gemini calls can
// occasionally time out or hiccup on the network). Used by
// runFullPipeline.js around the two Gemini-backed steps.

const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls fn(). If it throws, waits RETRY_DELAY_MS and calls it exactly
 * once more. If the retry also throws, that final error is thrown to
 * the caller.
 *
 * @param {() => Promise<any>} fn - the async operation to attempt.
 * @param {string} label - name used in the log message, e.g. "generateListing".
 */
async function withRetry(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.warn(
      `[withRetry] ${label} failed on first attempt ("${err.message}"). Retrying in ${RETRY_DELAY_MS}ms...`
    );
    await sleep(RETRY_DELAY_MS);
    return fn(); // if this fails too, let it throw up to the caller
  }
}

module.exports = { withRetry };
