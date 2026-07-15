// @ts-check

const { open } = require('node:fs/promises');

const MAX_SESSION_READ_BYTES = 16 * 1024 * 1024;

/** @param {string} path */
const readSessionFileTail = async (path) => {
  /** @type {import('node:fs/promises').FileHandle | undefined} */
  let handle;

  try {
    handle = await open(path, 'r');
    const file = await handle.stat();
    if (!file.isFile() || file.size === 0) {
      return '';
    }

    const length = Math.min(file.size, MAX_SESSION_READ_BYTES);
    const offset = file.size - length;
    const buffer = Buffer.allocUnsafe(length);
    let totalBytesRead = 0;

    while (totalBytesRead < length) {
      const { bytesRead } = await handle.read(
        buffer,
        totalBytesRead,
        length - totalBytesRead,
        offset + totalBytesRead,
      );
      if (bytesRead === 0) {
        break;
      }
      totalBytesRead += bytesRead;
    }

    const text = buffer.toString('utf8', 0, totalBytesRead);

    if (offset === 0) {
      return text;
    }

    const precedingByte = Buffer.allocUnsafe(1);
    const { bytesRead: precedingBytesRead } = await handle.read(precedingByte, 0, 1, offset - 1);
    if (precedingBytesRead === 1 && precedingByte[0] === 0x0a) {
      return text;
    }

    const firstCompleteLine = text.indexOf('\n');
    return firstCompleteLine === -1 ? '' : text.slice(firstCompleteLine + 1);
  } catch {
    return '';
  } finally {
    await handle?.close().catch(() => {});
  }
};

module.exports = { readSessionFileTail };
