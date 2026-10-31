function fourCc(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

export async function getWavDuration(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return null;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (
    bytes.length < 12 ||
    !['RIFF', 'RF64'].includes(fourCc(bytes, 0)) ||
    fourCc(bytes, 8) !== 'WAVE'
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  let rf64DataBytes = null;

  while (offset + 8 <= bytes.length) {
    const chunkId = fourCc(bytes, offset);
    const declaredSize = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    let chunkSize = declaredSize;

    if (chunkId === 'ds64' && declaredSize >= 28 && payloadOffset + 28 <= bytes.length) {
      const size = view.getBigUint64(payloadOffset + 8, true);
      if (size <= BigInt(Number.MAX_SAFE_INTEGER)) {
        rf64DataBytes = Number(size);
      }
    }

    if (chunkId === 'fmt ' && chunkSize >= 16 && payloadOffset + 16 <= bytes.length) {
      byteRate = view.getUint32(payloadOffset + 8, true);
    } else if (chunkId === 'data') {
      if (chunkSize === 0xffffffff) {
        if (rf64DataBytes === null) return null;
        chunkSize = rf64DataBytes;
      }
      if (!Number.isSafeInteger(chunkSize) || payloadOffset + chunkSize > bytes.length) {
        return null;
      }
      dataBytes += chunkSize;
      if (!Number.isSafeInteger(dataBytes)) return null;
    }

    if (declaredSize === 0xffffffff && chunkId !== 'data') return null;
    const nextOffset = payloadOffset + chunkSize + (chunkSize & 1);
    if (!Number.isSafeInteger(nextOffset) || nextOffset > bytes.length) return null;
    offset = nextOffset;
  }

  if (byteRate <= 0 || dataBytes <= 0) return null;
  const duration = dataBytes / byteRate;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}
