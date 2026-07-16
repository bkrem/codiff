import '@nkzw/codiff-core/styles.css';
import '../src/styles.css';
import { StrictMode } from 'react';
import { FateClient } from 'react-fate';
import { createFateClient } from 'react-fate/client';
import App from '../src/App.tsx';

const fate = createFateClient({
  headers: () => {
    const headers = new Headers();
    const secret = new URLSearchParams(window.location.search).get('secret');
    if (secret) {
      headers.set('x-codiff-upload-secret', secret);
    }
    return headers;
  },
});

export default function CodiffPage() {
  return (
    <StrictMode>
      <FateClient client={fate}>
        <App />
      </FateClient>
    </StrictMode>
  );
}
