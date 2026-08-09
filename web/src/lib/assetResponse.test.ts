import { expect, test } from 'vite-plus/test';
import { makeAssetResponseMutable } from './assetResponse.ts';

test('clones asset binding responses with mutable headers', () => {
  const immutable = Response.redirect('https://codiff.dev/icon.png');
  const response = makeAssetResponseMutable(immutable);

  expect(() => response.headers.set('x-auth-session', 'available')).not.toThrow();
  expect(response.headers.get('x-auth-session')).toBe('available');
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('https://codiff.dev/icon.png');
});
