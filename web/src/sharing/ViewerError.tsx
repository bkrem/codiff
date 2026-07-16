import { errorMessage } from './utils.ts';

export default function ViewerError({ detail, title }: { detail?: unknown; title: string }) {
  return (
    <main className="codiff-web-viewer-error">
      <strong>{title}</strong>
      {detail === undefined ? null : <p>{errorMessage(detail)}</p>}
    </main>
  );
}
