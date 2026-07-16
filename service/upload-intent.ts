export type UploadIntentTokenEnv = {
  BETTER_AUTH_SECRET?: string;
};

const encoder = new TextEncoder();
const tokenVersion = 'v1';

const base64UrlEncode = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

const base64UrlDecode = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
};

const signingKey = (env: UploadIntentTokenEnv) => {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error('Codiff sharing requires BETTER_AUTH_SECRET.');
  }
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign', 'verify'],
  );
};

const signedValue = (code: string, payload: string) => `${code}.${payload}`;

export const createUploadIntentSecret = async (
  env: UploadIntentTokenEnv,
  code: string,
  expiresAt: Date,
) => {
  const nonce = new Uint8Array(24);
  crypto.getRandomValues(nonce);
  const payload = [tokenVersion, expiresAt.getTime().toString(36), base64UrlEncode(nonce)].join(
    '.',
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(env),
    encoder.encode(signedValue(code, payload)),
  );
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
};

export const hashUploadIntentSecret = async (secret: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const verifyUploadIntentSecret = async (
  env: UploadIntentTokenEnv,
  code: string,
  secret: string,
): Promise<{ expiresAt: Date } | null> => {
  const parts = secret.split('.');
  if (parts.length !== 4 || parts[0] !== tokenVersion) {
    return null;
  }
  const [version, encodedExpiresAt, nonce, encodedSignature] = parts;
  const expiresAtMs = Number.parseInt(encodedExpiresAt!, 36);
  if (
    version !== tokenVersion ||
    !Number.isSafeInteger(expiresAtMs) ||
    expiresAtMs <= 0 ||
    !nonce ||
    !encodedSignature
  ) {
    return null;
  }

  try {
    const payload = `${version}.${encodedExpiresAt}.${nonce}`;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(env),
      base64UrlDecode(encodedSignature),
      encoder.encode(signedValue(code, payload)),
    );
    return valid ? { expiresAt: new Date(expiresAtMs) } : null;
  } catch {
    return null;
  }
};
