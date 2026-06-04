// ── Types ────────────────────────────────────────────────────────────

export interface TestConfig {
  baseUrl: string;
  endpoint: string;
  model: string;
  authHeader: string;
  authPrefix: string;
  extraHeaders?: Record<string, string>;
  queryParamAuth?: boolean;
  provider?: string; // 'claude' for special 400 handling
}

export interface TestResult {
  valid: boolean;
  error: string | null;
  isRateLimit: boolean;
  statusCode?: number;
  responseBody?: string;
}

export interface PaidTestResult {
  isPaid: boolean | null;
  error: string | null;
  cacheApiStatus: number | null;
}

export interface BalanceResult {
  success: boolean;
  balance: string | null;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function buildUrl(baseUrl: string, endpoint: string, model: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const ep = endpoint.replace('{model}', model);
  return `${base}${ep.startsWith('/') ? ep : `/${ep}`}`;
}

function buildHeaders(config: TestConfig, key: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!config.queryParamAuth && config.authHeader) {
    const value = config.authPrefix ? `${config.authPrefix}${key}` : key;
    headers[config.authHeader] = value;
  }

  const extras = config.extraHeaders || {};
  for (const [k, v] of Object.entries(extras)) {
    headers[k] = v;
  }

  return headers;
}

export function buildUrlWithAuth(baseUrl: string, endpoint: string, model: string, key: string, queryParamAuth: boolean): string {
  let url = buildUrl(baseUrl, endpoint, model);
  if (queryParamAuth) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}key=${encodeURIComponent(key)}`;
  }
  return url;
}

/**
 * Remove API keys from URLs before logging/displaying.
 * Masks query params like ?key=... or &key=... and any param ending with "key"/"token".
 */
export function maskUrlSecrets(url: string): string {
  return url.replace(/([?&])([^=&]*?(?:key|token)[^=&]*?)=([^&]+)/gi, '$1$2=***');
}

function buildPayload(config: TestConfig): string {
  // Gemini uses a different format
  if (config.queryParamAuth) {
    return JSON.stringify({
      contents: [{ parts: [{ text: 'Hi' }] }],
    });
  }
  // OpenAI-compatible format (works for OpenAI, DeepSeek, SiliconCloud, xAI, OpenRouter, Claude)
  const payload: Record<string, unknown> = {
    model: config.model,
    messages: [{ role: 'user', content: 'Hi' }],
  };
  if (usesMaxCompletionTokens(config)) {
    payload.max_completion_tokens = 16;
  } else {
    payload.max_tokens = 16;
  }
  return JSON.stringify(payload);
}

function usesMaxCompletionTokens(config: TestConfig): boolean {
  if (config.provider !== 'openai') return false;
  return /^(gpt-5|gpt-4\.1|o\d)/i.test(config.model);
}

interface ApiErrorShape {
  message?: string;
  type?: string;
  code?: string | number;
  param?: string;
  metadata?: {
    raw?: string;
    provider_name?: string;
    is_byok?: boolean;
  };
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function getApiError(data: Record<string, unknown> | undefined): ApiErrorShape | undefined {
  const error = data?.error;
  return error && typeof error === 'object' ? error as ApiErrorShape : undefined;
}

function getNestedRawError(error: ApiErrorShape | undefined): ApiErrorShape | undefined {
  if (!error?.metadata?.raw) return undefined;
  return getApiError(parseJsonObject(error.metadata.raw));
}

function textOf(value: unknown): string {
  return value == null ? '' : String(value).toLowerCase();
}

function errorText(error: ApiErrorShape | undefined): string {
  if (!error) return '';
  return [
    error.message,
    error.type,
    error.code,
    error.param,
  ].map(textOf).filter(Boolean).join(' ');
}

function isAuthError(error: ApiErrorShape | undefined): boolean {
  const text = errorText(error);
  return text.includes('auth')
    || text.includes('invalid api key')
    || text.includes('incorrect api key')
    || text.includes('unauthorized')
    || text.includes('permission')
    || text.includes('forbidden');
}

function isRateLimitError(error: ApiErrorShape | undefined): boolean {
  const text = errorText(error);
  return text.includes('rate limit')
    || text.includes('too many requests')
    || text.includes('quota exceeded')
    || text.includes('rate_limit')
    || text.includes('速率限制');
}

function isRequestValidationError(error: ApiErrorShape | undefined): boolean {
  const text = errorText(error);
  return text.includes('invalid_request_error')
    || text.includes('integer_below_min_value')
    || text.includes('invalid parameter')
    || text.includes('below minimum value')
    || text.includes('unsupported parameter');
}

/** Combine an optional external cancellation signal with a timeout signal. */
function combineSignals(externalSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;
}

// ── Core test function ────────────────────────────────────────────────

export async function testKey(key: string, config: TestConfig, externalSignal?: AbortSignal): Promise<TestResult> {
  const url = buildUrlWithAuth(config.baseUrl, config.endpoint, config.model, key, config.queryParamAuth || false);
  const headers = buildHeaders(config, key);
  const body = buildPayload(config);

  let responseBody = '';
  const result = (overrides: Partial<TestResult>): TestResult => ({
    valid: false, error: null, isRateLimit: false, ...overrides, responseBody: responseBody || undefined,
  });

  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: combineSignals(externalSignal, 30000) });
    responseBody = await res.text();
    const parsed = responseBody.trim() ? parseJsonObject(responseBody) : undefined;
    const apiError = getApiError(parsed);
    const rawProviderError = getNestedRawError(apiError);

    if (res.status === 401) return result({ error: 'authFailed', statusCode: 401 });
    if (res.status === 403) return result({ error: 'permissionDenied', statusCode: 403 });
    if (res.status === 429) return result({ error: 'rateLimited', isRateLimit: true, statusCode: 429 });

    if (res.status === 400 && config.provider === 'claude') {
      try {
        const data = JSON.parse(responseBody);
        if (data?.error?.type === 'invalid_request_error') return result({ valid: true, statusCode: 400 });
        if (data?.error?.type === 'authentication_error') return result({ error: 'authFailed', statusCode: 400 });
        if (data?.error?.type === 'rate_limit_error') return result({ error: 'rateLimited', isRateLimit: true, statusCode: 400 });
        return result({ error: `API error: ${data?.error?.type || 'unknown'}`, statusCode: 400 });
      } catch { return result({ error: 'parseError', statusCode: 400 }); }
    }

    const relevantError = rawProviderError || apiError;
    if (res.status === 400 && isRequestValidationError(relevantError) && !isAuthError(relevantError)) {
      return result({ valid: true, statusCode: 400 });
    }
    if (isRateLimitError(relevantError)) {
      return result({ error: 'rateLimited', isRateLimit: true, statusCode: res.status });
    }

    if (!res.ok) return result({ error: 'httpError', statusCode: res.status });
    if (!responseBody.trim()) return result({ error: 'emptyResponse' });

    const data = parsed;
    if (!data) return result({ error: 'parseError' });

    if (apiError) {
      const msg = apiError.message || '';
      if (isRateLimitError(apiError)) {
        return result({ error: 'rateLimited', isRateLimit: true });
      }
      return result({ error: msg || 'unknownError' });
    }

    if (data?.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
      return result({ valid: true, statusCode: res.status });
    }
    if (data?.choices && Array.isArray(data.choices)) {
      return result({ valid: true, statusCode: res.status });
    }
    return result({ valid: true, statusCode: res.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('timeout') || msg.includes('abort')) return result({ error: 'timeoutError' });
    if (msg.includes('fetch') || msg.includes('network')) return result({ error: 'networkError' });
    return result({ error: msg || 'unknownError' });
  }
}

// ── Gemini Paid Detection ─────────────────────────────────────────────

export async function testPaidKey(key: string, baseUrl: string, externalSignal?: AbortSignal): Promise<PaidTestResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}/cachedContents`;
  const longText = Array(128).fill('You are an expert at analyzing transcripts.').join(' ');
  const body = JSON.stringify({
    model: 'models/gemini-2.5-flash-lite',
    contents: [{ parts: [{ text: longText }], role: 'user' }],
    ttl: '30s',
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body,
      signal: combineSignals(externalSignal, 30000),
    });

    if (res.ok) return { isPaid: true, error: null, cacheApiStatus: res.status };
    if (res.status === 429) return { isPaid: false, error: 'rateLimited', cacheApiStatus: 429 };
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { isPaid: false, error: 'accessDenied', cacheApiStatus: res.status };
    }
    return { isPaid: null, error: `HTTP ${res.status}`, cacheApiStatus: res.status };
  } catch (e: unknown) {
    return { isPaid: null, error: e instanceof Error ? e.message : String(e), cacheApiStatus: null };
  }
}

// ── Model fetching ────────────────────────────────────────────────────

export async function fetchModels(
  key: string,
  baseUrl: string,
  authHeader: string,
  authPrefix: string,
  queryParamAuth: boolean,
  externalSignal?: AbortSignal,
): Promise<string[]> {
  const base = baseUrl.replace(/\/+$/, '');
  let url = `${base}/models`;
  const headers: Record<string, string> = {};

  if (queryParamAuth) {
    url += `?key=${encodeURIComponent(key)}`;
  } else if (authHeader) {
    headers[authHeader] = authPrefix ? `${authPrefix}${key}` : key;
  }

  try {
    const res = await fetch(url, { headers, signal: combineSignals(externalSignal, 15000) });
    if (!res.ok) return [];
    const data = await res.json();

    // OpenAI format: { data: [{ id: "..." }] }
    if (data?.data && Array.isArray(data.data)) {
      return data.data.map((m: { id: string }) => m.id).filter(Boolean);
    }
    // Gemini format: { models: [{ name: "models/..." }] }
    if (data?.models && Array.isArray(data.models)) {
      return data.models
        .map((m: { name: string; supportedGenerationMethods?: string[] }) => {
          if (m.supportedGenerationMethods && !m.supportedGenerationMethods.includes('generateContent')) return null;
          return m.name.replace(/^models\//, '');
        })
        .filter(Boolean) as string[];
    }
    return [];
  } catch {
    return [];
  }
}

// ── Balance query ─────────────────────────────────────────────────────

export async function fetchBalance(
  key: string,
  baseUrl: string,
  balanceEndpoint: string,
  authHeader: string,
  authPrefix: string,
  externalSignal?: AbortSignal,
): Promise<BalanceResult> {
  if (!balanceEndpoint) return { success: false, balance: null, error: 'balanceEndpointNotConfigured' };

  const base = baseUrl.replace(/\/+$/, '');
  const ep = balanceEndpoint.startsWith('/') ? balanceEndpoint : `/${balanceEndpoint}`;
  const url = `${base}${ep}`;
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers[authHeader] = authPrefix ? `${authPrefix}${key}` : key;
  }

  try {
    const res = await fetch(url, { headers, signal: combineSignals(externalSignal, 10000) });
    if (!res.ok) return { success: false, balance: null, error: `HTTP ${res.status}` };
    const data = await res.json();

    // Try common balance response formats
    if (data?.data?.total_balance != null) return { success: true, balance: String(data.data.total_balance), error: null };
    if (data?.balance != null) return { success: true, balance: String(data.balance), error: null };
    if (data?.total_balance != null) return { success: true, balance: String(data.total_balance), error: null };
    if (data?.data?.balance != null) return { success: true, balance: String(data.data.balance), error: null };
    // OpenRouter: { data: { total_credits, total_usage } }
    if (data?.data?.total_credits != null && data?.data?.total_usage != null) {
      const totalCredits = Number(data.data.total_credits);
      const totalUsage = Number(data.data.total_usage);
      if (Number.isFinite(totalCredits) && Number.isFinite(totalUsage)) {
        return { success: true, balance: String(Number((totalCredits - totalUsage).toFixed(6))), error: null };
      }
    }
    // DeepSeek: { balance_infos: [{ currency, total_balance, ... }] }
    if (data?.balance_infos && Array.isArray(data.balance_infos) && data.balance_infos.length > 0) {
      const info = data.balance_infos[0] as { currency?: string; total_balance?: string };
      const bal = info.total_balance ?? '0';
      const currency = info.currency ?? '';
      return { success: true, balance: currency ? `${bal} ${currency}` : bal, error: null };
    }

    return { success: true, balance: JSON.stringify(data).slice(0, 200), error: null };
  } catch (e: unknown) {
    return { success: false, balance: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Retry logic ───────────────────────────────────────────────────────

export function shouldRetry(error: string | null, statusCode?: number): boolean {
  if (statusCode && [403, 502, 503, 504].includes(statusCode)) return true;
  if (!error) return false;
  const lower = error.toLowerCase();
  return ['timeout', 'network', 'fetch', '连接'].some((k) => lower.includes(k));
}

export function getRetryDelay(): number {
  return 300 + Math.random() * 500;
}
