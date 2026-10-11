/**
 * Image Preparation and Normalization
 * 
 * - Decodes input image respecting orientation (EXIF)
 * - Constrains long edge to at most 1024 px
 * - Re-encodes on HTML Canvas as JPEG at quality 0.82 (strips EXIF & GPS)
 * - Enforces 1.5 MB maximum output payload constraint
 * - Computes SHA-256 digest of normalized output bytes via crypto.subtle
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PreparedImage {
  blob: Blob;
  dataUrl: string;
  hash: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Pure function: calculates target dimensions preserving aspect ratio with a max edge cap.
 * Separated for unit-testing in vitest.
 */
export function calculateTargetDimensions(
  width: number,
  height: number,
  maxEdge: number = 1024
): ImageDimensions {
  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions must be positive integers.');
  }

  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }

  if (width >= height) {
    const targetWidth = maxEdge;
    const targetHeight = Math.max(1, Math.round((height * maxEdge) / width));
    return { width: targetWidth, height: targetHeight };
  } else {
    const targetHeight = maxEdge;
    const targetWidth = Math.max(1, Math.round((width * maxEdge) / height));
    return { width: targetWidth, height: targetHeight };
  }
}

/**
 * Computes a SHA-256 hexadecimal hash string from an ArrayBuffer using crypto.subtle.
 */
export async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalizes an image file/blob captured from the camera or file input.
 */
export async function prepareImage(file: Blob | File): Promise<PreparedImage> {
  if (!file || file.size === 0) {
    throw new Error('No image file provided or file is empty.');
  }

  let bitmap: ImageBitmap;
  try {
    // Decode with orientation correction from EXIF tag
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    // Fallback if imageOrientation option is unsupported or decode fails
    try {
      bitmap = await createImageBitmap(file);
    } catch (innerErr) {
      throw new Error('Could not decode image format. Please capture a standard JPEG or PNG photo.');
    }
  }

  const { width: targetWidth, height: targetHeight } = calculateTargetDimensions(
    bitmap.width,
    bitmap.height,
    1024
  );

  // Render onto canvas: drops EXIF, GPS, and metadata
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    bitmap.close?.();
    throw new Error('Canvas 2D context unavailable.');
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close?.();

  // Re-encode as JPEG at quality 0.82
  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => {
        if (b) resolve(b);
        else reject(new Error('Failed to encode canvas to JPEG format.'));
      },
      'image/jpeg',
      0.82
    );
  });

  // Strict 1.5 MB payload limit (1,572,864 bytes)
  const maxSizeBytes = 1.5 * 1024 * 1024;
  if (jpegBlob.size > maxSizeBytes) {
    throw new Error(
      `Prepared image size (${(jpegBlob.size / 1024 / 1024).toFixed(2)} MB) exceeds 1.5 MB limit. Please retake the photo with simpler lighting or lower resolution.`
    );
  }

  const arrayBuffer = await jpegBlob.arrayBuffer();
  const hash = await computeSha256(arrayBuffer);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

  return {
    blob: jpegBlob,
    dataUrl,
    hash,
    width: targetWidth,
    height: targetHeight,
    sizeBytes: jpegBlob.size,
  };
}
