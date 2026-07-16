import type { SharingEnv } from '@nkzw/codiff-service/api';
import { defineHandler } from 'void';
import { handleFateRequest } from '../src/server/routes.ts';

const handle = defineHandler((context) =>
  handleFateRequest(
    context.req.raw,
    context.env as unknown as SharingEnv,
    context.get('__voidAuth'),
  ),
);

export const GET = handle;
export const POST = handle;
