import { describe, it, expect } from 'vitest';
import { PATCH_NOTES, LATEST_PATCH_VERSION, hasUnseenNotes } from './patchNotes.js';

describe('PATCH_NOTES', () => {
  it('is non-empty and newest-first (descending version)', () => {
    expect(PATCH_NOTES.length).toBeGreaterThan(0);
    for (let i = 1; i < PATCH_NOTES.length; i++) {
      expect(PATCH_NOTES[i - 1].version).toBeGreaterThan(PATCH_NOTES[i].version);
    }
  });
  it('each note has version, date, title, items[]', () => {
    PATCH_NOTES.forEach((n) => {
      expect(typeof n.version).toBe('number');
      expect(typeof n.date).toBe('string');
      expect(typeof n.title).toBe('string');
      expect(Array.isArray(n.items)).toBe(true);
    });
  });
});

describe('LATEST_PATCH_VERSION', () => {
  it('equals the highest version', () => {
    expect(LATEST_PATCH_VERSION).toBe(PATCH_NOTES[0].version);
  });
});

describe('hasUnseenNotes', () => {
  it('true when lastSeen < latest', () => {
    expect(hasUnseenNotes(LATEST_PATCH_VERSION - 1)).toBe(true);
  });
  it('false when lastSeen >= latest', () => {
    expect(hasUnseenNotes(LATEST_PATCH_VERSION)).toBe(false);
    expect(hasUnseenNotes(LATEST_PATCH_VERSION + 1)).toBe(false);
  });
  it('treats undefined/0 as unseen', () => {
    expect(hasUnseenNotes(undefined)).toBe(true);
    expect(hasUnseenNotes(0)).toBe(true);
  });
});
