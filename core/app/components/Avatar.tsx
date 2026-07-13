import { useState } from 'react';

const getNameParts = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => [...part].filter((character) => /[\p{L}\p{N}]/u.test(character)).join(''))
    .filter(Boolean);

const getInitial = (part: string) => [...part][0]?.toLocaleUpperCase() ?? '';

const getAvatarInitials = (name: string) => {
  const parts = getNameParts(name);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return [...parts[0]].slice(0, 2).join('').toLocaleUpperCase();
  }
  return `${getInitial(parts[0])}${getInitial(parts.at(-1) ?? '')}` || '?';
};

function Avatar({
  fallback,
  size,
  url,
}: {
  fallback: string;
  size: 'medium' | 'small';
  url?: string;
}) {
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
      {getAvatarInitials(fallback)}
    </span>
  );
}

export { Avatar };
