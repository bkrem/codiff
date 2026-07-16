const viteSourcePath = /^\/(?:pages|src)\//;
const filePath = /\/[^/]+\.[^/]+$/;

export const isAssetPath = (pathname: string) =>
  viteSourcePath.test(pathname) || filePath.test(pathname);
