import { describe, expect, it } from 'vitest';
import { progressPercent } from './MasterDataPanel';

describe('progressPercent', () => {
  it('menghitung persen dari yang diambil terhadap total', () => {
    expect(progressPercent({ fetched: 0, progress_total: 1311 })).toBe(0);
    expect(progressPercent({ fetched: 655, progress_total: 1311 })).toBe(50);
    expect(progressPercent({ fetched: 1311, progress_total: 1311 })).toBe(100);
  });

  it('tidak melebihi 100 persen', () => {
    expect(progressPercent({ fetched: 2000, progress_total: 1311 })).toBe(100);
  });

  it('null bila total tidak diketahui atau nol', () => {
    expect(progressPercent({ fetched: 10, progress_total: null })).toBeNull();
    expect(progressPercent({ fetched: 10, progress_total: 0 })).toBeNull();
  });
});
