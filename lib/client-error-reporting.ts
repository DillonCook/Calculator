type ErrorSeverity = 'info' | 'warning' | 'error';

interface ClientErrorPayload {
  source: string;
  operation?: string;
  severity?: ErrorSeverity;
  message: string;
  stack?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

const MAX_STRING_LENGTH = 700;
const MAX_STACK_LENGTH = 1800;
const REDACTED = '[redacted]';

const sensitiveKeyPattern = /(authorization|cookie|deal|email|key|listing|password|payload|secret|token|url)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const urlPattern = /\bhttps?:\/\/[^\s"'<>]+/gi;

const truncate = (value: string, maxLength = MAX_STRING_LENGTH) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const sanitizeString = (value: string) => truncate(value.replace(emailPattern, '[email]').replace(urlPattern, '[url]'));

const sanitizeMetadataValue = (value: unknown, depth = 0): unknown => {
  if (depth > 2) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((entry) => sanitizeMetadataValue(entry, depth + 1));

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, entry]) => [key, sensitiveKeyPattern.test(key) ? REDACTED : sanitizeMetadataValue(entry, depth + 1)])
    );
  }

  return String(value);
};

const sanitizeMetadata = (metadata?: Record<string, unknown>) => {
  if (!metadata) return undefined;
  return sanitizeMetadataValue(metadata) as Record<string, unknown>;
};

const shouldReportClientErrors = () =>
  process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_CLIENT_ERROR_LOGS === '1';

export const reportClientError = (payload: ClientErrorPayload) => {
  if (typeof window === 'undefined' || !shouldReportClientErrors()) return;

  const body = JSON.stringify({
    source: truncate(payload.source, 80),
    operation: payload.operation ? truncate(payload.operation, 80) : undefined,
    severity: payload.severity ?? 'error',
    message: sanitizeString(payload.message),
    stack: payload.stack ? truncate(sanitizeString(payload.stack), MAX_STACK_LENGTH) : undefined,
    userId: payload.userId ?? null,
    route: `${window.location.pathname}${window.location.search ? '?[query]' : ''}`,
    release: process.env.NEXT_PUBLIC_APP_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null,
    metadata: sanitizeMetadata(payload.metadata)
  });

  try {
    if ('sendBeacon' in navigator) {
      const sent = navigator.sendBeacon('/api/client-errors', new Blob([body], { type: 'application/json' }));
      if (sent) return;
    }
  } catch {
    // Fall through to fetch when sendBeacon is blocked.
  }

  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  }).catch(() => {
    // Error logging should never disrupt the calculator.
  });
};

export const toClientErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : 'Unknown client error';
  }
  return 'Unknown client error';
};
