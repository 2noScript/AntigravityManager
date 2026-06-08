import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import {
  getErrorDetailsText,
  getLocalizedErrorMessage,
  isDataMigrationError,
} from '@/shared/utils/errorMessages';

const STORAGE_NOT_FOUND_MESSAGE =
  'Antigravity storage.json was not found. Open the target Antigravity app and sign in once, then try switching again.';

function createT(): TFunction {
  return ((key: string, options?: { defaultValue?: string }) => {
    const messages: Record<string, string> = {
      'error.antigravityStorageJsonNotFound': STORAGE_NOT_FOUND_MESSAGE,
      'error.dataMigrationFailed': 'Unable to decrypt legacy account data.',
      'error.dataMigrationHint.relogin': 'Please re-login or re-add your accounts.',
    };

    return messages[key] ?? options?.defaultValue ?? key;
  }) as unknown as TFunction;
}

describe('getLocalizedErrorMessage', () => {
  it('explains missing Antigravity storage.json switch failures', () => {
    const message = getLocalizedErrorMessage(
      new Error('Switch failed: storage_json_not_found'),
      createT(),
    );

    expect(message).toBe(STORAGE_NOT_FOUND_MESSAGE);
  });

  it('explains missing Antigravity storage.json from object-shaped errors', () => {
    const message = getLocalizedErrorMessage(
      { message: 'Switch failed: storage_json_not_found' },
      createT(),
    );

    expect(message).toBe(STORAGE_NOT_FOUND_MESSAGE);
  });

  it('localizes backend messages passed through ORPC data', () => {
    const message = getLocalizedErrorMessage(
      {
        message: 'Internal server error',
        data: {
          backendMessage: 'ERR_DATA_MIGRATION_FAILED|HINT_RELOGIN',
        },
      },
      createT(),
    );

    expect(message).toBe(
      'Unable to decrypt legacy account data. Please re-login or re-add your accounts.',
    );
  });

  it('identifies data migration failures passed through ORPC data', () => {
    expect(
      isDataMigrationError({
        message: 'Internal server error',
        data: {
          backendMessage: 'ERR_DATA_MIGRATION_FAILED|HINT_RELOGIN',
        },
      }),
    ).toBe(true);

    expect(isDataMigrationError(new Error('Other failure'))).toBe(false);
  });
});

describe('getErrorDetailsText', () => {
  it('shows backend stack details from ORPC data', () => {
    const details = getErrorDetailsText({
      message: 'Internal server error',
      data: {
        requestPath: '["cloud","listCloudAccounts"]',
        backendCode: 'INTERNAL_SERVER_ERROR',
        backendStatus: 500,
        backendMessage: 'ERR_DATA_MIGRATION_FAILED|HINT_RELOGIN',
        backendStack: 'Error: ERR_DATA_MIGRATION_FAILED|HINT_RELOGIN\n    at decryptWithMigration',
      },
    });

    expect(details).toContain('Request path: ["cloud","listCloudAccounts"]');
    expect(details).toContain('Backend message: ERR_DATA_MIGRATION_FAILED|HINT_RELOGIN');
    expect(details).toContain('at decryptWithMigration');
  });
});
