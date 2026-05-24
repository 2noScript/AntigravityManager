import { Entry } from '@napi-rs/keyring';
import { execFileSync, spawnSync } from 'child_process';
import { logger } from '@/shared/logging/logger';

export interface CredentialStoreTokenInput {
  access_token: string;
  refresh_token: string;
  expiry_timestamp: number;
}

function buildCredentialStorePayload(token: CredentialStoreTokenInput): string {
  const expiry = new Date(token.expiry_timestamp * 1000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, '.$1000Z');
  return JSON.stringify({
    token: {
      access_token: token.access_token,
      token_type: 'Bearer',
      refresh_token: token.refresh_token,
      expiry,
    },
    auth_method: 'consumer',
  });
}

export function writeAntigravityCredentialStoreToken(token: CredentialStoreTokenInput): void {
  const payload = buildCredentialStorePayload(token);
  logger.info('Writing Antigravity token to system credential store');

  if (process.platform === 'darwin') {
    const value = `go-keyring-base64:${Buffer.from(payload, 'utf-8').toString('base64')}`;
    try {
      execFileSync('security', ['delete-generic-password', '-s', 'gemini', '-a', 'antigravity'], {
        stdio: 'ignore',
      });
    } catch {
      // Missing previous credential is acceptable.
    }

    execFileSync(
      'security',
      ['add-generic-password', '-s', 'gemini', '-a', 'antigravity', '-w', value, '-A'],
      { stdio: 'ignore' },
    );
    return;
  }

  if (process.platform === 'win32') {
    const entry = Entry.withTarget('gemini:antigravity', 'gemini', 'antigravity');
    try {
      entry.deleteCredential();
    } catch {
      // Missing previous credential is acceptable.
    }

    entry.setSecret(Buffer.from(payload, 'utf-8'));
    return;
  }

  const result = spawnSync(
    'secret-tool',
    ['store', '--label=gemini', 'service', 'gemini', 'username', 'antigravity'],
    { input: payload, encoding: 'utf-8' },
  );

  if (result.status !== 0) {
    throw new Error(
      `Linux secret-tool failed: ${result.stderr || result.error?.message || 'unknown error'}`,
    );
  }
}
