'use strict';

const zlib = require('zlib');
const QRCode = require('./lib/QRCode');
const QRErrorCorrectLevel = require('./lib/QRCode/QRErrorCorrectLevel');

const DEFAULT_SCALE = 8;
const DEFAULT_MARGIN = 4;
const DEFAULT_LEVEL = 'M';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseOptions(opts) {
  const options = opts && typeof opts === 'object' ? { ...opts } : {};
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? Math.floor(options.scale) : DEFAULT_SCALE;
  const margin = Number.isFinite(options.margin) && options.margin >= 0 ? Math.floor(options.margin) : DEFAULT_MARGIN;
  const errorCorrectionLevel = typeof options.errorCorrectionLevel === 'string'
    ? options.errorCorrectionLevel.toUpperCase()
    : DEFAULT_LEVEL;
  const ecc = QRErrorCorrectLevel[errorCorrectionLevel] || QRErrorCorrectLevel[DEFAULT_LEVEL];
  return { scale, margin, ecc };
}

function createModules(text, opts) {
  const qr = new QRCode(-1, opts.ecc);
  qr.addData(text);
  qr.make();
  return qr.modules;
}

function renderPng(modules, opts) {
  const size = modules.length;
  const scale = opts.scale;
  const margin = opts.margin;
  const totalSize = (size + margin * 2) * scale;

  const rowSize = totalSize + 1; // +1 for filter byte per row
  const raw = Buffer.alloc(rowSize * totalSize);
  let offset = 0;

  for (let y = 0; y < totalSize; y += 1) {
    raw[offset] = 0; // filter type 0
    offset += 1;
    const moduleY = Math.floor(y / scale) - margin;
    for (let x = 0; x < totalSize; x += 1) {
      const moduleX = Math.floor(x / scale) - margin;
      let isDark = false;
      if (
        moduleX >= 0 && moduleX < size &&
        moduleY >= 0 && moduleY < size &&
        modules[moduleY][moduleX]
      ) {
        isDark = true;
      }
      raw[offset] = isDark ? 0 : 255;
      offset += 1;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(totalSize, 0); // width
  ihdr.writeUInt32BE(totalSize, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function normalizeInput(text) {
  return typeof text === 'string' ? text : String(text ?? '');
}

function generate(text, options) {
  const normalized = normalizeInput(text);
  const parsed = parseOptions(options);
  const modules = createModules(normalized, parsed);
  return { modules, options: parsed, text: normalized };
}

function renderFromMatrix(modules, options) {
  if (!Array.isArray(modules)) {
    throw new TypeError('modules must be an array');
  }
  const parsed = options && typeof options === 'object' && typeof options.ecc === 'number'
    ? options
    : parseOptions(options);
  return renderPng(modules, parsed);
}

function toDataURL(text, options, cb) {
  let callback = cb;
  let opts = options;
  if (typeof options === 'function') {
    callback = options;
    opts = undefined;
  }
  try {
    const { modules, options: parsed } = generate(text, opts);
    const dataUrl = renderPng(modules, parsed);
    if (callback) {
      callback(null, dataUrl);
      return Promise.resolve(dataUrl);
    }
    return Promise.resolve(dataUrl);
  } catch (error) {
    if (callback) {
      callback(error);
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
}

module.exports = {
  toDataURL,
  generate,
  renderFromMatrix
};
