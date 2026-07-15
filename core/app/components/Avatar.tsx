import { useState } from 'react';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const getNameParts = (name: string) => {
  const parts = [];
  for (const part of name.normalize('NFC').trim().split(/\s+/)) {
    let normalizedPart = '';
    for (const character of part) {
      if (/[\p{L}\p{M}\p{N}]/u.test(character)) {
        normalizedPart += character;
      }
    }
    if (/[\p{L}\p{N}]/u.test(normalizedPart)) {
      parts.push(normalizedPart);
    }
  }
  return parts;
};

const getGraphemes = (value: string) =>
  [...graphemeSegmenter.segment(value)].map(({ segment }) => segment);

const getInitial = (part: string) => getGraphemes(part.toLocaleUpperCase())[0] ?? '';

const getAvatarInitials = (name: string) => {
  const parts = getNameParts(name);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return getGraphemes(parts[0].toLocaleUpperCase()).slice(0, 2).join('');
  }
  return `${getInitial(parts[0])}${getInitial(parts.at(-1) ?? '')}` || '?';
};

function Avatar({ name, size, url }: { name: string; size: 'medium' | 'small'; url?: string }) {
  const className = `avatar ${size}`;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url && failedUrl !== url;

  return showImage ? (
    <img
      alt=""
      className={className}
      draggable={false}
      onError={() => setFailedUrl(url)}
      src={url}
    />
  ) : (
    <span aria-hidden className={`${className} fallback`}>
      {getAvatarInitials(name)}
    </span>
  );
}

export { Avatar };
