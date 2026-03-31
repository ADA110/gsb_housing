import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { mockAuth } from './helpers.js';

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

describe('GET /api/user', () => {
  it('returns 401 with no auth header', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]); // ip rate limit
    sql.mockResolvedValueOnce([]);              // sessions SELECT → no session
    const res = await request(app).get('/api/user');
    expect(res.status).toBe(401);
  });

  it('returns 404 when profile does not exist', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([]); // users SELECT → no user
    const res = await request(app).get('/api/user').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
  });

  it('returns user profile when it exists', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([{ name: 'Alice', email: 'test@stanford.edu', phone: '', class_year: '2026' }]);
    const res = await request(app).get('/api/user').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Alice');
    expect(res.body.user.classYear).toBe('2026');
  });
});

describe('POST /api/user', () => {
  it('returns 401 when not authenticated', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]);
    sql.mockResolvedValueOnce([]);
    const res = await request(app).post('/api/user').send({ name: 'Alice', classYear: '2026' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    mockAuth(sql);
    const res = await request(app).post('/api/user').set('Authorization', 'Bearer valid-token').send({ classYear: '2026' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('returns 400 for invalid class year', async () => {
    mockAuth(sql);
    const res = await request(app).post('/api/user').set('Authorization', 'Bearer valid-token').send({ name: 'Alice', classYear: '2025' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/class year/i);
  });

  it('creates/updates profile and returns user', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([]); // UPSERT
    const res = await request(app).post('/api/user').set('Authorization', 'Bearer valid-token').send({ name: 'Alice', phone: '555-1234', classYear: '2026' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Alice');
    expect(res.body.user.classYear).toBe('2026');
  });
});

describe('DELETE /api/user', () => {
  it('returns success with a bearer token (logs out)', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]); // ip rate limit
    sql.mockResolvedValueOnce([]);              // DELETE sessions
    const res = await request(app).delete('/api/user').set('Authorization', 'Bearer some-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns success with no auth header (no-op)', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]);
    const res = await request(app).delete('/api/user');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
