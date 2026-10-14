import {
  addCalendarDays,
  isCalendarDate,
  localDate,
} from '../../../../libs/models/src/calendar';

describe('calendar helpers', () => {
  it('uses the requested city timezone when selecting a local calendar date', () => {
    expect(
      localDate(new Date('2026-10-14T23:30:00.000Z'), 'Europe/Warsaw'),
    ).toBe('2026-10-15');
    expect(
      localDate(new Date('2026-10-14T01:30:00.000Z'), 'America/Los_Angeles'),
    ).toBe('2026-10-13');
  });

  it('adds calendar days across daylight-saving and year boundaries', () => {
    expect(addCalendarDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addCalendarDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addCalendarDays('2026-12-29', 6)).toBe('2027-01-04');
  });

  it('distinguishes real calendar dates from malformed and impossible values', () => {
    expect(isCalendarDate('2026-10-14')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('14-10-2026')).toBe(false);
  });
});
