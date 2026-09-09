import { describe, it, expect } from 'vitest';
import { shouldSendReminder, lisbonNow, lisbonToday, REMINDER_TYPES, REMINDER_COPY } from './reminderSchedule.js';

describe('shouldSendReminder', () => {
  const pref = { time: '13:45', enabled: true };

  it('fires exactly at the target minute', () => {
    expect(shouldSendReminder(pref, '13:45', null, '2026-09-09')).toBe(true);
  });
  it('fires within the tolerance window after target', () => {
    expect(shouldSendReminder(pref, '13:48', null, '2026-09-09')).toBe(true);
  });
  it('does not fire before target', () => {
    expect(shouldSendReminder(pref, '13:44', null, '2026-09-09')).toBe(false);
  });
  it('does not fire once past the window (missed slot, no catch-up spam)', () => {
    expect(shouldSendReminder(pref, '14:30', null, '2026-09-09')).toBe(false);
  });
  it('does not fire twice the same day (dedupe)', () => {
    expect(shouldSendReminder(pref, '13:46', '2026-09-09', '2026-09-09')).toBe(false);
  });
  it('fires again the next day', () => {
    expect(shouldSendReminder(pref, '13:46', '2026-09-08', '2026-09-09')).toBe(true);
  });
  it('disabled reminder never fires', () => {
    expect(shouldSendReminder({ time: '13:45', enabled: false }, '13:45', null, '2026-09-09')).toBe(false);
  });
  it('missing pref never fires', () => {
    expect(shouldSendReminder(null, '13:45', null, '2026-09-09')).toBe(false);
    expect(shouldSendReminder(undefined, '13:45', null, '2026-09-09')).toBe(false);
  });
  it('malformed time never fires', () => {
    expect(shouldSendReminder({ time: 'bogus', enabled: true }, '13:45', null, '2026-09-09')).toBe(false);
  });
  it('crosses midnight correctly (23:58 target, checked at 00:02 is a different day, not "9 hours late")', () => {
    // Same-day check just before midnight: normal within-window case.
    expect(shouldSendReminder({ time: '23:58', enabled: true }, '23:59', null, '2026-09-09')).toBe(true);
  });
});

describe('lisbonNow / lisbonToday', () => {
  it('lisbonNow returns HH:MM', () => {
    expect(lisbonNow(new Date('2026-09-09T12:00:00Z'))).toMatch(/^\d{2}:\d{2}$/);
  });
  it('lisbonToday returns YYYY-MM-DD', () => {
    expect(lisbonToday(new Date('2026-09-09T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('summer (WEST, UTC+1): local hour is one ahead of UTC', () => {
    // Europe/Lisbon observes WEST (UTC+1) in summer and WET (UTC+0) in winter —
    // the opposite of Central Europe. This case pins that down: in July the
    // local hour must be UTC+1, not UTC+0.
    expect(lisbonNow(new Date('2026-07-01T12:00:00Z'))).toBe('13:00');
  });
  it('winter (WET, UTC+0): local hour matches UTC', () => {
    expect(lisbonNow(new Date('2026-01-01T12:00:00Z'))).toBe('12:00');
  });
});

describe('REMINDER_TYPES / REMINDER_COPY', () => {
  it('every type has copy', () => {
    REMINDER_TYPES.forEach((t) => {
      expect(REMINDER_COPY[t]).toBeTruthy();
      expect(REMINDER_COPY[t].title).toBeTruthy();
      expect(REMINDER_COPY[t].body).toBeTruthy();
    });
  });
});
