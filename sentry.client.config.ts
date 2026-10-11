import * as Sentry from '@sentry/nextjs';

/**
 * Client-Side Sentry Configuration (disabled - inference pipeline is server-only)
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  enabled: false,
  ...({ sendDefaultPii: false } as Record<string, unknown>),
});
