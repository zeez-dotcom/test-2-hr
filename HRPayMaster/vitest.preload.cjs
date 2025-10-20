const { TextDecoder: NodeTextDecoder } = require('util');
const { Buffer } = require('buffer');

const globalScope = globalThis;

class PolyfillTextEncoder {
  encode(input = '') {
    const buffer = Buffer.from(String(input), 'utf8');
    return Uint8Array.from(buffer);
  }
}

globalScope.TextEncoder = PolyfillTextEncoder;
globalScope.TextDecoder = NodeTextDecoder;

if (process.env.DEBUG_TEXT_ENCODER === '1') {
  console.error('[vitest.preload] TextEncoder polyfill active. cwd=', process.cwd());
}
