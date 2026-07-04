import { describe, expect, it, vi } from 'vitest';
import type {
  AccountLeaseAccountStore,
  AccountLeaseUpstream,
} from '@/modules/proxy-gateway/server/account-lease-adapters';
import { AccountLeaseQuotaRefreshPolicy } from '@/modules/proxy-gateway/server/account-lease-quota-refresh-policy';
import type { AccountLeaseTokenData } from '@/modules/proxy-gateway/server/account-lease-token-types';
import { RateLimitReason } from '@/modules/proxy-gateway/server/rate-limit-tracker';

function createToken(overrides: Partial<AccountLeaseTokenData> = {}): AccountLeaseTokenData {
  return {
    account_id: 'acc-1',
    email: 'lease@example.com',
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
    expiry_timestamp: Math.floor(Date.now() / 1000) + 3600,
    model_quotas: {},
    model_limits: {},
    model_reset_times: {},
    model_forwarding_rules: {},
    ...overrides,
  };
}

function createPolicy(tokenCache: Map<string, AccountLeaseTokenData>) {
  const accountStore: AccountLeaseAccountStore = {
    getAccounts: vi.fn(),
    getAccount: vi.fn(),
    updateToken: vi.fn(),
    updateQuota: vi.fn(),
  };
  const upstream: AccountLeaseUpstream = {
    fetchQuota: vi.fn(),
    refreshAccessToken: vi.fn(),
    fetchProjectId: vi.fn(),
    normalizeRefreshedOAuthClientKey: vi.fn(),
  };
  const setLockoutUntilIso = vi.fn().mockReturnValue(true);
  const logger = {
    warn: vi.fn(),
  };
  const policy = new AccountLeaseQuotaRefreshPolicy({
    accountStore,
    upstream,
    getTokenCache: () => tokenCache,
    setLockoutUntilIso,
    logger,
  });

  return {
    accountStore,
    logger,
    policy,
    setLockoutUntilIso,
    upstream,
  };
}

describe('AccountLeaseQuotaRefreshPolicy', () => {
  it('sets precise lockout from cached quota reset times', () => {
    const tokenCache = new Map([
      [
        'acc-1',
        createToken({
          model_reset_times: {
            'gemini-2.5-flash': '2026-06-20T08:00:00.000Z',
          },
        }),
      ],
    ]);
    const { policy, setLockoutUntilIso } = createPolicy(tokenCache);

    expect(
      policy.setPreciseLockoutFromCachedQuota(
        'acc-1',
        RateLimitReason.QuotaExhausted,
        'gemini-2.5-flash',
      ),
    ).toBe(true);
    expect(setLockoutUntilIso).toHaveBeenCalledWith(
      'acc-1',
      '2026-06-20T08:00:00.000Z',
      RateLimitReason.QuotaExhausted,
      'gemini-2.5-flash',
    );
  });

  it('refreshes realtime quota, persists it, and applies precise lockout', async () => {
    const token = createToken({
      upstream_proxy_url: 'http://127.0.0.1:8080',
    });
    const tokenCache = new Map([['acc-1', token]]);
    const { accountStore, policy, setLockoutUntilIso, upstream } = createPolicy(tokenCache);
    const quota = {
      models: {
        'models/gemini-2.5-flash': {
          percentage: 12,
          resetTime: '2026-06-20T08:30:00.000Z',
          max_output_tokens: 4096,
        },
      },
    };

    vi.mocked(upstream.fetchQuota).mockResolvedValue(quota);

    await expect(
      policy.refreshRealtimeQuotaAndSetPreciseLockout(
        'acc-1',
        RateLimitReason.QuotaExhausted,
        'gemini-2.5-flash',
      ),
    ).resolves.toBe(true);

    expect(upstream.fetchQuota).toHaveBeenCalledWith('access-token', 'http://127.0.0.1:8080');
    expect(accountStore.updateQuota).toHaveBeenCalledWith('acc-1', quota);
    expect(tokenCache.get('acc-1')).toEqual(
      expect.objectContaining({
        model_quotas: {
          'gemini-2.5-flash': 12,
        },
        model_limits: {
          'gemini-2.5-flash': 4096,
        },
      }),
    );
    expect(setLockoutUntilIso).toHaveBeenCalledWith(
      'acc-1',
      '2026-06-20T08:30:00.000Z',
      RateLimitReason.QuotaExhausted,
      'gemini-2.5-flash',
    );
  });
});
