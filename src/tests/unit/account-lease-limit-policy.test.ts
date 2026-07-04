import { describe, expect, it, vi } from 'vitest';
import { AccountLeaseLimitPolicy } from '@/modules/proxy-gateway/server/account-lease-limit-policy';
import { RateLimitReason } from '@/modules/proxy-gateway/server/rate-limit-tracker';

function createPolicy() {
  const logger = {
    warn: vi.fn(),
  };
  const refreshRealtimeQuotaAndSetPreciseLockout = vi.fn().mockResolvedValue(false);
  const setPreciseLockoutFromCachedQuota = vi.fn().mockReturnValue(false);
  const policy = new AccountLeaseLimitPolicy({
    rateLimitCooldownMs: 300_000,
    forbiddenCooldownMs: 1_800_000,
    resolveAccountId: (accountIdOrEmail) =>
      accountIdOrEmail === 'lease@example.com' ? 'acc-1' : null,
    getCircuitBreakerBackoffSteps: () => [60, 300],
    refreshRealtimeQuotaAndSetPreciseLockout,
    setPreciseLockoutFromCachedQuota,
    logger,
  });

  return {
    logger,
    policy,
    refreshRealtimeQuotaAndSetPreciseLockout,
    setPreciseLockoutFromCachedQuota,
  };
}

describe('AccountLeaseLimitPolicy', () => {
  it('applies legacy account cooldowns through resolved account ids', () => {
    const { policy } = createPolicy();

    policy.markAsRateLimited('lease@example.com');

    expect(policy.isRateLimited('acc-1')).toBe(true);
  });

  it('routes quota exhaustion without retry hints through precise lockout callbacks', async () => {
    const { policy, refreshRealtimeQuotaAndSetPreciseLockout, setPreciseLockoutFromCachedQuota } =
      createPolicy();

    refreshRealtimeQuotaAndSetPreciseLockout.mockResolvedValue(true);

    await policy.markFromUpstreamError({
      accountIdOrEmail: 'lease@example.com',
      status: 429,
      model: 'models/gemini-2.5-flash',
      body: 'quota exhausted',
    });

    expect(refreshRealtimeQuotaAndSetPreciseLockout).toHaveBeenCalledWith(
      'acc-1',
      RateLimitReason.QuotaExhausted,
      'gemini-2.5-flash',
    );
    expect(setPreciseLockoutFromCachedQuota).not.toHaveBeenCalled();
  });

  it('keeps account-level cooldown for non-quota upstream rate limits', async () => {
    const { policy, refreshRealtimeQuotaAndSetPreciseLockout } = createPolicy();

    await policy.markFromUpstreamError({
      accountIdOrEmail: 'acc-1',
      status: 429,
      model: 'gemini-2.5-flash',
      body: JSON.stringify({
        error: {
          details: [{ reason: 'RATE_LIMIT_EXCEEDED' }],
        },
      }),
    });

    expect(refreshRealtimeQuotaAndSetPreciseLockout).not.toHaveBeenCalled();
    expect(policy.isRateLimited('acc-1', 'gemini-2.5-pro')).toBe(true);
  });
});
