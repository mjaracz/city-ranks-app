import {
  commandCity,
  commandCoordinates,
} from '../../src/utils/domain-command.validation';

describe('Command request validation', () => {
  it('returns validated values without numeric coercion', () => {
    expect(commandCity(' Porto ')).toBe('Porto');
    expect(commandCoordinates(undefined, undefined)).toBeUndefined();
    expect(commandCoordinates(0, 0)).toEqual({ latitude: 0, longitude: 0 });
  });
  it('distinguishes incomplete coordinate pairs from invalid ranges and invalid cities', () => {
    expect(() => commandCoordinates(0, undefined)).toThrow('provided together');
    expect(() => commandCoordinates(null, null)).toThrow(
      'outside valid ranges',
    );
    expect(() => commandCoordinates('0', 0)).toThrow('outside valid ranges');
    expect(() => commandCity(1)).toThrow(
      'City must contain 1 to 120 characters',
    );
  });
});
