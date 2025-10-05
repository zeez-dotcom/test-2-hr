import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

const globalScope = globalThis as typeof globalThis & {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};

const isEncoderMissing = typeof globalScope.TextEncoder === 'undefined';
const isEncoderInvalid = (() => {
  if (isEncoderMissing) {
    return false;
  }

  try {
    return !(new globalScope.TextEncoder().encode('') instanceof Uint8Array);
  } catch {
    return true;
  }
})();

if (isEncoderMissing || isEncoderInvalid) {
  const nodeEncoder = NodeTextEncoder;
  if (new nodeEncoder().encode('') instanceof Uint8Array) {
    globalScope.TextEncoder = nodeEncoder;
  }
}

if (typeof globalScope.TextDecoder === 'undefined') {
  globalScope.TextDecoder = NodeTextDecoder;
}
