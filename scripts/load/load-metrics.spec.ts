import { measureOperations, percentile } from './load-metrics';
import { parseLoadOptions, loadEnvironment } from './load-options';
import { createLoadFixtures } from './load-fixtures';

describe('Load harness', () => {
  it('measures completions and errors with bounded concurrency', async () => {
    let running = 0;
    let peak = 0;
    const result = await measureOperations(20, 3, async (index) => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setImmediate(resolve));
      running--;
      if (index % 5 === 0) throw new Error('fixture failure');
    });
    expect(peak).toBe(3);
    expect(result.succeeded).toBe(16);
    expect(result.errors).toBe(4);
    expect(result.errorRate).toBe(0.2);
  });
  it('uses nearest-rank percentiles and represents missing samples', () => {
    expect(percentile([1, 2, 3, 4, 5], 95)).toBe(5);
    expect(percentile([], 99)).toBeNull();
  });
  it('validates load options and targets isolated databases', () => {
    expect(
      parseLoadOptions(['--concurrency', '1,10', '--iterations=20'])
        .concurrency,
    ).toEqual([1, 10]);
    expect(() => parseLoadOptions(['--concurrency', '0'])).toThrow();
    const previous = process.env.LOAD_ACTIVITY_RANKING_DATABASE_URL;
    process.env.LOAD_ACTIVITY_RANKING_DATABASE_URL =
      'postgresql://localhost/production';
    expect(() => loadEnvironment(10)).toThrow('_load');
    if (previous === undefined)
      delete process.env.LOAD_ACTIVITY_RANKING_DATABASE_URL;
    else process.env.LOAD_ACTIVITY_RANKING_DATABASE_URL = previous;
  });
  it('generates unique cache keys and equal synthetic blob lengths', () => {
    const fixtures = createLoadFixtures(100, 512, 'fixtures');
    expect(
      new Set(fixtures.map((fixture) => fixture.request.signature)).size,
    ).toBe(100);
    expect(fixtures[0].response.benchmarkPayload.length).toBe(512);
    expect(fixtures[0].ranking.factors.benchmarkPayload).toBe(
      fixtures[0].response.benchmarkPayload,
    );
  });
});
