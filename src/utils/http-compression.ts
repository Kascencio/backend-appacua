import { constants, brotliCompress, gzip } from 'node:zlib';
import { promisify } from 'node:util';

type SupportedEncoding = 'br' | 'gzip';

type CompressionResult = {
  encoding: SupportedEncoding;
  payload: Buffer;
};

const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);

const COMPRESSIBLE_CONTENT_TYPES = [
  'application/json',
  'application/xml',
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
];

function parseAcceptedEncodings(headerValue: string | undefined): SupportedEncoding[] {
  if (!headerValue) return [];

  const entries = headerValue
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((entry) => {
      const [namePart, ...params] = entry.split(';').map((v) => v.trim());
      const name = namePart.toLowerCase();
      if (name !== 'br' && name !== 'gzip') return null;

      let q = 1;
      for (const param of params) {
        const [k, v] = param.split('=').map((token) => token.trim().toLowerCase());
        if (k === 'q' && v) {
          const parsed = Number(v);
          if (Number.isFinite(parsed)) q = parsed;
        }
      }

      return { name: name as SupportedEncoding, q };
    })
    .filter((item): item is { name: SupportedEncoding; q: number } => item !== null && item.q > 0)
    .sort((a, b) => b.q - a.q);

  return entries.map((item) => item.name);
}

function isCompressibleContentType(contentType: string): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return COMPRESSIBLE_CONTENT_TYPES.some((supported) => normalized.includes(supported));
}

export type CompressionConfig = {
  minBytes: number;
  brotliQuality: number;
  gzipLevel: number;
};

export async function compressPayloadIfBeneficial(
  rawPayload: Buffer,
  acceptEncodingHeader: string | undefined,
  contentType: string,
  config: CompressionConfig
): Promise<CompressionResult | null> {
  if (rawPayload.length < config.minBytes) return null;
  if (!isCompressibleContentType(contentType)) return null;

  const acceptedEncodings = parseAcceptedEncodings(acceptEncodingHeader);
  if (acceptedEncodings.length === 0) return null;

  for (const encoding of acceptedEncodings) {
    if (encoding === 'br') {
      const compressed = await brotliCompressAsync(rawPayload, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: config.brotliQuality,
        },
      });

      if (compressed.length < rawPayload.length) {
        return { encoding, payload: compressed };
      }
      continue;
    }

    const compressed = await gzipAsync(rawPayload, {
      level: config.gzipLevel,
    });

    if (compressed.length < rawPayload.length) {
      return { encoding, payload: compressed };
    }
  }

  return null;
}
