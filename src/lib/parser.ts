import { z } from 'zod';

export const RawAnswerSchema = z.object({
  answer: z.union([z.string(), z.number(), z.boolean()]).transform(v => String(v).trim()),
  rationale: z.string().optional().default(''),
  self_confidence: z.number().min(0).max(1).optional().nullable(),
  selfConfidence: z.number().min(0).max(1).optional().nullable(),
});

export interface ParsedModelPayload {
  answer: string;
  rationale: string;
  selfConfidence: number | null;
}

export type ParseResult =
  | { ok: true; data: ParsedModelPayload }
  | { ok: false; error: string; rawText?: string };

/**
 * Defensive parsing pipeline for vision model outputs.
 * 1. Strips <thought>...</thought> blocks
 * 2. Strips markdown code fences (```json ... ``` or ``` ... ```)
 * 3. Extracts the first valid JSON object
 * 4. Validates with zod, coercing types and clamping rationale length
 */
export function parseDefensively(rawText: string | null | undefined): ParseResult {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return { ok: false, error: 'Empty or missing model text', rawText: rawText || '' };
  }

  // 1. Remove <thought>...</thought> blocks
  let cleaned = rawText.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();

  // 2. Remove markdown code fences
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  // 3. Extract the first valid JSON object
  let extractedJson: Record<string, unknown> | null = null;
  const firstBrace = cleaned.indexOf('{');

  if (firstBrace !== -1) {
    for (
      let lastBrace = cleaned.lastIndexOf('}');
      lastBrace > firstBrace;
      lastBrace = cleaned.lastIndexOf('}', lastBrace - 1)
    ) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        const obj = JSON.parse(candidate);
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
          extractedJson = obj;
          break;
        }
      } catch {
        // Keep narrowing candidate window
      }
    }
  }

  if (!extractedJson) {
    const fallbackMatch = cleaned.match(/\{[\s\S]*?\}/);
    if (fallbackMatch) {
      try {
        extractedJson = JSON.parse(fallbackMatch[0]);
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        return { ok: false, error: 'Malformed JSON: ' + err, rawText };
      }
    } else {
      return {
        ok: false,
        error: 'No JSON object found in response: ' + cleaned.slice(0, 80),
        rawText,
      };
    }
  }

  // 4. Validate with Zod
  const validation = RawAnswerSchema.safeParse(extractedJson);
  if (!validation.success) {
    return {
      ok: false,
      error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      rawText,
    };
  }

  const { answer, rationale, self_confidence, selfConfidence } = validation.data;

  // Clamp rationale to 200 chars if slightly verbose
  let finalRationale = rationale;
  if (finalRationale.length > 200) {
    finalRationale = finalRationale.slice(0, 197) + '...';
  }

  const finalConfidence =
    typeof self_confidence === 'number'
      ? self_confidence
      : typeof selfConfidence === 'number'
      ? selfConfidence
      : null;

  return {
    ok: true,
    data: {
      answer,
      rationale: finalRationale,
      selfConfidence: finalConfidence,
    },
  };
}

/**
 * Builds a strict retry prompt when defensive parsing fails on attempt 1.
 */
export function buildStrictRetryPrompt(basePrompt: string): string {
  return `STRICT REQUIREMENT: Respond with ONLY a single JSON object with keys "answer" (string), "rationale" (string under 200 chars), and "self_confidence" (number between 0 and 1). Do not include Markdown blocks, thoughts, or text outside the JSON.\n${basePrompt}`;
}
