function getRetryAfterSeconds(error) {
  const retryAfter = Number(error.response?.parameters?.retry_after);
  return error.response?.error_code === 429 && Number.isFinite(retryAfter) && retryAfter >= 0
    ? retryAfter
    : null;
}

function isMessageNotModified(error) {
  return (
    error.response?.error_code === 400 &&
    String(error.response?.description || '')
      .toLowerCase()
      .includes('message is not modified')
  );
}

function isPollingConflict(error) {
  return (
    error.response?.error_code === 409 &&
    /getupdates/i.test(String(error.response?.description || ''))
  );
}

async function retryAfterLimit(operation, { maxRetries = 5, sleep = delay } = {}) {
  let retries = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      const retryAfter = getRetryAfterSeconds(error);
      if (retryAfter === null || retries >= maxRetries) throw error;
      retries += 1;
      await sleep(Math.max(retryAfter, 1) * 1000);
    }
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = {
  getRetryAfterSeconds,
  isMessageNotModified,
  isPollingConflict,
  retryAfterLimit
};
