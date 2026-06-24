import type {
  MarkdownAnnotation,
  MarkdownAnnotationAnchor,
  MarkdownAnnotationLayout,
  MarkdownCommentTarget,
} from '@nkzw/mdx-editor';
import { frontmatterPlugin, imagePlugin } from '@nkzw/mdx-editor/core';
import {
  PersistentMarkdownEditor,
  type MarkdownPersistenceAdapter,
  type PersistentMarkdownEditorHandle,
} from '@nkzw/mdx-editor/persistence';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { CodiffMarkdownDocument } from '../../types.ts';

const persistenceAdapter: MarkdownPersistenceAdapter<CodiffMarkdownDocument> = {
  save: ({ content, document }) =>
    window.codiff.saveMarkdownDocument({
      baseVersion: document.version,
      content,
      kind: document.kind,
      path: document.path,
    }),
};

const markdownDocumentPlugins = [
  frontmatterPlugin(),
  imagePlugin({
    disableImageResize: true,
    disableImageSettingsButton: true,
  }),
];

const isMarkdownParseError = (error: Error) =>
  /^(Error parsing markdown|Parsing of the following markdown structure failed|Unsupported markdown syntax):/.test(
    error.message,
  );

export type MarkdownDocumentEditorHandle = {
  createAnnotation: (
    id: string,
    target?: MarkdownCommentTarget | null,
  ) => MarkdownAnnotationAnchor | null;
  flush: () => Promise<boolean>;
  focusAnnotation: (id: string) => void;
  getAnnotationAnchor: (id: string) => MarkdownAnnotationAnchor | null;
  removeAnnotation: (id: string) => void;
};

export const MarkdownDocumentEditor = forwardRef<
  MarkdownDocumentEditorHandle,
  {
    activeAnnotationId?: string | null;
    annotations?: ReadonlyArray<MarkdownAnnotation>;
    autoFocus?: boolean;
    className?: string;
    document: CodiffMarkdownDocument;
    onAnnotationAnchorChange?: (id: string, anchor: MarkdownAnnotationAnchor | null) => void;
    onAnnotationLayoutChange?: (layouts: ReadonlyArray<MarkdownAnnotationLayout>) => void;
    onCommentTargetChange?: (target: MarkdownCommentTarget | null) => void;
    onDocumentChange?: (document: CodiffMarkdownDocument) => void;
    onHeightChange?: (height: number) => void;
    readOnly?: boolean;
  }
>(function MarkdownDocumentEditor(
  {
    activeAnnotationId,
    annotations = [],
    autoFocus = false,
    className,
    document: initialDocument,
    onAnnotationAnchorChange,
    onAnnotationLayoutChange,
    onCommentTargetChange,
    onDocumentChange,
    onHeightChange,
    readOnly = false,
  },
  forwardedRef,
) {
  const [document, setDocument] = useState(initialDocument);
  const [unsupportedMarkdown, setUnsupportedMarkdown] = useState(false);
  const editorRef = useRef<PersistentMarkdownEditorHandle<CodiffMarkdownDocument>>(null);

  useImperativeHandle(
    forwardedRef,
    () => ({
      createAnnotation: (id, target) => editorRef.current?.createAnnotation(id, target) ?? null,
      flush: () => editorRef.current?.flush() ?? Promise.resolve(true),
      focusAnnotation: (id) => editorRef.current?.focusAnnotation(id),
      getAnnotationAnchor: (id) => editorRef.current?.getAnnotationAnchor(id) ?? null,
      removeAnnotation: (id) => editorRef.current?.removeAnnotation(id),
    }),
    [],
  );

  useEffect(
    () =>
      window.codiff.onMarkdownDocumentChanged((change) => {
        if (change.id !== document.id || change.deleted) {
          return;
        }
        setDocument(change.document);
        onDocumentChange?.(change.document);
        setUnsupportedMarkdown(false);
        editorRef.current?.applyExternalChange(change.document);
      }),
    [document.id, onDocumentChange],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      event.stopPropagation();
      void editorRef.current?.flush();
    }
  };

  if (unsupportedMarkdown) {
    return (
      <div className={`${className ? `${className} ` : ''}codiff-markdown-editor-unsupported`}>
        <div className="codiff-markdown-editor-message error" role="alert">
          This file contains Markdown syntax the inline editor cannot safely preserve. Open the file
          in your editor or view it as a diff.
        </div>
        <pre className="codiff-markdown-editor-source">{document.content}</pre>
      </div>
    );
  }

  return (
    <PersistentMarkdownEditor
      activeAnnotationId={activeAnnotationId}
      adapter={persistenceAdapter}
      additionalPlugins={markdownDocumentPlugins}
      annotations={annotations}
      ariaLabel={`Edit ${document.path}`}
      autoFocus={autoFocus}
      className={className}
      colorScheme="inherit"
      density="document"
      document={document}
      onAnnotationAnchorChange={onAnnotationAnchorChange}
      onAnnotationLayoutChange={onAnnotationLayoutChange}
      onCommentTargetChange={onCommentTargetChange}
      onDocumentChange={(nextDocument) => {
        setDocument(nextDocument);
        onDocumentChange?.(nextDocument);
      }}
      onError={(error) => {
        if (isMarkdownParseError(error)) {
          setUnsupportedMarkdown(true);
        }
      }}
      onHeightChange={onHeightChange}
      onKeyDown={handleKeyDown}
      readOnly={readOnly}
      ref={editorRef}
      spellCheck
      variant="plain"
    />
  );
});

export const RepositoryMarkdownEditor = forwardRef<
  MarkdownDocumentEditorHandle,
  {
    onHeightChange?: (height: number) => void;
    path: string;
  }
>(function RepositoryMarkdownEditor({ onHeightChange, path }, forwardedRef) {
  const [loadState, setLoadState] = useState<{
    document?: CodiffMarkdownDocument;
    error?: string;
    path: string;
  } | null>(null);

  useEffect(() => {
    let canceled = false;
    void window.codiff
      .getMarkdownDocument({ kind: 'repository', path })
      .then((nextDocument) => {
        if (!canceled) {
          setLoadState({ document: nextDocument, path });
        }
      })
      .catch((loadError: unknown) => {
        if (!canceled) {
          setLoadState({
            error: loadError instanceof Error ? loadError.message : String(loadError),
            path,
          });
        }
      });
    return () => {
      canceled = true;
    };
  }, [path]);

  const currentLoadState = loadState?.path === path ? loadState : null;
  if (currentLoadState?.error) {
    return (
      <div className="codiff-markdown-editor-message error" role="alert">
        {currentLoadState.error}
      </div>
    );
  }

  return currentLoadState?.document ? (
    <MarkdownDocumentEditor
      className="codiff-markdown-document-editor"
      document={currentLoadState.document}
      key={currentLoadState.document.id}
      onHeightChange={onHeightChange}
      ref={forwardedRef}
    />
  ) : (
    <div className="codiff-markdown-editor-message">Loading…</div>
  );
});
