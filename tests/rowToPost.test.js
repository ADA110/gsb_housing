import { vi, describe, it, expect } from 'vitest';
import { searchRow, subletRow } from './helpers.js';

vi.mock('@neondatabase/serverless', () => {
  const sql = vi.fn().mockResolvedValue([{ count: 1 }]);
  return { neon: vi.fn(() => sql), sql };
});

const { rowToPost } = await import('../server.js');

describe('rowToPost — search post', () => {
  it('maps snake_case DB columns to camelCase', () => {
    const post = rowToPost(searchRow);
    expect(post.classYear).toBe('2026');
    expect(post.moveIn).toBe('2025-06-01');
    expect(post.moveOut).toBe('2025-08-31');
    expect(post.bathPrivacy).toBe('Shared bath OK');
    expect(post.budgetMax).toBe(2500);
    expect(post.genderPref).toBe('No preference');
  });

  it('createdAt is a Number', () => {
    const post = rowToPost(searchRow);
    expect(typeof post.createdAt).toBe('number');
  });

  it('beds and baths are arrays', () => {
    const post = rowToPost(searchRow);
    expect(Array.isArray(post.beds)).toBe(true);
    expect(Array.isArray(post.baths)).toBe(true);
    expect(post.beds).toEqual(['2', '3']);
  });

  it('lifestyle defaults to [] when null', () => {
    const post = rowToPost({ ...searchRow, lifestyle: null });
    expect(post.lifestyle).toEqual([]);
  });

  it('does not include sublet-only fields', () => {
    const post = rowToPost(searchRow);
    expect(post.price).toBeUndefined();
    expect(post.bedsAvail).toBeUndefined();
  });
});

describe('rowToPost — sublet post', () => {
  it('maps snake_case DB columns to camelCase', () => {
    const post = rowToPost(subletRow);
    expect(post.classYear).toBe('2027');
    expect(post.bedsAvail).toBe(1);
    expect(post.bathPrivacy).toBe('Private bath');
  });

  it('beds and baths are strings', () => {
    const post = rowToPost(subletRow);
    expect(typeof post.beds).toBe('string');
    expect(typeof post.baths).toBe('string');
    expect(post.beds).toBe('2');
  });

  it('lifestyle defaults to [] when null', () => {
    const post = rowToPost({ ...subletRow, lifestyle: null });
    expect(post.lifestyle).toEqual([]);
  });

  it('does not include search-only fields', () => {
    const post = rowToPost(subletRow);
    expect(post.budgetMax).toBeUndefined();
    expect(post.genderPref).toBeUndefined();
  });
});
