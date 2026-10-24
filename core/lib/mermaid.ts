import type { Mermaid } from 'mermaid';

export type MermaidTheme = 'dark' | 'default';

export type MermaidDiagram = {
  height?: number;
  src: string;
  width?: number;
};

const cacheLimit = 50;
const cache = new Map<string, MermaidDiagram>();

let mermaidModule: Promise<Mermaid> | undefined;
let initializedTheme: MermaidTheme | null = null;
let queue: Promise<unknown> = Promise.resolve();
let renderCount = 0;

const getCacheKey = (code: string, theme: MermaidTheme) => `${theme}\n${code}`;

const loadMermaid = () =>
  (mermaidModule ??= import('mermaid').then(
    ({ default: mermaid }) => mermaid,
    (error: unknown) => {
      mermaidModule = undefined;
      throw error;
    },
  ));

export const getSvgSize = (svg: string): { height: number; width: number } | undefined => {
  const viewBox = /<svg\b[^>]*?\sviewBox\s*=\s*["']([^"']+)["']/i.exec(svg)?.[1];
  const [, , width, height] =
    viewBox
      ?.trim()
      .split(/[\s,]+/)
      .map(Number) ?? [];
  return width && height && Number.isFinite(width) && Number.isFinite(height)
    ? { height: Math.ceil(height), width: Math.ceil(width) }
    : undefined;
};

export const toSvgDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const getCachedMermaidDiagram = (code: string, theme: MermaidTheme) => {
  const key = getCacheKey(code, theme);
  const diagram = cache.get(key);
  if (diagram) {
    cache.delete(key);
    cache.set(key, diagram);
  }
  return diagram ?? null;
};

// Renders run one at a time: Mermaid's config is global and each render mounts a temporary node.
export const renderMermaidDiagram = (code: string, theme: MermaidTheme) => {
  const cached = getCachedMermaidDiagram(code, theme);
  if (cached) {
    return Promise.resolve(cached);
  }

  const result = queue.then(async () => {
    const key = getCacheKey(code, theme);
    const queued = cache.get(key);
    if (queued) {
      return queued;
    }

    const mermaid = await loadMermaid();
    if (initializedTheme !== theme) {
      mermaid.initialize({
        htmlLabels: false,
        layout: 'dagre',
        securityLevel: 'strict',
        startOnLoad: false,
        suppressErrorRendering: true,
        theme,
      });
      initializedTheme = theme;
    }

    const { svg } = await mermaid.render(`codiff-mermaid-${++renderCount}`, code);
    const diagram: MermaidDiagram = { ...getSvgSize(svg), src: toSvgDataUrl(svg) };
    cache.set(key, diagram);
    if (cache.size > cacheLimit) {
      cache.delete(cache.keys().next().value!);
    }
    return diagram;
  });

  queue = result.catch(() => {});
  return result;
};
