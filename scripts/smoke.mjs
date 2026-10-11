import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target URL from CLI arg, environment variable, or local fallback
const targetUrl = (process.argv[2] || process.env.DEPLOY_URL || 'http://localhost:3000').replace(/\/+$/, '');

console.log('='.repeat(60));
console.log(`FieldEval Smoke Test Runner`);
console.log(`Target URL: ${targetUrl}`);
console.log(`Timestamp:  ${new Date().toISOString()}`);
console.log('='.repeat(60));

let passedChecks = 0;
let totalChecks = 4;

async function runSmokeTests() {
  // 1. Home Page Loads
  console.log('\n[1/4] Checking Home Page (GET /)...');
  try {
    const res = await fetch(`${targetUrl}/`);
    const text = await res.text();
    if (res.status === 200 && (text.includes('FIELDEVAL') || text.includes('FieldEval'))) {
      console.log(`  ✓ PASS: HTTP ${res.status} OK (Returned ${text.length} bytes, found "FIELDEVAL")`);
      passedChecks++;
    } else {
      console.error(`  ✗ FAIL: HTTP ${res.status}, body snippet: ${text.slice(0, 150)}...`);
    }
  } catch (err) {
    console.error(`  ✗ FAIL: Connection error: ${err.message}`);
  }

  // 2. Manifest is Served
  console.log('\n[2/4] Checking PWA Web Manifest (GET /manifest.json)...');
  try {
    const res = await fetch(`${targetUrl}/manifest.json`);
    if (res.status === 200) {
      const manifest = await res.json();
      if (manifest.name === 'FieldEval' || manifest.short_name === 'FieldEval') {
        console.log(`  ✓ PASS: HTTP ${res.status} OK (PWA Manifest valid: name="${manifest.name}", icons=${manifest.icons?.length || 0})`);
        passedChecks++;
      } else {
        console.error(`  ✗ FAIL: Manifest missing name:`, manifest);
      }
    } else {
      console.error(`  ✗ FAIL: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`  ✗ FAIL: Connection error: ${err.message}`);
  }

  // 3. /api/infer rejects bad request with a 4xx
  console.log('\n[3/4] Checking Bad Request Handling (POST /api/infer with invalid payload)...');
  try {
    const badPayload = {
      imageBase64: 'not-an-image',
      mimeType: 'image/gif', // Invalid mimeType (only jpeg/png/webp allowed)
      taskId: 'unknown-task-id-xyz',
      sessionId: 'test-session',
    };

    const res = await fetch(`${targetUrl}/api/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badPayload),
    });

    const body = await res.json().catch(() => null);

    if (res.status >= 400 && res.status < 500) {
      console.log(`  ✓ PASS: HTTP ${res.status} Client Error as expected.`);
      console.log(`         Error response: ${body?.error || body?.errorMessage || JSON.stringify(body)}`);
      passedChecks++;
    } else {
      console.error(`  ✗ FAIL: Expected 4xx, got HTTP ${res.status}:`, body);
    }
  } catch (err) {
    console.error(`  ✗ FAIL: Connection error: ${err.message}`);
  }

  // 4. Good request with sample image returns status ok
  console.log('\n[4/4] Checking Real Inference Pipeline (POST /api/infer with valid sample image)...');
  try {
    // Look for a local sample image to send
    const candidatePaths = [
      path.resolve(__dirname, '../public/samples/blank.jpg'),
      path.resolve(__dirname, '../spike/images/blank.jpg'),
      path.resolve(__dirname, '../public/samples/leaves.jpg'),
    ];

    let imageBuffer = null;
    let selectedPath = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        imageBuffer = fs.readFileSync(p);
        selectedPath = p;
        break;
      }
    }

    if (!imageBuffer) {
      throw new Error('No local sample JPEG found in public/samples or spike/images.');
    }

    const imageBase64 = imageBuffer.toString('base64');
    console.log(`  -> Sending sample image (${path.basename(selectedPath)}, ${imageBuffer.length} bytes, base64: ${imageBase64.length} chars)`);

    const goodPayload = {
      imageBase64,
      mimeType: 'image/jpeg',
      taskId: 'task-negative-control',
      sessionId: `smoke-session-${Date.now()}`,
    };

    const startTime = performance.now();
    const res = await fetch(`${targetUrl}/api/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goodPayload),
    });

    const elapsedMs = Math.round(performance.now() - startTime);
    const result = await res.json();

    if (res.status === 200 && result.status === 'ok') {
      console.log(`  ✓ PASS: HTTP ${res.status} OK in ${elapsedMs}ms`);
      console.log(`         Model Result: status="${result.status}", answer="${result.answer}"`);
      console.log(`         Confidence: ${result.selfConfidence ?? 'N/A'}, Latency: ${result.latencyMs ?? result.latency_ms ?? elapsedMs}ms`);
      console.log(`         Rationale: "${result.rationale?.slice(0, 80) || ''}..."`);
      passedChecks++;
    } else {
      console.error(`  ✗ FAIL: HTTP ${res.status}, result:`, result);
    }
  } catch (err) {
    console.error(`  ✗ FAIL: Inference check failed: ${err.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Smoke Test Summary: ${passedChecks}/${totalChecks} checks passed`);
  console.log('='.repeat(60));

  if (passedChecks === totalChecks) {
    console.log('🎉 ALL SMOKE TESTS PASSED!');
    process.exit(0);
  } else {
    console.error(`⚠️ ${totalChecks - passedChecks} check(s) failed.`);
    process.exit(1);
  }
}

runSmokeTests();
