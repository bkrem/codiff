import type { SharingEnv } from '@nkzw/codiff-service/api';
import { defineHandler } from 'void';
import { handleApiRequest } from '../../src/server/routes.ts';

const handle = defineHandler((context) =>
  handleApiRequest(
    context.req.raw,
    context.env as unknown as SharingEnv,
    context.get('__voidAuth'),
  ),
);

export const GET = handle;
export const POST = handle;
