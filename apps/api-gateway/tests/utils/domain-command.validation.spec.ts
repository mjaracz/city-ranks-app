import { commandCity } from '../../src/utils/domain-command.validation';

describe('Command request validation', () => {
  it('returns normalized command city names', () => {
    expect(commandCity(' Porto ')).toBe('Porto');
  });
  it('rejects invalid city input without coercion', () => {
    expect(() => commandCity(1)).toThrow(
      'City must contain 1 to 120 characters',
    );
  });
});
