// @ts-check

/**
 * Keep repeated phases because agent deltas are real activity events. The
 * renderer decides whether an event changes the visible stage.
 *
 * @param {Pick<Electron.WebContents, 'isDestroyed' | 'send'>} webContents
 * @param {() => boolean} [isCurrent]
 */
const createWalkthroughProgressReporter = (webContents, isCurrent = () => true) => {
  /** @param {import('../core/types.ts').WalkthroughProgressPhase} phase */
  return (phase) => {
    if (webContents.isDestroyed() || !isCurrent()) {
      return;
    }

    /** @type {import('../core/types.ts').WalkthroughProgressEvent} */
    const progress = { phase };
    webContents.send('codiff:walkthroughProgress', progress);
  };
};

module.exports = { createWalkthroughProgressReporter };
