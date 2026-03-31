import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('@neondatabase/serverless', () => {
  const sql = vi.fn().mockResolvedValue([{ count: 1 }]);
  return { neon: vi.fn(() => sql), sql };
});

const { sql } = await import('@neondatabase/serverless');
const app = (await import('../server.js')).default;

beforeEach(() => {
  sql.mockReset();
  sql.mockResolvedValue([{ count: 1 }]);
});

describe('IP rate limiting middleware', () => {
  it('blocks requests when count exceeds 60', async () => {
    sql.mockResolvedValueOnce([{ count: 61 }]); // ip_rate_limits INSERT RETURNING
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many requests/i);
  });

  it('allows requests when count is exactly at the limit (60)', async () => {
    sql.mockResolvedValueOnce([{ count: 60 }]); // ip_rate_limits
    sql.mockResolvedValueOnce([]);              // posts SELECT
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
  });

  it('allows requests when count is below the limit', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]); // ip_rate_limits
    sql.mockResolvedValueOnce([]);              // posts SELECT
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
  });

  it('does not block when the rate limit DB call throws (fail-open)', async () => {
    sql.mockRejectedValueOnce(new Error('DB connection error'));
    sql.mockResolvedValueOnce([]); // posts SELECT
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
  });
});
