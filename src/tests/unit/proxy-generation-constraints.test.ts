import { describe, expect, it, vi } from 'vitest';
import { ProxyGenerationConstraints } from '@/modules/proxy-gateway/server/proxy-generation-constraints';
import type { GeminiInternalRequest } from '@/modules/proxy-gateway/antigravity/types';

function createPolicy(overrides?: {
  outputLimit?: number;
  thinkingBudget?: number;
}): ProxyGenerationConstraints {
  return new ProxyGenerationConstraints({
    getModelOutputLimitForAccount: vi.fn().mockReturnValue(overrides?.outputLimit),
    getModelThinkingBudgetForAccount: vi.fn().mockReturnValue(overrides?.thinkingBudget),
  });
}

function createInternalRequest(generationConfig: Record<string, unknown>): GeminiInternalRequest {
  return {
    requestId: 'agent/1/test',
    request: {
      contents: [],
      generationConfig,
    },
    model: 'gemini-2.5-flash',
    userAgent: 'test-agent',
    requestType: 'generate-content',
  } as unknown as GeminiInternalRequest;
}

describe('ProxyGenerationConstraints', () => {
  it('converts Gemini thinking levels into budgets and reserves output tokens', () => {
    const policy = createPolicy({
      outputLimit: 20_000,
      thinkingBudget: 10_000,
    });
    const request = createInternalRequest({
      thinkingConfig: {
        thinkingLevel: 'medium',
      },
    });

    policy.applyInternalGenerationConstraints(request, 'gemini-2.5-flash', 'acc-1');

    expect(request.request.generationConfig?.thinkingConfig).toEqual({
      thinkingBudget: 8192,
    });
    expect(request.request.generationConfig?.maxOutputTokens).toBe(20_000);
  });

  it('caps negative adaptive thinking budgets by model thinking budget and output capacity', () => {
    const policy = createPolicy({
      outputLimit: 12_000,
      thinkingBudget: 8_000,
    });
    const request = createInternalRequest({
      thinkingConfig: {
        thinkingBudget: -1,
      },
    });

    policy.applyInternalGenerationConstraints(request, 'models/gemini-2.5-flash', 'acc-1');

    expect(request.request.generationConfig?.thinkingConfig).toEqual({
      thinkingBudget: 8000,
    });
    expect(request.request.generationConfig?.maxOutputTokens).toBe(12_000);
  });

  it('caps explicit max output tokens by account model output limit', () => {
    const policy = createPolicy({
      outputLimit: 4096,
      thinkingBudget: 1024,
    });
    const request = createInternalRequest({
      maxOutputTokens: 8192.9,
    });

    policy.applyInternalGenerationConstraints(request, 'gemini-2.5-flash', 'acc-1');

    expect(request.request.generationConfig?.maxOutputTokens).toBe(4096);
  });

  it('keeps Claude thinking level untouched while still capping output tokens', () => {
    const policy = createPolicy({
      outputLimit: 9000,
      thinkingBudget: 5000,
    });
    const request = createInternalRequest({
      maxOutputTokens: 12_000,
      thinkingConfig: {
        thinkingLevel: 'high',
      },
    });

    policy.applyInternalGenerationConstraints(request, 'claude-sonnet-4-5', 'acc-1');

    expect(request.request.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'high',
    });
    expect(request.request.generationConfig?.maxOutputTokens).toBe(9000);
  });
});
