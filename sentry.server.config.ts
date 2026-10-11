import * as Sentry from '@sentry/nextjs';

/**
 * Sentry Server-Side Configuration (Node.js runtime)
 * Tracing for the FieldEval inference pipeline only.
 *
 * Strict Privacy Rules:
 * - NO images, image bytes, or base64 strings
 * - NO task prompts or model rationale sent to Sentry
 * - genAI inputs & outputs recording disabled
 * - sendDefaultPii disabled (dataCollection.userInfo: false)
 * - Request bodies and API keys scrubbed
 * - Sample rate 1.0 during evaluation events
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Tracing sample rate: 1.0 during event
  tracesSampleRate: 1.0,

  // Data collection controls: disable AI input/output message capture and HTTP request/response bodies
  // In Sentry v11+, dataCollection replaces and governs sendDefaultPii
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    genAI: {
      inputs: false,
      outputs: false,
    },
  },

  // Retain legacy sendDefaultPii flag for downstream compatibility
  ...({ sendDefaultPii: false } as Record<string, unknown>),

  // Scrub error and message events
  beforeSend(event) {
    // 1. Scrub request payload body
    if (event.request) {
      delete event.request.data;
      if (event.request.headers) {
        delete event.request.headers['x-goog-api-key'];
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
    }

    // 2. Scrub any API keys that might appear in error messages or breadcrumbs
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && event.message) {
      event.message = event.message.replaceAll(apiKey, '[REDACTED_API_KEY]');
    }

    return event;
  },

  // Scrub transaction events (static trace lifecycle)
  beforeSendTransaction(event) {
    if (event.spans) {
      for (const span of event.spans) {
        if (span.data) {
          delete span.data['gen_ai.prompt'];
          delete span.data['gen_ai.completion'];
          delete span.data['gen_ai.input.messages'];
          delete span.data['gen_ai.output.messages'];
          delete span.data['prompt'];
          delete span.data['rationale'];
          delete span.data['image'];
          delete span.data['imageBase64'];
        }
      }
    }
    return event;
  },

  // Scrub streamed spans (v2 trace lifecycle)
  beforeSendSpan(span) {
    if (span.attributes) {
      delete span.attributes['gen_ai.prompt'];
      delete span.attributes['gen_ai.completion'];
      delete span.attributes['gen_ai.input.messages'];
      delete span.attributes['gen_ai.output.messages'];
      delete span.attributes['prompt'];
      delete span.attributes['rationale'];
      delete span.attributes['image'];
      delete span.attributes['imageBase64'];
    }
    return span;
  },
});
