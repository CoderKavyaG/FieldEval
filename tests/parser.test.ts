import { describe, it, expect } from 'vitest';
import { parseDefensively, buildStrictRetryPrompt } from '@/lib/parser';

describe('Defensive Vision Output Parser', () => {
  it('parses clean JSON accurately', () => {
    const raw = JSON.stringify({
      answer: '4',
      rationale: 'Four distinct leaves on surface',
      self_confidence: 0.92,
    });
    const result = parseDefensively(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.answer).toBe('4');
      expect(result.data.rationale).toBe('Four distinct leaves on surface');
      expect(result.data.selfConfidence).toBe(0.92);
    }
  });

  it('strips markdown code fences (```json ... ```)', () => {
    const raw = '```json\n{"answer": "7394", "rationale": "Tag digits clearly visible", "self_confidence": 0.98}\n```';
    const result = parseDefensively(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.answer).toBe('7394');
      expect(result.data.rationale).toBe('Tag digits clearly visible');
      expect(result.data.selfConfidence).toBe(0.98);
    }
  });

  it('strips <thought>...</thought> blocks before JSON extraction', () => {
    const raw = `<thought>
I see four leaves on the table.
First leaf is oak, second is maple, third is birch, fourth is pine.
</thought>
\`\`\`json
{"answer": "4", "rationale": "Four specimen leaves present", "self_confidence": 0.88}
\`\`\``;
    const result = parseDefensively(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.answer).toBe('4');
      expect(result.data.rationale).toBe('Four specimen leaves present');
      expect(result.data.selfConfidence).toBe(0.88);
    }
  });

  it('gracefully handles prose reply without JSON', () => {
    const raw = 'Based on visual inspection, there are 4 leaves on the table with no people present.';
    const result = parseDefensively(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No JSON object found');
    }
  });

  it('gracefully handles truncated JSON', () => {
    const raw = '{"answer": "4", "rationale": "The leaves are lying flat on';
    const result = parseDefensively(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/No JSON object found|Malformed JSON/);
    }
  });

  it('coerces numeric answers into string values', () => {
    const raw = '{"answer": 42, "rationale": "Count integer"}';
    const result = parseDefensively(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.answer).toBe('42');
    }
  });

  it('clamps overly verbose rationale to under 200 characters', () => {
    const longRationale = 'A'.repeat(250);
    const raw = JSON.stringify({ answer: '1', rationale: longRationale });
    const result = parseDefensively(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rationale.length).toBeLessThanOrEqual(200);
      expect(result.data.rationale.endsWith('...')).toBe(true);
    }
  });

  it('constructs a stricter retry prompt with JSON constraints', () => {
    const base = 'Count leaves';
    const strict = buildStrictRetryPrompt(base);
    expect(strict).toContain('STRICT REQUIREMENT');
    expect(strict).toContain('Count leaves');
    expect(strict).toContain('keys "answer"');
  });
});
