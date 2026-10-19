import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRegionalHeadlines, REGIONAL_DIGESTS } from '../server/worldmonitor/intelligence/v1/chat-analyst-context.ts';
import { buildAnalystSystemPrompt } from '../server/worldmonitor/intelligence/v1/chat-analyst-prompt.ts';
import type { AnalystContext } from '../server/worldmonitor/intelligence/v1/chat-analyst-context.ts';

const digest = {
  categories: {
    'tt-news': { items: [
      { title: 'Budget 2026 debate opens in Parliament', source: 'Newsday', publishedAt: 1792400000000 },
      { title: 'Older story', source: 'TT Guardian', publishedAt: 1792300000000 },
      { title: 'Budget 2026 debate opens in Parliament', source: 'CNC3', publishedAt: 1792399000000 },
    ] },
    'tt-energy': { items: [{ title: 'Atlantic LNG train restart', source: 'Energy Chamber', publishedAt: 1792390000000 }] },
    'gy-news': { items: [{ title: 'Should not appear for TT', source: 'Stabroek', publishedAt: 1792400000000 }] },
  },
};

function baseCtx(extra: Partial<AnalystContext> = {}): AnalystContext {
  return {
    timestamp: 'now', worldBrief: '', riskScores: '', marketImplications: '', forecasts: '', marketData: '',
    macroSignals: '', predictionMarkets: '', countryBrief: '', liveHeadlines: '', relevantArticles: '',
    energyExposure: '', coalSpotPrice: '', gasSpotTtf: '', activeSources: [], degraded: false, ...extra,
  };
}

describe('regional headlines (variant digest)', () => {
  it('maps TT and GY to the hub variant digests', () => {
    assert.equal(REGIONAL_DIGESTS.TT?.variant, 'tt');
    assert.equal(REGIONAL_DIGESTS.GY?.variant, 'gy');
  });

  it('builds newest-first, de-duplicated lines from the focused country only', () => {
    const out = buildRegionalHeadlines(digest, 'TT');
    assert.match(out, /^Regional Headlines — Trinidad and Tobago/);
    const lines = out.split('\n').slice(1);
    assert.deepEqual(lines.map((l) => l.split('] ')[1]?.split(' (')[0]), [
      'Budget 2026 debate opens in Parliament', 'Older story', 'Atlantic LNG train restart',
    ]);
    assert.ok(lines[0]!.startsWith('- [tt-news]'));
    assert.ok(!out.includes('Should not appear'));
  });

  it('returns empty for unknown countries or empty digests', () => {
    assert.equal(buildRegionalHeadlines(digest, 'US'), '');
    assert.equal(buildRegionalHeadlines({ categories: {} }, 'TT'), '');
    assert.equal(buildRegionalHeadlines(null, 'TT'), '');
  });

  it('is included in the system prompt for every domain focus with the country-first instruction', () => {
    const ctx = baseCtx({ regionalHeadlines: 'Regional Headlines — Trinidad and Tobago:\n- [tt-news] Budget debate' });
    for (const domain of ['all', 'geo', 'market', 'military', 'economic']) {
      const prompt = buildAnalystSystemPrompt(ctx, domain);
      assert.ok(prompt.includes('## Regional Headlines — Trinidad and Tobago'), `missing section for ${domain}`);
      assert.ok(prompt.includes('answer from those headlines first'), `missing instruction for ${domain}`);
    }
    assert.ok(!buildAnalystSystemPrompt(baseCtx(), 'all').includes('Regional Headlines'));
  });
});
