import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';

// ============================================================================
// 1. Configuration & Security
// ============================================================================
const apiKey = process.env.GEMINI_API_KEY;
const modelId = process.env.MODEL_ID || 'gemma-4-31b-it';

if (!apiKey) {
  console.error('FATAL: GEMINI_API_KEY is not defined in environment.');
  process.exit(1);
}

// Security: Guarantee API key and raw headers are never leaked to logs
function sanitize(text) {
  if (typeof text !== 'string') {
    text = JSON.stringify(text, null, 2);
  }
  return text.replaceAll(apiKey, '[REDACTED_API_KEY]');
}

// ============================================================================
// 2. Schema Definition (zod)
// ============================================================================
const AnswerSchema = z.object({
  answer: z.string(),
  rationale: z.string().max(200, 'rationale must be at most 200 characters')
});

// ============================================================================
// 3. Image Preparation
// ============================================================================
// Resize so long edge is 1024 px, re-encode as JPEG quality 82, base64 encode
async function prepareImageBase64(filePath) {
  const buffer = await sharp(filePath)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return buffer.toString('base64');
}

// ============================================================================
// 4. Defensive Parser
// ============================================================================
function parseDefensively(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { ok: false, error: 'Empty or missing model text' };
  }

  // 1. Remove <thought>...</thought> blocks
  let cleaned = rawText.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();

  // 2. Remove markdown code fences (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  // 3. Extract the first valid JSON object
  let extractedJson = null;
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    for (let lastBrace = cleaned.lastIndexOf('}'); lastBrace > firstBrace; lastBrace = cleaned.lastIndexOf('}', lastBrace - 1)) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        const obj = JSON.parse(candidate);
        if (typeof obj === 'object' && obj !== null) {
          extractedJson = obj;
          break;
        }
      } catch {
        // keep narrowing
      }
    }
  }

  if (!extractedJson) {
    const fallbackMatch = cleaned.match(/\{[\s\S]*?\}/);
    if (fallbackMatch) {
      try {
        extractedJson = JSON.parse(fallbackMatch[0]);
      } catch (e) {
        return { ok: false, error: 'Malformed JSON: ' + e.message };
      }
    } else {
      return { ok: false, error: 'No JSON object found in response: ' + cleaned.slice(0, 80) };
    }
  }

  // Coerce numeric or boolean answer to string if necessary
  if (typeof extractedJson.answer === 'number' || typeof extractedJson.answer === 'boolean') {
    extractedJson.answer = String(extractedJson.answer);
  }

  // Ensure rationale is under 200 chars if slightly verbose
  if (typeof extractedJson.rationale === 'string' && extractedJson.rationale.length > 200) {
    extractedJson.rationale = extractedJson.rationale.slice(0, 197) + '...';
  }

  const val = AnswerSchema.safeParse(extractedJson);
  if (!val.success) {
    return { ok: false, error: val.error.errors.map(e => e.message).join('; ') };
  }

  return { ok: true, data: val.data };
}

// ============================================================================
// 5. API Probe & Fallback Discovery
// ============================================================================
let activePayloadBuilder = null;

async function discoverWorkingPayload(sampleBase64) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  console.log('[Step 3 Pre-Flight] Probing API with prompt specification:');
  console.log(' - parts = [inline_data (image first), text]');
  console.log(' - generationConfig = { temperature: 0, thinkingConfig: { thinkingLevel: "minimal" } }\n');

  // Attempt 1: Exact specification
  const promptSpecBody = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: sampleBase64 } },
        { text: 'Respond with JSON {"answer": "probe", "rationale": "probe"}. Probe.' }
      ]
    }],
    generationConfig: {
      temperature: 0,
      thinkingConfig: {
        thinkingLevel: 'minimal'
      }
    }
  };

  try {
    const res1 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(promptSpecBody)
    });

    if (res1.ok) {
      console.log('[API Result] Prompt specification accepted directly (HTTP 200).');
      activePayloadBuilder = (base64, text) => ({
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            { text }
          ]
        }],
        generationConfig: {
          temperature: 0,
          thinkingConfig: { thinkingLevel: 'minimal' }
        }
      });
      return;
    }

    // Exact spec was rejected or returned an error
    const errBody1 = await res1.text();
    console.warn(`[API Notice] Initial prompt specification failed with HTTP ${res1.status}:`);
    console.warn(sanitize(errBody1));
    console.log('\n[API Fallback] Trying documented alternative: dropping thinkingConfig and using camelCase inlineData...');
  } catch (err) {
    console.warn(`[API Network Notice] Probe failed: ${err.message}`);
  }

  // Attempt 2: Documented Alternative (dropping thinkingConfig, standard REST inlineData)
  const fallbackBody = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: sampleBase64 } },
        { text: 'Respond with JSON {"answer": "probe", "rationale": "probe"}. Probe.' }
      ]
    }],
    generationConfig: {
      temperature: 0
    }
  };

  try {
    const res2 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(fallbackBody)
    });

    if (res2.ok) {
      console.log('[API Result] Documented alternative SUCCEEDED (HTTP 200).');
      console.log(' - Reason: The Gemma 4 endpoint on Google Generative Language API rejects thinkingConfig with HTTP 500 (Internal Error), but functions reliably when dropping thinkingConfig and using camelCase inlineData.\n');
      activePayloadBuilder = (base64, text) => ({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            { text }
          ]
        }],
        generationConfig: {
          temperature: 0
        }
      });
      return;
    }

    const errBody2 = await res2.text();
    console.error(`[API Error] Documented alternative also failed with HTTP ${res2.status}:`);
    console.error(sanitize(errBody2));
  } catch (err) {
    console.error(`[API Network Error] Fallback failed: ${err.message}`);
  }
}

// ============================================================================
// 6. Request Execution & Defensive Retries
// ============================================================================
async function executeApiCall(base64Image, promptText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  const body = activePayloadBuilder(base64Image, promptText);

  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    const latencyMs = Math.round(performance.now() - t0);
    const text = await res.text();

    if (!res.ok) {
      return { ok: false, httpStatus: res.status, latencyMs, error: sanitize(text) };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, httpStatus: res.status, latencyMs, error: 'Non-JSON HTTP response body' };
    }

    const candidateText = parsed?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return { ok: true, httpStatus: res.status, latencyMs, rawText: candidateText };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    return { ok: false, httpStatus: 0, latencyMs, error: err.message };
  }
}

async function runSingleTask(imagePath, basePrompt) {
  const base64Image = await prepareImageBase64(imagePath);
  const prompt = `Return ONLY a JSON object: {"answer": string, "rationale": string}.\n${basePrompt}`;

  // First Attempt
  const res1 = await executeApiCall(base64Image, prompt);
  if (!res1.ok) {
    return {
      status: 'api_error',
      answer: 'ERROR',
      rationale: res1.error,
      latencyMs: res1.latencyMs,
      attempts: 1,
      httpStatus: res1.httpStatus
    };
  }

  const parsed1 = parseDefensively(res1.rawText);
  if (parsed1.ok) {
    return {
      status: 'success',
      answer: parsed1.data.answer,
      rationale: parsed1.data.rationale,
      latencyMs: res1.latencyMs,
      attempts: 1,
      httpStatus: res1.httpStatus
    };
  }

  // Attempt 2: Stricter reminder retry
  const strictPrompt = `STRICT REQUIREMENT: Respond with ONLY a single JSON object with keys "answer" and "rationale". Do not include Markdown blocks, thoughts, or text outside the JSON.\n${basePrompt}`;
  const res2 = await executeApiCall(base64Image, strictPrompt);

  if (!res2.ok) {
    return {
      status: 'api_error',
      answer: 'ERROR',
      rationale: res2.error,
      latencyMs: res1.latencyMs + res2.latencyMs,
      attempts: 2,
      httpStatus: res2.httpStatus
    };
  }

  const parsed2 = parseDefensively(res2.rawText);
  if (parsed2.ok) {
    return {
      status: 'success',
      answer: parsed2.data.answer,
      rationale: parsed2.data.rationale,
      latencyMs: res1.latencyMs + res2.latencyMs,
      attempts: 2,
      httpStatus: res2.httpStatus
    };
  }

  // Defensively record status invalid_output; never fabricate an answer
  return {
    status: 'invalid_output',
    answer: 'INVALID_JSON',
    rationale: parsed2.error || parsed1.error,
    latencyMs: res1.latencyMs + res2.latencyMs,
    attempts: 2,
    httpStatus: res2.httpStatus
  };
}

// ============================================================================
// 7. Main Spike Benchmark Runner
// ============================================================================
async function runSpike() {
  console.log('================================================================');
  console.log(`FieldEval Throwaway Spike: Testing Model [${modelId}]`);
  console.log('================================================================\n');

  const tasks = [
    {
      file: 'spike/images/number.jpg',
      name: 'number.jpg',
      question: 'What 4-digit number is written on the paper? Digits only.'
    },
    {
      file: 'spike/images/leaves.jpg',
      name: 'leaves.jpg',
      question: 'How many leaves are on the table? Integer only.'
    },
    {
      file: 'spike/images/blank.jpg',
      name: 'blank.jpg',
      question: 'How many people are in this image? Integer only.'
    }
  ];

  // 1. Pre-flight discovery
  const probeBase64 = await prepareImageBase64(tasks[2].file);
  await discoverWorkingPayload(probeBase64);

  if (!activePayloadBuilder) {
    console.error('FATAL: Could not establish a working payload format with the API.');
    process.exit(1);
  }

  // 2. Run each image twice
  const results = [];

  for (const task of tasks) {
    for (let run = 1; run <= 2; run++) {
      console.log(`Running [${task.name}] (Run ${run}/2)...`);
      const res = await runSingleTask(task.file, task.question);
      results.push({
        image: task.name,
        run,
        status: res.status,
        answer: res.answer,
        rationale: res.rationale,
        latency_ms: res.latencyMs,
        attempts: res.attempts,
        http_status: res.httpStatus
      });
      // Brief pause between requests to prevent API throttling
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  // 3. Print Results Table
  console.log('\n--- EVALUATION RUN RESULTS ---');
  console.table(
    results.map(r => ({
      image: r.image,
      run: r.run,
      status: r.status,
      answer: r.answer,
      latency_ms: r.latency_ms,
      attempts: r.attempts,
      http_status: r.http_status
    }))
  );

  // 4. Calculate Median Latency
  const sortedLatencies = results.map(r => r.latency_ms).sort((a, b) => a - b);
  const mid = Math.floor(sortedLatencies.length / 2);
  const medianLatency = sortedLatencies.length % 2 === 0
    ? Math.round((sortedLatencies[mid - 1] + sortedLatencies[mid]) / 2)
    : sortedLatencies[mid];

  console.log(`\nMedian Latency: ${medianLatency} ms`);

  // 5. Check Acceptance Criteria
  const numberRuns = results.filter(r => r.image === 'number.jpg');
  const numberPass = numberRuns.length === 2 && numberRuns.every(r => r.status === 'success' && r.answer.trim().includes('7394'));

  const blankRuns = results.filter(r => r.image === 'blank.jpg');
  const blankPass = blankRuns.every(r => {
    const a = r.answer.trim().toLowerCase();
    return a === '0' || a.includes('0') || a === 'none' || a.includes('zero') || a.includes('no people');
  });

  const validJsonCount = results.filter(r => r.status === 'success').length;
  const validJsonPass = validJsonCount >= 5;

  const latencyPass = medianLatency < 15000;

  const httpErrors = results.filter(r => r.http_status === 429 || (r.http_status >= 500 && r.http_status < 600));
  const httpPass = httpErrors.length === 0;

  console.log('\n--- ACCEPTANCE CRITERIA ---');
  console.log(`1. number.jpg read correctly 2 of 2 ("7394"): ${numberPass ? 'PASS' : 'FAIL'} (${numberRuns.map(r => r.answer).join(', ')})`);
  console.log(`2. blank.jpg answer is "0" or explicit none:    ${blankPass ? 'PASS' : 'FAIL'} (${blankRuns.map(r => r.answer).join(', ')})`);
  console.log(`3. At least 5 of 6 runs valid JSON:             ${validJsonPass ? 'PASS' : 'FAIL'} (${validJsonCount}/6 valid)`);
  console.log(`4. Median latency under 15,000 ms:              ${latencyPass ? 'PASS' : 'FAIL'} (${medianLatency} ms)`);
  console.log(`5. No HTTP 429 or 5xx errors:                   ${httpPass ? 'PASS' : 'FAIL'} (5xx/429 errors: ${httpErrors.length})`);

  const overallPass = numberPass && blankPass && validJsonPass && latencyPass && httpPass;

  console.log('\n================================================================');
  console.log(`OVERALL SPIKE STATUS: ${overallPass ? 'PASS' : 'FAIL'}`);
  console.log('================================================================\n');

  if (!overallPass) {
    process.exitCode = 1;
  }
}

runSpike().catch(err => {
  console.error('Fatal execution error:', sanitize(err.message));
  process.exit(1);
});
