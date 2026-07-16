import type { SharingFateEnv } from '@nkzw/codiff-service/fate';
import {
  createCloudflareFateLive,
  createCloudflareFateLiveDurableObject,
  defineCloudflareFateLiveStream,
} from 'cf-fate/server';

export const fateLive = createCloudflareFateLive<SharingFateEnv>();
export const { live } = fateLive;

type FateStream = ReturnType<typeof defineCloudflareFateLiveStream<SharingFateEnv>>;
const registry = globalThis as typeof globalThis & {
  __codiffPublicFateStream?: FateStream;
};

export const fateStream =
  registry.__codiffPublicFateStream ??
  (registry.__codiffPublicFateStream = defineCloudflareFateLiveStream<SharingFateEnv>({
    allowAnonymousControl: true,
    binding: 'FATE_LIVE',
    id: 'fate',
  }));

export const FateLiveDurableObject = createCloudflareFateLiveDurableObject({
  binding: 'FATE_LIVE',
});
