import { describe, expect, it } from 'vitest';
import {
  formatMatchTaiwanTime,
  TIME_PENDING_LABEL,
  toTaiwanTime,
} from './constants';

describe('match kickoff time formatting', () => {
  it('prefers confirmed kickoff_utc over venue local_date', () => {
    expect(formatMatchTaiwanTime({
      local_date: '06/21/2026 12:00',
      kickoff_utc: '2026-06-21T19:00:00Z',
      kickoff_status: 'confirmed',
    })).toBe('2026/06/22 03:00');

    expect(formatMatchTaiwanTime({
      local_date: '06/21/2026 12:00',
      kickoff_utc: '2026-06-21T16:00:00Z',
      kickoff_status: 'confirmed',
    })).toBe('2026/06/22 00:00');
  });

  it('does not present timezone-missing local_date as a precise kickoff time', () => {
    expect(formatMatchTaiwanTime({
      local_date: '06/21/2026 12:00',
      kickoff_status: 'local_time_timezone_missing',
    })).toBe(TIME_PENDING_LABEL);
  });

  it('keeps the legacy fallback for old payloads without kickoff metadata', () => {
    expect(toTaiwanTime('06/21/2026 12:00')).toBe('2026/06/22 00:00');
    expect(formatMatchTaiwanTime({ local_date: '06/21/2026 12:00' })).toBe('2026/06/22 00:00');
  });
});
