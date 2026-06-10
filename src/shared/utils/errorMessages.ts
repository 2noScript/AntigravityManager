import type { TFunction } from 'i18next';
import { isNumber, isObjectLike, isPlainObject, isString } from 'lodash-es';

const KEYCHAIN_ERROR_CODE = 'ERR_KEYCHAIN_UNAVAILABLE';
const KEYCHAIN_HINT_TRANSLOCATION = 'HINT_APP_TRANSLOCATION';
const KEYCHAIN_HINT_KEYCHAIN_DENIED = 'HINT_KEYCHAIN_DENIED';
const KEYCHAIN_HINT_SIGN_NOTARIZE = 'HINT_SIGN_NOTARIZE';
const DATA_MIGRATION_ERROR_CODE = 'ERR_DATA_MIGRATION_FAILED';
const DATA_MIGRATION_HINT_RELOGIN = 'HINT_RELOGIN';
const DATA_MIGRATION_HINT_CLEAR_DATA = 'HINT_CLEAR_DATA';
const ANTIGRAVITY_STORAGE_JSON_NOT_FOUND = 'storage_json_not_found';
const ENTERPRISE_PROJECT_ID_SWITCH_FAILURE = 'enterprise oauth requires a valid project_id';
const MISSING_ENTERPRISE_PROJECT_ID_SWITCH_FAILURE = 'missing enterprise project_id';
const PERMISSION_DENIED = 'permission denied';

const KEYCHAIN_HINT_I18N_MAP: Record<string, string> = {
  [KEYCHAIN_HINT_TRANSLOCATION]: 'error.keychainHint.translocation',
  [KEYCHAIN_HINT_KEYCHAIN_DENIED]: 'error.keychainHint.keychainDenied',
  [KEYCHAIN_HINT_SIGN_NOTARIZE]: 'error.keychainHint.signNotarize',
};

const DATA_MIGRATION_HINT_I18N_MAP: Record<string, string> = {
  [DATA_MIGRATION_HINT_RELOGIN]: 'error.dataMigrationHint.relogin',
  [DATA_MIGRATION_HINT_CLEAR_DATA]: 'error.dataMigrationHint.clearData',
};

function resolveKeychainMessage(hintCode: string | undefined, t: TFunction): string {
  const base = t('error.keychainUnavailable');
  if (!hintCode) {
    return base;
  }

  const hintKey = KEYCHAIN_HINT_I18N_MAP[hintCode];
  if (!hintKey) {
    return base;
  }

  return `${base} ${t(hintKey)}`;
}

function resolveDataMigrationMessage(hintCode: string | undefined, t: TFunction): string {
  const base = t('error.dataMigrationFailed');
  if (!hintCode) {
    return base;
  }

  const hintKey = DATA_MIGRATION_HINT_I18N_MAP[hintCode];
  if (!hintKey) {
    return base;
  }

  return `${base} ${t(hintKey)}`;
}

function resolveApplicationMessage(rawMessage: string, t: TFunction): string | null {
  if (rawMessage.includes(ANTIGRAVITY_STORAGE_JSON_NOT_FOUND)) {
    return t('error.antigravityStorageJsonNotFound', {
      defaultValue:
        'Antigravity storage.json was not found. Open the target Antigravity app and sign in once, then try switching again.',
    });
  }

  const normalizedMessage = rawMessage.toLowerCase();
  if (
    normalizedMessage.includes(ENTERPRISE_PROJECT_ID_SWITCH_FAILURE) ||
    normalizedMessage.includes(MISSING_ENTERPRISE_PROJECT_ID_SWITCH_FAILURE)
  ) {
    return t('error.antigravityProjectIdMissing', {
      defaultValue:
        'This account is missing an Antigravity project ID. This may happen if the account has not signed in to the Antigravity app before. Please sign in once in the Antigravity app, then return to this tool and try switching again.',
    });
  }

  if (normalizedMessage.includes('eacces') && normalizedMessage.includes(PERMISSION_DENIED)) {
    return t('error.antigravityDatabasePermissionDenied', {
      defaultValue:
        'Antigravity database storage is not writable. Check the configured Antigravity user-data directory or restart Antigravity Manager after opening Antigravity once.',
    });
  }

  return null;
}

function getObjectProperty(error: unknown, key: string): unknown {
  if (!isObjectLike(error)) {
    return undefined;
  }

  return (error as Record<string, unknown>)[key];
}

function getStringProperty(error: unknown, key: string): string | undefined {
  const value = getObjectProperty(error, key);
  return isString(value) && value ? value : undefined;
}

function getErrorData(error: unknown): Record<string, unknown> | undefined {
  const data = getObjectProperty(error, 'data');
  if (!isPlainObject(data)) {
    return undefined;
  }

  return data as Record<string, unknown>;
}

function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  const objectMessage = getStringProperty(error, 'message');
  if (objectMessage) {
    return objectMessage;
  }

  return String(error);
}

function getMessagesForResolution(error: unknown): string[] {
  const data = getErrorData(error);
  const backendMessage =
    isString(data?.backendMessage) && data.backendMessage ? data.backendMessage : '';
  const rawMessage = getRawErrorMessage(error);

  return [rawMessage, backendMessage].filter((message, index, messages) => {
    return Boolean(message) && messages.indexOf(message) === index;
  });
}

export function isDataMigrationError(error: unknown): boolean {
  return getMessagesForResolution(error).some((messageForResolution) => {
    const [code] = messageForResolution.split('|');
    return code === DATA_MIGRATION_ERROR_CODE;
  });
}

export function getLocalizedErrorMessage(error: unknown, t: TFunction): string {
  const messagesForResolution = getMessagesForResolution(error);

  for (const messageForResolution of messagesForResolution) {
    const [code, hint] = messageForResolution.split('|');
    if (code === KEYCHAIN_ERROR_CODE) {
      return resolveKeychainMessage(hint, t);
    }
    if (code === DATA_MIGRATION_ERROR_CODE) {
      return resolveDataMigrationMessage(hint, t);
    }
    const applicationMessage = resolveApplicationMessage(messageForResolution, t);
    if (applicationMessage) {
      return applicationMessage;
    }
  }

  if (messagesForResolution.length > 0) {
    return messagesForResolution[0];
  }

  return String(error);
}

export function getErrorDetailsText(error: unknown): string {
  const data = getErrorData(error);
  const rawMessage = getRawErrorMessage(error);
  const details: string[] = [];

  if (isString(data?.requestPath) && data.requestPath) {
    details.push(`Request path: ${data.requestPath}`);
  }

  if (isString(data?.backendCode) && data.backendCode) {
    details.push(`Backend code: ${data.backendCode}`);
  }

  if (isNumber(data?.backendStatus)) {
    details.push(`Backend status: ${data.backendStatus}`);
  }

  if (isString(data?.backendMessage) && data.backendMessage) {
    details.push(`Backend message: ${data.backendMessage}`);
  } else if (rawMessage) {
    details.push(`Message: ${rawMessage}`);
  }

  if (isString(data?.backendStack) && data.backendStack) {
    details.push(data.backendStack);
  } else {
    const stack = getStringProperty(error, 'stack');
    if (stack) {
      details.push(stack);
    }
  }

  if (isString(data?.backendValue) && data.backendValue) {
    details.push(`Backend value: ${data.backendValue}`);
  }

  if (details.length > 0) {
    return details.join('\n\n');
  }

  return rawMessage || String(error);
}
