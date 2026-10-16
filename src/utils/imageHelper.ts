/**
 * Utility to compress images to reasonable base64 data URLs for LPJ documentation
 * Keeps file sizes lightweight (~40-90KB) for Firestore and localStorage persistence
 */

export const TUT_WURI_HANDAYANI_LOGO = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="%230284C7" stroke="%23F59E0B" stroke-width="4"/><circle cx="60" cy="60" r="48" fill="%23FFFFFF"/><polygon points="60,20 72,42 96,44 78,60 82,84 60,72 38,84 42,60 24,44 48,42" fill="%23F59E0B"/><polygon points="60,32 46,62 74,62" fill="%23FFFFFF"/><circle cx="60" cy="46" r="6" fill="%23F59E0B"/><path d="M 30,92 A 40,40 0 0,0 90,92" fill="none" stroke="%230284C7" stroke-width="6"/><text x="60" y="102" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="%230284C7" text-anchor="middle" letter-spacing="1">TUT WURI HANDAYANI</text></svg>`;

export async function compressImageFile(
  file: File,
  maxWidth = 1000,
  maxHeight = 1000,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(readerEvent.target?.result as string);
          return;
        }

        // Draw with white background for transparency safety
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = readerEvent.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
