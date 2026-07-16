import type { SharingFateEnv } from '@nkzw/codiff-service/fate';
import { defineHandler } from 'void';
import { fateLiveRoute } from '../src/server/routes.ts';

const handle = defineHandler((context) =>
  fateLiveRoute.fetch(
    context.req.raw,
    context.env as unknown as SharingFateEnv,
    context.executionCtx,
  ),
);

export const GET = handle;
export const POST = handle;
