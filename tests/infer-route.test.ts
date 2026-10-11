import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/infer/route';
import { resetRateLimiterForTests } from '@/lib/rate-limiter';
import type { VisionProvider } from '@/lib/providers';
import type { ModelResult } from '@/lib/schema';

// Mock getVisionProvider to eliminate real network/API access during tests
vi.mock('@/lib/providers', () => ({
  getVisionProvider: vi.fn(),
}));

import { getVisionProvider } from '@/lib/providers';

describe('Server Route /api/infer', () => {
  const mockInferResult: ModelResult = {
    status: 'ok',
    answer: '4',
    rationale: 'Verified test output',
    selfConfidence: 0.95,
    latencyMs: 120,
    latency_ms: 120,
    attempts: 1,
    errorMessage: null,
  };

  const mockProvider: VisionProvider = {
    id: 'mock',
    infer: vi.fn().mockResolvedValue(mockInferResult),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimiterForTests();
    vi.mocked(getVisionProvider).mockReturnValue(mockProvider);
  });

  const validPayload = {
    imageBase64: Buffer.from('mock-small-image-bytes').toString('base64'),
    mimeType: 'image/jpeg',
    taskId: 'task-specimen-count',
    sessionId: '123e4567-e89b-12d3-a456-426614174000',
  };

  it('accepts valid payload and returns typed ModelResult', async () => {
    const req = new NextRequest('http://localhost:3000/api/infer', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.answer).toBe('4');
    expect(mockProvider.infer).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown taskId with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/infer', {
      method: 'POST',
      body: JSON.stringify({ ...validPayload, taskId: 'non-existent-task-id' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.errorMessage).toContain('Unknown taskId');
    expect(mockProvider.infer).not.toHaveBeenCalled();
  });

  it('rejects disallowed mime types (e.g. image/gif) with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/infer', {
      method: 'POST',
      body: JSON.stringify({ ...validPayload, mimeType: 'image/gif' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.errorMessage).toContain('Invalid mimeType');
    expect(mockProvider.infer).not.toHaveBeenCalled();
  });

  it('rejects decoded images exceeding 1.5MB with HTTP 400', async () => {
    // Generate base64 string that decodes to > 1.5MB
    const largeLength = Math.ceil((1.6 * 1024 * 1024 * 4) / 3);
    const oversizedBase64 = 'A'.repeat(largeLength);

    const req = new NextRequest('http://localhost:3000/api/infer', {
      method: 'POST',
      body: JSON.stringify({ ...validPayload, imageBase64: oversizedBase64 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.errorMessage).toContain('exceeds the 1.5MB limit');
    expect(mockProvider.infer).not.toHaveBeenCalled();
  });

  it('enforces in-memory rate limit of 20 requests per IP per hour', async () => {
    const ip = '192.168.1.100';

    // Send 20 allowed requests
    for (let i = 0; i < 20; i++) {
      const req = new NextRequest('http://localhost:3000/api/infer', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': ip,
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }

    // 21st request should be rate-limited
    const req21 = new NextRequest('http://localhost:3000/api/infer', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ip,
      },
    });
    const res21 = await POST(req21);
    expect(res21.status).toBe(429);
    const data21 = await res21.json();
    expect(data21.status).toBe('rate_limited');
    expect(data21.errorMessage).toContain('Maximum 20 requests per IP per hour');
  });

  it('enforces global daily cap', async () => {
    process.env.DAILY_CAP = '2';

    // 2 requests allowed
    for (let i = 0; i < 2; i++) {
      const req = new NextRequest('http://localhost:3000/api/infer', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': `10.0.0.${i}`,
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }

    // 3rd request hits global daily cap
    const req3 = new NextRequest('http://localhost:3000/api/infer', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.99',
      },
    });
    const res3 = await POST(req3);
    expect(res3.status).toBe(429);
    const data3 = await res3.json();
    expect(data3.status).toBe('rate_limited');
    expect(data3.errorMessage).toContain('Global daily inference limit');

    delete process.env.DAILY_CAP;
  });
});
