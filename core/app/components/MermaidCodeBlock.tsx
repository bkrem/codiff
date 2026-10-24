import {
  appendCodeBlockEditorDescriptor$,
  type CodeBlockEditorDescriptor,
  type CodeBlockEditorProps,
  CodeMirrorEditor,
  realmPlugin,
} from '@nkzw/mdx-editor/core';
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getCachedMermaidDiagram,
  type MermaidDiagram,
  type MermaidTheme,
  renderMermaidDiagram,
} from '../../lib/mermaid.ts';

const getMermaidTheme = (element: Element | null): MermaidTheme =>
  element && getComputedStyle(element).colorScheme === 'dark' ? 'dark' : 'default';

function useMermaidTheme(ref: RefObject<HTMLElement | null>) {
  const [theme, setTheme] = useState<MermaidTheme | null>(null);

  useLayoutEffect(() => {
    const update = () => setTheme(getMermaidTheme(ref.current));
    update();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'], subtree: true });
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, [ref]);

  return theme;
}

function MermaidCodeBlock(props: CodeBlockEditorProps) {
  const { code } = props;
  const ref = useRef<HTMLDivElement>(null);
  const theme = useMermaidTheme(ref);
  const [rendered, setRendered] = useState<{
    code: string;
    diagram: MermaidDiagram | null;
  } | null>(null);
  const cached = theme ? getCachedMermaidDiagram(code, theme) : null;

  useEffect(() => {
    if (!theme || cached) {
      return;
    }

    let cancelled = false;
    renderMermaidDiagram(code, theme).then(
      (diagram) => !cancelled && setRendered({ code, diagram }),
      () => !cancelled && setRendered({ code, diagram: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [cached, code, theme]);

  // A diagram from the previous theme stays visible until the new one is ready.
  const diagram = cached ?? (rendered?.code === code ? rendered.diagram : undefined);

  return (
    <div className="codiff-mermaid-block" ref={ref}>
      {theme == null ? null : diagram ? (
        <img
          alt="Mermaid diagram"
          className="codiff-mermaid-diagram"
          decoding="async"
          height={diagram.height}
          src={diagram.src}
          width={diagram.width}
        />
      ) : (
        <>
          <CodeMirrorEditor {...props} />
          {diagram === null ? (
            <div className="codiff-mermaid-error">Unable to render Mermaid diagram</div>
          ) : null}
        </>
      )}
    </div>
  );
}

const mermaidDescriptor: CodeBlockEditorDescriptor = {
  Editor: MermaidCodeBlock,
  match: (language) => language?.toLowerCase() === 'mermaid',
  priority: 2,
};

export const mermaidPlugin = realmPlugin({
  init: (realm) => realm.pub(appendCodeBlockEditorDescriptor$, mermaidDescriptor),
});
