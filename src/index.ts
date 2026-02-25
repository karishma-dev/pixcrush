import { CrushOptions } from './config.js';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { scanDirectory } from './scanner/index.js';
import { trackAndReconcileImages } from './processor/tracker.js';
import { convertImagesToWebp } from './processor/image.js';
import { updateCodeReferences } from './processor/codemod.js';
import fs from 'fs/promises';
import path from 'path';

export async function runCrush(targetDir: string, options: CrushOptions) {
  const s = p.spinner();

  // Phase 1: Scan
  s.start('Scanning codebase for images and source files...');
  const { imageFiles, codeFiles } = await scanDirectory(targetDir);
  s.stop(`Found ${imageFiles.length} images and ${codeFiles.length} source files.`);

  if (imageFiles.length === 0) {
    p.note('No images found to process.', 'info');
    return;
  }

  // Phase 2: Analyze
  s.start('Analyzing code to find used images...');
  const {
    usedImages,
    unusedImages,
    warnings: trackWarnings,
  } = await trackAndReconcileImages(codeFiles, imageFiles, targetDir);
  s.stop(`Identified ${usedImages.length} used images and ${unusedImages.length} unused images.`);

  if (usedImages.length === 0) {
    p.note('No used images found in your code. Skipping conversion.', 'info');
    if (unusedImages.length > 0) {
      if (options.deleteOriginals && !options.dryRun) {
        s.start(`Deleting ${unusedImages.length} unused image files...`);
        let deletedCount = 0;
        for (const img of unusedImages) {
          try {
            await fs.unlink(img);
            deletedCount++;
          } catch (e: any) {
            p.log.warn(`Failed to delete unused image ${img}: ${e.message}`);
          }
        }
        s.stop(`Deleted ${deletedCount} unused images.`);
      } else {
        p.log.warn(`You have ${unusedImages.length} unused image files taking up space!`);
      }
    }
    return;
  }

  // Phase 3: Convert Image
  s.start(`Converting ${usedImages.length} used images to WebP...`);
  const conversions = await convertImagesToWebp(
    usedImages,
    options.quality,
    options.dryRun,
    options.deleteOriginals,
  );

  const successfulConversions = conversions.filter((c) => !c.skipped);
  const totalOriginalSize = successfulConversions.reduce((acc, c) => acc + c.originalSize, 0);
  const totalNewSize = successfulConversions.reduce((acc, c) => acc + c.newSize, 0);
  const savedBytes = totalOriginalSize - totalNewSize;
  const savedMb = (savedBytes / 1024 / 1024).toFixed(2);

  s.stop(`Converted ${successfulConversions.length} images (saved ${savedMb} MB).`);

  // Phase 4: AST Codemod
  let updatedFilesCount = 0;
  if (successfulConversions.length > 0) {
    s.start('Updating React code references...');
    updatedFilesCount = await updateCodeReferences(
      codeFiles,
      successfulConversions,
      targetDir,
      options.dryRun,
    );
    s.stop(`Updated ${updatedFilesCount} source files.`);
  }

  // Phase 5: Cleanup unused images
  let deletedUnusedCount = 0;
  if (options.deleteOriginals && unusedImages.length > 0 && !options.dryRun) {
    s.start(`Deleting ${unusedImages.length} unused image files...`);
    for (const img of unusedImages) {
      try {
        await fs.unlink(img);
        deletedUnusedCount++;
      } catch (e: any) {
        p.log.warn(`Failed to delete unused image ${img}: ${e.message}`);
      }
    }
    s.stop(`Deleted ${deletedUnusedCount} unused images.`);
  }
  p.log.message('\n' + pc.bgGreen(pc.black(' SUMMARY ')));
  p.log.step(`Images Converted: ${successfulConversions.length} / ${usedImages.length}`);
  p.log.step(`Space Saved: ${savedMb} MB`);
  p.log.step(`Code Files Updated: ${updatedFilesCount}`);

  if (trackWarnings.length > 0) {
    p.log.warn(`Warnings (${trackWarnings.length}):`);
    trackWarnings.slice(0, 5).forEach((w) => p.log.message(pc.yellow(`  - ${w}`)));
    if (trackWarnings.length > 5)
      p.log.message(pc.yellow(`  ...and ${trackWarnings.length - 5} more`));
  }

  if (unusedImages.length > 0) {
    if (options.deleteOriginals && !options.dryRun) {
      p.note(
        `Successfully deleted ${deletedUnusedCount} unused images.`,
        'Unused Images Cleaned Up',
      );
    } else {
      p.note(
        unusedImages
          .slice(0, 5)
          .map((u) => `- ${path.relative(targetDir, u)}`)
          .join('\n') + (unusedImages.length > 5 ? `\n...and ${unusedImages.length - 5} more` : ''),
        `Unused Images Detected & Skipped (${unusedImages.length})`,
      );
    }
  }
}
