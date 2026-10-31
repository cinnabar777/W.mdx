export const MAX_M4A_SEEK_BYTES = 32 * 1024 * 1024;

function createSizeLimitError() {
  const error = new Error('M4A is too large to buffer for seeking.');
  error.code = 'M4A_SEEK_TOO_LARGE';
  return error;
}

export async function fetchM4aSeekBlob(
  url,
  { signal, maxBytes = MAX_M4A_SEEK_BYTES } = {}
) {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) {
    throw new Error(`Unable to load M4A for seeking (${response.status}).`);
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
  if (blob.size === 0) throw new Error('The M4A file is empty.');

  return blob.type ? blob : new Blob([blob], { type: 'audio/mp4' });
}
