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

describe('POST /api/send-code', () => {
  it('rejects non-stanford email', async () => {
    const res = await request(app).post('/api/send-code').send({ email: 'test@gmail.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stanford\.edu/);
  });

  it('rejects missing email', async () => {
    const res = await request(app).post('/api/send-code').send({});
    expect(res.status).toBe(400);
  });

  it('accepts valid stanford email when not rate-limited', async () => {
    // ip rate limit: count 1
    // rate_limits SELECT: no existing limit
    sql.mockResolvedValueOnce([{ count: 1 }]);
    sql.mockResolvedValueOnce([]);
    const res = await request(app).post('/api/send-code').send({ email: 'test@stanford.edu' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 429 when rate limit is active', async () => {
    // ip rate limit: count 1
    // rate_limits SELECT: existing limit found
    sql.mockResolvedValueOnce([{ count: 1 }]);
    sql.mockResolvedValueOnce([{ expires_at: Date.now() + 99999 }]);
    const res = await request(app).post('/api/send-code').send({ email: 'test@stanford.edu' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/30 seconds/);
  });
});

describe('POST /api/verify-code', () => {
  it('rejects missing email', async () => {
    const res = await request(app).post('/api/verify-code').send({ code: '123456' });
    expect(res.status).toBe(400);
  });

  it('rejects missing code', async () => {
    const res = await request(app).post('/api/verify-code').send({ email: 'test@stanford.edu' });
    expect(res.status).toBe(400);
  });

  it('rejects non-stanford email', async () => {
    const res = await request(app).post('/api/verify-code').send({ email: 'test@gmail.com', code: '123456' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when code is expired or not found', async () => {
    // ip rate limit, then codes SELECT returns empty
    sql.mockResolvedValueOnce([{ count: 1 }]);
    sql.mockResolvedValueOnce([]);
    const res = await request(app).post('/api/verify-code').send({ email: 'test@stanford.edu', code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired|not found/i);
  });

  it('returns 400 when code does not match', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]);
    sql.mockResolvedValueOnce([{ code: '111111' }]);
    const res = await request(app).post('/api/verify-code').send({ email: 'test@stanford.edu', code: '999999' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incorrect/i);
  });

  it('returns token and email on correct code', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]);  // ip rate limit
    sql.mockResolvedValueOnce([{ code: '123456' }]); // codes SELECT
    sql.mockResolvedValueOnce([]);  // DELETE codes
    sql.mockResolvedValueOnce([]);  // INSERT sessions
    const res = await request(app).post('/api/verify-code').send({ email: 'test@stanford.edu', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.email).toBe('test@stanford.edu');
  });
});
