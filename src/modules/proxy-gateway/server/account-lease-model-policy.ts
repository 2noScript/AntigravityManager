import { isNumber } from 'lodash-es';
import { type AccountLeaseTokenData, normalizeModelId } from './account-lease-token-types';

interface AccountLeaseModelLogger {
  log(message: string): void;
}

interface AccountLeaseModelPolicyOptions {
  getTokenCache: () => Map<string, AccountLeaseTokenData>;
  logger: AccountLeaseModelLogger;
}

const GEMINI_PRO_FAMILY = new Set([
  'gemini-3-pro',
  'gemini-3-pro-preview',
  'gemini-3-pro-high',
  'gemini-3-pro-low',
  'gemini-3.1-pro',
  'gemini-3.1-pro-preview',
  'gemini-3.1-pro-high',
  'gemini-3.1-pro-low',
]);

export class AccountLeaseModelPolicy {
  constructor(private readonly options: AccountLeaseModelPolicyOptions) {}

  getAllCollectedModels(): Set<string> {
    const allModels = new Set<string>();
    for (const tokenData of this.options.getTokenCache().values()) {
      for (const modelId of Object.keys(tokenData.model_quotas)) {
        allModels.add(modelId);
      }
    }
    return allModels;
  }

  getAvailableModelsFromToken(tokenData: AccountLeaseTokenData): Set<string> {
    const availableModels = new Set<string>();

    for (const modelId of Object.keys(tokenData.model_quotas ?? {})) {
      const normalized = normalizeModelId(modelId)?.toLowerCase();
      if (normalized) {
        availableModels.add(normalized);
      }
    }

    for (const modelId of Object.keys(tokenData.quota?.models ?? {})) {
      const normalized = normalizeModelId(modelId)?.toLowerCase();
      if (normalized) {
        availableModels.add(normalized);
      }
    }

    return availableModels;
  }

  buildDynamicModelCandidates(modelName: string): string[] | null {
    const normalizedModel = normalizeModelId(modelName)?.toLowerCase();
    if (!normalizedModel) {
      return null;
    }

    if (!GEMINI_PRO_FAMILY.has(normalizedModel)) {
      return null;
    }

    const candidates: string[] = [];
    const seen = new Set<string>();
    const pushCandidate = (candidate: string) => {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    };

    // Upstream rejects the '-high' suffix for gemini-3.1-pro requests, so
    // prefer the preview model before falling back to the requested variant.
    if (normalizedModel === 'gemini-3.1-pro-high' || normalizedModel === 'gemini-3.1-pro') {
      pushCandidate('gemini-3.1-pro-preview');
      pushCandidate('gemini-3.1-pro');
      pushCandidate(normalizedModel);
    } else {
      pushCandidate(normalizedModel);
    }

    pushCandidate('gemini-3.1-pro-preview');
    pushCandidate('gemini-3-pro-preview');
    pushCandidate('gemini-3.1-pro-high');
    pushCandidate('gemini-3-pro-high');
    pushCandidate('gemini-3.1-pro-low');
    pushCandidate('gemini-3-pro-low');

    return candidates;
  }

  resolveDynamicModelForAccount(accountId: string, mappedModel: string): string {
    const candidates = this.buildDynamicModelCandidates(mappedModel);
    if (!candidates) {
      return mappedModel;
    }

    const tokenData = this.options.getTokenCache().get(accountId);
    if (!tokenData) {
      return mappedModel;
    }

    const availableModels = this.getAvailableModelsFromToken(tokenData);
    if (availableModels.size === 0) {
      return mappedModel;
    }

    const normalizedMappedModel = normalizeModelId(mappedModel)?.toLowerCase() ?? mappedModel;

    for (const candidate of candidates) {
      if (!availableModels.has(candidate)) {
        continue;
      }

      if (candidate !== normalizedMappedModel) {
        this.options.logger.log(
          `[Dynamic-Model-Rewrite] account=${accountId} ${mappedModel} -> ${candidate}`,
        );
      }
      return candidate;
    }

    return mappedModel;
  }

  getModelOutputLimitForAccount(accountId: string, modelName: string): number | undefined {
    const tokenData = this.options.getTokenCache().get(accountId);
    const normalizedModel = normalizeModelId(modelName);
    if (!tokenData || !normalizedModel) {
      return undefined;
    }
    return tokenData.model_limits[normalizedModel];
  }

  getModelThinkingBudgetForAccount(accountId: string, modelName: string): number | undefined {
    const tokenData = this.options.getTokenCache().get(accountId);
    const normalizedModel = normalizeModelId(modelName);
    if (!tokenData || !normalizedModel) {
      return undefined;
    }

    for (const [quotaModelName, modelInfo] of Object.entries(tokenData.quota?.models ?? {})) {
      if (normalizeModelId(quotaModelName) !== normalizedModel) {
        continue;
      }
      const budget = modelInfo?.thinking_budget;
      if (isNumber(budget) && Number.isFinite(budget) && budget >= 0) {
        return Math.floor(budget);
      }
    }
    return undefined;
  }
}
