const ADTS_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000,
  22050, 16000, 12000, 11025, 8000, 7350
];

function skipLeadingId3Tags(bytes) {
  let offset = 0;
  while (
    offset + 10 <= bytes.length &&
    bytes[offset] === 0x49 &&
    bytes[offset + 1] === 0x44 &&
    bytes[offset + 2] === 0x33
  ) {
    const sizeBytes = bytes.subarray(offset + 6, offset + 10);
    if (sizeBytes.some(value => (value & 0x80) !== 0)) break;
    const tagSize =
      (sizeBytes[0] << 21) |
      (sizeBytes[1] << 14) |
      (sizeBytes[2] << 7) |
      sizeBytes[3];
    const footerSize = (bytes[offset + 5] & 0x10) !== 0 ? 10 : 0;
    const nextOffset = offset + 10 + tagSize + footerSize;
    if (nextOffset > bytes.length) return bytes.length;
    offset = nextOffset;
  }
  return offset;
}

function isAdtsHeader(bytes, offset) {
  return bytes[offset] === 0xff && (bytes[offset + 1] & 0xf6) === 0xf0;
}

export async function getAdtsAacDuration(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return null;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let offset = skipLeadingId3Tags(bytes);
  let duration = 0;
  let frameCount = 0;

  while (offset + 7 <= bytes.length) {
    if (!isAdtsHeader(bytes, offset)) {
      offset += 1;
      continue;
    }

    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x0f;
    const sampleRate = ADTS_SAMPLE_RATES[sampleRateIndex];
    const headerLength = (bytes[offset + 1] & 0x01) !== 0 ? 7 : 9;
    if (!sampleRate || offset + headerLength > bytes.length) {
      offset += 1;
      continue;
    }

    const frameLength =
      ((bytes[offset + 3] & 0x03) << 11) |
      (bytes[offset + 4] << 3) |
      ((bytes[offset + 5] & 0xe0) >> 5);
    if (frameLength < headerLength || offset + frameLength > bytes.length) {
      offset += 1;
      continue;
    }

    const rawDataBlocks = (bytes[offset + 6] & 0x03) + 1;
    duration += (1024 * rawDataBlocks) / sampleRate;
    frameCount += 1;
    offset += frameLength;
  }

  return frameCount > 0 && Number.isFinite(duration) && duration > 0
    ? duration
    : null;
}
