import * as Sentry from '@sentry/nextjs';

/**
 * Edge Runtime Sentry Configuration (disabled - inference is on Node.js runtime)
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: false,
  ...({ sendDefaultPii: false } as Record<string, unknown>),
});
