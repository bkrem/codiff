declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = () =>
    ({
      addEventListener() {},
      addListener() {},
      dispatchEvent: () => false,
      matches: false,
      media: '',
      onchange: null,
      removeEventListener() {},
      removeListener() {},
    }) as MediaQueryList;
}

function scrollTo(this: HTMLElement, optionsOrX?: ScrollToOptions | number, y?: number) {
  const nextLeft =
    typeof optionsOrX === 'number' ? optionsOrX : (optionsOrX?.left ?? this.scrollLeft);
  const nextTop =
    typeof optionsOrX === 'number' ? (y ?? this.scrollTop) : (optionsOrX?.top ?? this.scrollTop);

  this.scrollLeft = nextLeft;
  this.scrollTop = nextTop;
}

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = scrollTo;
}

if (typeof Range !== 'undefined') {
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
}
