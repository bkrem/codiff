import { defineMiddleware } from 'void';
import { isAssetPath } from '../src/lib/isAssetPath.ts';

const isAssetBinding = (value: unknown): value is { fetch(request: Request): Promise<Response> } =>
  typeof value === 'object' &&
  value !== null &&
  'fetch' in value &&
  typeof value.fetch === 'function';

export default defineMiddleware(async (context, next) => {
  const request = context.req.raw;
  const assets = context.env.ASSETS;
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    isAssetPath(new URL(request.url).pathname) &&
    isAssetBinding(assets)
  ) {
    const response = await assets.fetch(request);
    if (response.status !== 404) {
      return response;
    }
  }

  await next();
});
