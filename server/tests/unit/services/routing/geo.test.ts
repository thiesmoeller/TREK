import { describe, it, expect } from 'vitest';
import { haversineMeters } from '../../../../src/services/routing/geo';

describe('routing/geo', () => {
  it('haversineMeters is symmetric and zero at identical points', () => {
    expect(haversineMeters(49, 11, 49, 11)).toBe(0);
    const a = haversineMeters(52.520008, 13.404954, 48.8566, 2.3522);
    const b = haversineMeters(48.8566, 2.3522, 52.520008, 13.404954);
    expect(Math.abs(a - b)).toBeLessThan(0.5);
    expect(a).toBeGreaterThan(840_000);
    expect(a).toBeLessThan(910_000);
  });
});
