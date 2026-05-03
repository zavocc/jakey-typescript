/**
 * Determines media type from a URL using an HTTP HEAD request (no download).
 * Falls back to URL extension parsing if HEAD fails.
 */
export async function getMediaType(url: string): Promise<'image' | 'audio' | 'video' | 'document'> {
  // Try HEAD request first to get Content-Type without downloading
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const contentType = res.headers.get('content-type') ?? '';

    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('application/pdf')) return 'document';
  } catch {
    // HEAD request failed, fall through to extension-based detection
  }

  // Fallback: guess from URL file extension
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif', 'svg'].includes(ext ?? '')) return 'image';
    if (['mp4', 'webm', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gpp'].includes(ext ?? '')) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'aiff', 'm4a', 'opus'].includes(ext ?? '')) return 'audio';
    if (['pdf'].includes(ext ?? '')) return 'document';
  } catch {
    // URL parsing failed
  }

  // Default to image if we can't determine the type
  return 'image';
}
