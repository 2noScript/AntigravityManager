import type { AccountLeaseAccountStore, AccountLeaseUpstream } from './account-lease-adapters';
import {
  buildAccountLeaseQuotaSnapshot,
  findEarliestQuotaResetTime,
  type AccountLeaseQuotaSnapshot,
} from './account-lease-quota-policy';
import type { AccountLeaseTokenData } from './account-lease-token-types';
import { RateLimitReason } from './rate-limit-tracker';
import { updateDynamicForwardingRules } from '../antigravity/ModelMapping';

interface AccountLeaseQuotaRefreshLogger {
  warn(message: string, error?: unknown): void;
}

interface AccountLeaseQuotaRefreshPolicyOptions {
  accountStore: AccountLeaseAccountStore;
  upstream: AccountLeaseUpstream;
  getTokenCache: () => Map<string, AccountLeaseTokenData>;
  setLockoutUntilIso: (
    accountId: string,
    resetTime: string,
    reason: RateLimitReason,
    model?: string,
  ) => boolean;
  logger: AccountLeaseQuotaRefreshLogger;
}

export class AccountLeaseQuotaRefreshPolicy {
  constructor(private readonly options: AccountLeaseQuotaRefreshPolicyOptions) {}

  applyModelForwardingRules(snapshot: AccountLeaseQuotaSnapshot): void {
    for (const [oldModel, newModel] of Object.entries(snapshot.modelForwardingRules)) {
      updateDynamicForwardingRules(oldModel, newModel);
    }
  }

  setPreciseLockoutFromCachedQuota(
    accountId: string,
    reason: RateLimitReason,
    model?: string,
  ): boolean {
    const tokenData = this.options.getTokenCache().get(accountId);
    if (!tokenData) {
      return false;
    }

    const resetTime = findEarliestQuotaResetTime(tokenData.model_reset_times);
    if (!resetTime) {
      return false;
    }

    return this.options.setLockoutUntilIso(accountId, resetTime, reason, model);
  }

  async refreshRealtimeQuotaAndSetPreciseLockout(
    accountId: string,
    reason: RateLimitReason,
    model?: string,
  ): Promise<boolean> {
    const tokenData = this.options.getTokenCache().get(accountId);
    if (!tokenData) {
      return false;
    }

    try {
      const latestQuota = await this.options.upstream.fetchQuota(
        tokenData.access_token,
        tokenData.upstream_proxy_url,
      );
      const extractedState = buildAccountLeaseQuotaSnapshot(latestQuota);
      this.applyModelForwardingRules(extractedState);

      tokenData.quota = latestQuota;
      tokenData.model_quotas = extractedState.modelQuotas;
      tokenData.model_limits = extractedState.modelLimits;
      tokenData.model_reset_times = extractedState.modelResetTimes;
      tokenData.model_forwarding_rules = extractedState.modelForwardingRules;
      this.options.getTokenCache().set(accountId, tokenData);

      await this.options.accountStore.updateQuota(accountId, latestQuota);

      const resetTime = findEarliestQuotaResetTime(extractedState.modelResetTimes);
      if (!resetTime) {
        return false;
      }
      return this.options.setLockoutUntilIso(accountId, resetTime, reason, model);
    } catch (error) {
      this.options.logger.warn(`Failed to refresh realtime quota for account ${accountId}`, error);
      return false;
    }
  }
}
