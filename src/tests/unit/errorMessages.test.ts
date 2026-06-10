import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import {
  getErrorDetailsText,
  getLocalizedErrorMessage,
  isDataMigrationError,
} from '@/shared/utils/errorMessages';

const STORAGE_NOT_FOUND_MESSAGE =
  'Antigravity storage.json was not found. Open the target Antigravity app and sign in once, then try switching again.';
const PROJECT_ID_MISSING_MESSAGE =
  'This account is missing an Antigravity project ID. This may happen if the account has not signed in to the Antigravity app before. Please sign in once in the Antigravity app, then return to this tool and try switching again.';
const DATABASE_PERMISSION_MESSAGE =
  'Antigravity database storage is not writable. Check the configured Antigravity user-data directory or restart Antigravity Manager after opening Antigravity once.';

function createT(): TFunction {
  return ((key: string, options?: { defaultValue?: string }) => {
    const messages: Record<string, string> = {
      'error.antigravityStorageJsonNotFound': STORAGE_NOT_FOUND_MESSAGE,
      'error.antigravityProjectIdMissing': PROJECT_ID_MISSING_MESSAGE,
      'error.antigravityDatabasePermissionDenied': DATABASE_PERMISSION_MESSAGE,
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

  it('explains missing enterprise project_id switch failures', () => {
    const message = getLocalizedErrorMessage(
      new Error(
        'Switch failed: Account user@example.com cannot be switched safely: enterprise OAuth requires a valid project_id.',
      ),
      createT(),
    );

    expect(message).toBe(PROJECT_ID_MISSING_MESSAGE);
  });

  it('explains enterprise project_id auto-resolve failures', () => {
    const message = getLocalizedErrorMessage(
      {
        message:
          'Switch failed: Account user@example.com cannot be switched safely: missing enterprise project_id and auto-resolve failed (Forbidden).',
      },
      createT(),
    );

    expect(message).toBe(PROJECT_ID_MISSING_MESSAGE);
  });

  it('explains Antigravity database permission failures', () => {
    const message = getLocalizedErrorMessage(
      new Error("EACCES: permission denied, mkdir '/usr/bin/data/user-data/User/globalStorage'"),
      createT(),
    );

    expect(message).toBe(DATABASE_PERMISSION_MESSAGE);
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
