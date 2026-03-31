import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { mockAuth, searchRow, subletRow } from './helpers.js';

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

const profileRow = { name: 'Alice', email: 'test@stanford.edu', phone: '', class_year: '2026' };
const searchBody = { type: 'search', city: 'San Francisco', moveIn: '2025-06-01', moveOut: '2025-08-31' };
const subletBody = { type: 'sublet', city: 'New York', moveIn: '2025-07-01', moveOut: '2025-09-30', price: 3000 };

describe('GET /api/posts', () => {
  it('returns empty array when no posts', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]); // ip rate limit
    sql.mockResolvedValueOnce([]);              // posts SELECT
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
  });

  it('returns mapped posts with camelCase fields', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]);
    sql.mockResolvedValueOnce([searchRow]);
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    const post = res.body.posts[0];
    expect(post.classYear).toBe('2026');
    expect(post.moveIn).toBe('2025-06-01');
    expect(post.budgetMax).toBe(2500);
  });
});

describe('POST /api/posts', () => {
  it('returns 401 when not authenticated', async () => {
    sql.mockResolvedValueOnce([{ count: 1 }]);
    sql.mockResolvedValueOnce([]);
    const res = await request(app).post('/api/posts').send(searchBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 when profile does not exist', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([]); // users SELECT → no profile
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer token').send(searchBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile/i);
  });

  it('returns 400 when required fields are missing', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([profileRow]);
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer token').send({ type: 'search' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for sublet without price', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([profileRow]);
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer token')
      .send({ type: 'sublet', city: 'SF', moveIn: '2025-06-01', moveOut: '2025-08-31' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price/i);
  });

  it('creates a search post (201)', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([profileRow]); // users SELECT
    sql.mockResolvedValueOnce([]);           // INSERT post
    sql.mockResolvedValueOnce([searchRow]);  // SELECT new row
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer token').send(searchBody);
    expect(res.status).toBe(201);
    expect(res.body.post.type).toBe('search');
    expect(res.body.post.classYear).toBe('2026');
  });

  it('creates a sublet post (201)', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([profileRow]);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([subletRow]);
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer token').send(subletBody);
    expect(res.status).toBe(201);
    expect(res.body.post.type).toBe('sublet');
    expect(res.body.post.price).toBe(3000);
  });
});

describe('PUT /api/posts', () => {
  it('returns 400 when id is missing', async () => {
    mockAuth(sql);
    const res = await request(app).put('/api/posts').set('Authorization', 'Bearer token').send(searchBody);
    expect(res.status).toBe(400);
  });

  it('returns 404 when post not found', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([]); // posts SELECT → not found
    const res = await request(app).put('/api/posts?id=p999').set('Authorization', 'Bearer token').send(searchBody);
    expect(res.status).toBe(404);
  });

  it('returns 403 when post belongs to another user', async () => {
    mockAuth(sql, 'other@stanford.edu');
    sql.mockResolvedValueOnce([{ ...searchRow, email: 'alice@stanford.edu' }]);
    const res = await request(app).put('/api/posts?id=p123').set('Authorization', 'Bearer token').send(searchBody);
    expect(res.status).toBe(403);
  });

  it('updates a search post successfully', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([{ ...searchRow, email: 'test@stanford.edu' }]); // ownership check
    sql.mockResolvedValueOnce([]);              // UPDATE
    sql.mockResolvedValueOnce([searchRow]);     // SELECT updated row
    const res = await request(app).put('/api/posts?id=p123').set('Authorization', 'Bearer token')
      .send({ ...searchBody, moveIn: '2025-06-15' });
    expect(res.status).toBe(200);
    expect(res.body.post).toBeDefined();
  });
});

describe('DELETE /api/posts', () => {
  it('returns 400 when id is missing', async () => {
    mockAuth(sql);
    const res = await request(app).delete('/api/posts').set('Authorization', 'Bearer token');
    expect(res.status).toBe(400);
  });

  it('returns 404 when post not found', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([]); // posts SELECT → not found
    const res = await request(app).delete('/api/posts?id=p999').set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
  });

  it('returns 403 when not the owner', async () => {
    mockAuth(sql, 'other@stanford.edu');
    sql.mockResolvedValueOnce([{ email: 'alice@stanford.edu' }]);
    const res = await request(app).delete('/api/posts?id=p123').set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('deletes own post successfully', async () => {
    mockAuth(sql);
    sql.mockResolvedValueOnce([{ email: 'test@stanford.edu' }]); // ownership check
    sql.mockResolvedValueOnce([]);                                // DELETE
    const res = await request(app).delete('/api/posts?id=p123').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
