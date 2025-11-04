import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Writable } from 'node:stream';
import pino from 'pino';

class RotatingFileStream extends Writable {
  #filePath;
  #maxSize;
  #maxFiles;
  #currentSize = 0;
  #stream;

  constructor(filePath, { maxSize = 5 * 1024 * 1024, maxFiles = 3 } = {}) {
    super();
    this.#filePath = resolve(filePath);
    this.#maxSize = maxSize;
    this.#maxFiles = Math.max(1, maxFiles);
    this.#initializeStream();
  }

  #initializeStream() {
    const directory = dirname(this.#filePath);
    mkdirSync(directory, { recursive: true });

    if (existsSync(this.#filePath)) {
      try {
        this.#currentSize = statSync(this.#filePath).size;
      } catch (error) {
        this.emit('error', error);
        this.#currentSize = 0;
      }
    }

    this.#stream = createWriteStream(this.#filePath, { flags: 'a' });
    this.#stream.on('error', (error) => this.emit('error', error));
  }

  #rotate() {
    if (this.#stream) {
      this.#stream.end();
    }

    // Shift existing rotated files
    for (let index = this.#maxFiles - 1; index >= 1; index -= 1) {
      const source = `${this.#filePath}.${index}`;
      const destination = `${this.#filePath}.${index + 1}`;
      if (existsSync(source)) {
        if (index + 1 > this.#maxFiles) {
          rmSync(source, { force: true });
        } else {
          if (existsSync(destination)) {
            rmSync(destination, { force: true });
          }
          renameSync(source, destination);
        }
      }
    }

    if (existsSync(this.#filePath)) {
      const firstRotation = `${this.#filePath}.1`;
      if (existsSync(firstRotation)) {
        rmSync(firstRotation, { force: true });
      }
      renameSync(this.#filePath, firstRotation);
    }

    this.#currentSize = 0;
    this.#initializeStream();
  }

  _write(chunk, encoding, callback) {
    if (!this.#stream) {
      this.#initializeStream();
    }

    const byteLength = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);

    if (this.#currentSize + byteLength > this.#maxSize) {
      try {
        this.#rotate();
      } catch (error) {
        callback(error);
        return;
      }
    }

    this.#currentSize += byteLength;

    if (!this.#stream.write(chunk, encoding)) {
      this.#stream.once('drain', callback);
    } else {
      callback();
    }
  }
}

const LOG_DIRECTORY = process.env.WEB_SEARCH_LOG_DIR ?? resolve(process.cwd(), 'logs');
const LOG_FILE = resolve(LOG_DIRECTORY, 'web-search.log');

const rotatingStream = new RotatingFileStream(LOG_FILE, {
  maxSize: Number.parseInt(process.env.WEB_SEARCH_LOG_MAX_SIZE ?? '', 10) || 5 * 1024 * 1024,
  maxFiles: Number.parseInt(process.env.WEB_SEARCH_LOG_MAX_FILES ?? '', 10) || 5,
});

rotatingStream.on('error', (error) => {
  const fallbackMessage = JSON.stringify({
    level: 'error',
    msg: 'Failed to write to rotating log stream',
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
  });
  process.stderr.write(`${fallbackMessage}\n`);
});

const logger = pino(
  {
    level: process.env.WEB_SEARCH_LOG_LEVEL ?? 'debug',
  },
  pino.multistream([
    { stream: rotatingStream },
    { level: 'error', stream: process.stderr },
  ]),
);

export default logger;
export { LOG_FILE };
