const OGG_CAPTURE = [0x4f, 0x67, 0x67, 0x53];
const OPUS_HEAD = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64];
const VORBIS_IDENTIFICATION = [0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73];
const GRANULE_UNKNOWN = 0xffffffffffffffffn;
const OPUS_SAMPLE_RATE = 48000;

function matchesAt(bytes, offset, sequence) {
  if (offset < 0 || offset + sequence.length > bytes.length) return false;
  return sequence.every((value, index) => bytes[offset + index] === value);
}

function findNextPage(bytes, from) {
  for (let offset = from; offset + OGG_CAPTURE.length <= bytes.length; offset += 1) {
    if (matchesAt(bytes, offset, OGG_CAPTURE)) return offset;
  }
  return -1;
}

function findSequence(bytes, from, to, sequence) {
  for (let offset = from; offset + sequence.length <= to; offset += 1) {
    if (matchesAt(bytes, offset, sequence)) return offset;
  }
  return -1;
}

export async function getOggAudioMetadata(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return null;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let codec = null;
  let codecSerial = null;
  let preSkip = 0;
  let sampleRate = 0;
  let lastGranule = null;
  let offset = 0;

  while (offset + 27 <= bytes.length) {
    if (!matchesAt(bytes, offset, OGG_CAPTURE)) {
      const nextPage = findNextPage(bytes, offset + 1);
      if (nextPage < 0) break;
      offset = nextPage;
      continue;
    }

    if (bytes[offset + 4] !== 0) break;
    const serial = view.getUint32(offset + 14, true);
    const segmentCount = bytes[offset + 26];
    const segmentTableStart = offset + 27;
    const bodyStart = segmentTableStart + segmentCount;
    if (bodyStart > bytes.length) break;

    let bodyLength = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      bodyLength += bytes[segmentTableStart + index];
    }
    const bodyEnd = bodyStart + bodyLength;
    if (bodyEnd > bytes.length) break;

    if (codec === null) {
      const headOffset = findSequence(bytes, bodyStart, bodyEnd, OPUS_HEAD);
      if (headOffset >= 0 && headOffset + 12 <= bodyEnd) {
        codec = 'opus';
        codecSerial = serial;
        preSkip = bytes[headOffset + 10] | (bytes[headOffset + 11] << 8);
      } else {
        const vorbisOffset = findSequence(
          bytes,
          bodyStart,
          bodyEnd,
          VORBIS_IDENTIFICATION
        );
        if (vorbisOffset >= 0 && vorbisOffset + 16 <= bodyEnd) {
          const parsedSampleRate = view.getUint32(vorbisOffset + 12, true);
          if (parsedSampleRate > 0) {
            codec = 'vorbis';
            codecSerial = serial;
            sampleRate = parsedSampleRate;
          }
        }
      }
    }

    if (codecSerial === serial) {
      const granule = view.getBigUint64(offset + 6, true);
      if (granule !== GRANULE_UNKNOWN) lastGranule = granule;
    }

    offset = bodyEnd;
  }

  if (codecSerial === null || lastGranule === null) return null;
  const decodedSamples = Number(
    codec === 'opus' ? lastGranule - BigInt(preSkip) : lastGranule
  );
  if (!Number.isFinite(decodedSamples) || decodedSamples <= 0) return null;
  return {
    codec,
    duration: decodedSamples / (codec === 'opus' ? OPUS_SAMPLE_RATE : sampleRate)
  };
}

export async function getOggOpusDuration(blob) {
  const metadata = await getOggAudioMetadata(blob);
  return metadata?.codec === 'opus' ? metadata.duration : null;
}
