import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { getSvgSize, renderMermaidDiagram, toSvgDataUrl } from '../lib/mermaid.ts';

const renderSvg = async (id: string, code: string) => ({
  diagramType: 'flowchart',
  svg: `<svg id="${id}" viewBox="0 0 120.4 80"><text>${code}</text></svg>`,
});

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn<(id: string, code: string) => Promise<{ diagramType: string; svg: string }>>(),
}));

vi.mock('mermaid', () => ({ default: mermaid }));

beforeEach(() => {
  mermaid.initialize.mockClear();
  mermaid.render.mockReset();
  mermaid.render.mockImplementation(renderSvg);
});

test('getSvgSize reads the viewBox and rounds up', () => {
  expect(getSvgSize('<svg width="100%" viewBox="0 0 120.4 80"></svg>')).toEqual({
    height: 80,
    width: 121,
  });
  expect(getSvgSize('<svg viewBox=\'-8 -8 200,100\' style="max-width: 200px">')).toEqual({
    height: 100,
    width: 200,
  });
  expect(getSvgSize('<svg width="100%"></svg>')).toBe(undefined);
  expect(getSvgSize('<svg viewBox="0 0 0 10"></svg>')).toBe(undefined);
});

test('toSvgDataUrl encodes the SVG into an image data URL', () => {
  const svg = '<svg><style>#a{fill:"red"} .b{width:50%}</style></svg>';
  const url = toSvgDataUrl(svg);
  const prefix = 'data:image/svg+xml;charset=utf-8,';

  expect(url.startsWith(prefix)).toBe(true);
  expect(url.slice(prefix.length)).not.toMatch(/[#"<>]/);
  expect(decodeURIComponent(url.slice(prefix.length))).toBe(svg);
});

test('renderMermaidDiagram renders with strict security, dagre layout, and the theme', async () => {
  const diagram = await renderMermaidDiagram('flowchart TD\nconfig-->dark', 'dark');

  expect(mermaid.initialize).toHaveBeenLastCalledWith(
    expect.objectContaining({
      htmlLabels: false,
      layout: 'dagre',
      securityLevel: 'strict',
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: 'dark',
    }),
  );
  expect(diagram).toEqual({
    height: 80,
    src: expect.stringMatching(/^data:image\/svg\+xml;charset=utf-8,/),
    width: 121,
  });

  await renderMermaidDiagram('flowchart TD\nconfig-->light', 'default');
  expect(mermaid.initialize).toHaveBeenLastCalledWith(
    expect.objectContaining({ theme: 'default' }),
  );
});

test('renderMermaidDiagram caches diagrams per code and theme', async () => {
  const code = 'flowchart TD\ncache-->hit';

  const first = await renderMermaidDiagram(code, 'default');
  const second = await renderMermaidDiagram(code, 'default');
  expect(second).toBe(first);
  expect(mermaid.render).toHaveBeenCalledTimes(1);

  await renderMermaidDiagram(code, 'dark');
  expect(mermaid.render).toHaveBeenCalledTimes(2);
});

test('renderMermaidDiagram never runs two renders at once', async () => {
  let active = 0;
  let maxActive = 0;
  mermaid.render.mockImplementation(async (id: string, code: string) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { diagramType: 'flowchart', svg: `<svg id="${id}"><text>${code}</text></svg>` };
  });

  await Promise.all([
    renderMermaidDiagram('flowchart TD\nqueue-->one', 'default'),
    renderMermaidDiagram('flowchart TD\nqueue-->two', 'default'),
    renderMermaidDiagram('flowchart TD\nqueue-->three', 'default'),
  ]);

  expect(mermaid.render).toHaveBeenCalledTimes(3);
  expect(maxActive).toBe(1);
});

test('renderMermaidDiagram does not cache failed renders', async () => {
  const code = 'flowchart TD\nretry-->later';
  mermaid.render.mockRejectedValueOnce(new Error('Parse error'));

  await expect(renderMermaidDiagram(code, 'default')).rejects.toThrow('Parse error');
  await expect(renderMermaidDiagram(code, 'default')).resolves.toMatchObject({
    src: expect.stringMatching(/^data:image\/svg\+xml/),
  });
  expect(mermaid.render).toHaveBeenCalledTimes(2);
});
