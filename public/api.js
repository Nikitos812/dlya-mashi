export class ApiError extends Error {
  constructor(kind, message) { super(message || kind); this.name = 'ApiError'; this.kind = kind; }
}

export function requestErrorMessage(error) {
  if (error?.kind === 'validation') return error.message;
  if (error?.kind === 'timeout' || ['AbortError', 'TimeoutError'].includes(error?.name) || /abort|timeout/i.test(error?.message || '')) {
    return 'Не удалось дождаться сохранения. Текст остался в окне — попробуй ещё раз.';
  }
  return 'Сейчас не получается связаться с Никитой. Текст остался в окне — попробуй ещё раз чуть позже.';
}

export function createApiClient({ fetchImpl = (...args) => fetch(...args), configUrl = null, requestTimeoutMs = 25000, configTimeoutMs = 10000, retryDelayMs = 800, onRetry = () => {} } = {}) {
  async function fetchJson(url, options, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal, credentials: 'omit' });
      if (response.status >= 500 || response.status === 429) throw new ApiError('network');
      const data = await response.json();
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      if (timedOut || ['AbortError', 'TimeoutError'].includes(error?.name)) throw new ApiError('timeout');
      throw error;
    } finally { clearTimeout(timer); }
  }

  return async function request(path, options = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let apiBase = '';
        if (configUrl) {
          const freshConfigUrl = new URL(configUrl);
          freshConfigUrl.searchParams.set('t', String(Date.now()));
          const config = await fetchJson(freshConfigUrl.href, { cache: 'no-store' }, configTimeoutMs);
          if (!config.ok || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(config.data?.apiBase || '')) throw new ApiError('network');
          apiBase = config.data.apiBase;
        }
        // Start a fresh timeout only after resolving the current server address.
        // Reuse the exact request body on retry: the server deduplicates its ID.
        return await fetchJson(apiBase + path, options, requestTimeoutMs);
      } catch (error) {
        if (attempt === 1) throw error;
        onRetry();
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  };
}
