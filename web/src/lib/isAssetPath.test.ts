import { expect, test } from 'vite-plus/test';
import { isAssetPath } from './isAssetPath.ts';

test('matches Vite source modules and public assets', () => {
  expect(isAssetPath('/pages/[...].tsx')).toBe(true);
  expect(isAssetPath('/src/App.tsx')).toBe(true);
  expect(isAssetPath('/assets/app.js')).toBe(true);
  expect(isAssetPath('/icon.png')).toBe(true);
});

test('does not bypass page routing for normal application paths', () => {
  expect(isAssetPath('/')).toBe(false);
  expect(isAssetPath('/about')).toBe(false);
  expect(isAssetPath('/p/example')).toBe(false);
  expect(isAssetPath('/w/example')).toBe(false);
});
