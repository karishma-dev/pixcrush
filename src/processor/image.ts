import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export interface ConversionResult {
  originalPath: string;
  newPath: string;
  originalSize: number;
  newSize: number;
  skipped: boolean; // True if WebP was larger or equal
  error?: string;
}

export async function convertImagesToWebp(
  images: string[],
  quality: number,
  dryRun: boolean,
  deleteOriginals: boolean,
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];

  for (const imgPath of images) {
    try {
      const stat = await fs.stat(imgPath);
      const originalSize = stat.size;

      // Do Sharp processing in-memory to check size before writing
      const webpBuffer = await sharp(imgPath).webp({ quality }).toBuffer();
      const newSize = webpBuffer.length;

      const parsed = path.parse(imgPath);
      const newPath = path.join(parsed.dir, `${parsed.name}.webp`);

      if (newSize >= originalSize) {
        results.push({
          originalPath: imgPath,
          newPath,
          originalSize,
          newSize,
          skipped: true,
        });
        continue;
      }

      if (!dryRun) {
        await fs.writeFile(newPath, webpBuffer);

        if (deleteOriginals) {
          await fs.unlink(imgPath);
        }
      }

      results.push({
        originalPath: imgPath,
        newPath,
        originalSize,
        newSize,
        skipped: false,
      });
    } catch (e: any) {
      results.push({
        originalPath: imgPath,
        newPath: '',
        originalSize: 0,
        newSize: 0,
        skipped: true,
        error: e.message,
      });
    }
  }

  return results;
}
