export const MAX_AUDIO_SEEK_BYTES = 32 * 1024 * 1024;

function createSizeLimitError() {
  const error = new Error('Audio file is too large to buffer for seeking.');
  error.code = 'AUDIO_SEEK_TOO_LARGE';
  return error;
}

export async function fetchAudioSeekBlob(
  url,
  { signal, maxBytes = MAX_AUDIO_SEEK_BYTES, mimeType = 'audio/mpeg' } = {}
) {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) {
    throw new Error(`Unable to load audio for seeking (${response.status}).`);
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // The size limit still applies if the response body cannot be cancelled.
    }
    throw createSizeLimitError();
  }

  const blob = await response.blob();
  if (blob.size > maxBytes) throw createSizeLimitError();
  if (blob.size === 0) throw new Error('The audio file is empty.');

  return blob.type ? blob : new Blob([blob], { type: mimeType });
}
