import * as p from '@clack/prompts';
import pc from 'picocolors';
import { scanDirectory } from './scanner/index.ts';
import { trackAndReconcileImages } from './processor/tracker.ts';
import { convertImagesToWebp } from './processor/image.ts';
import { updateCodeReferences } from './processor/codemod.ts';
import fs from 'fs/promises';
import path from 'path';
import type { CrushOptions } from './types.ts';

async function deleteFiles(filePaths: string[]) {
  let deletedCount = 0;
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
      deletedCount++;
    } catch (e: any) {
      p.log.warn(`Failed to delete file ${filePath}: ${e.message}`);
    }
  }
  return deletedCount;
}

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
    parseFailureFiles: trackerParseFailureFiles,
  } = await trackAndReconcileImages(codeFiles, imageFiles, targetDir);
  s.stop(`Identified ${usedImages.length} used images and ${unusedImages.length} unused images.`);

  if (usedImages.length === 0) {
    p.note('No used images found in your code. Skipping conversion.', 'info');
    if (unusedImages.length > 0) {
      if (options.deleteOriginals && !options.dryRun && trackerParseFailureFiles.length === 0) {
        s.start(`Deleting ${unusedImages.length} unused image files...`);
        const deletedCount = await deleteFiles(unusedImages);
        s.stop(`Deleted ${deletedCount} unused images.`);
      } else if (
        options.deleteOriginals &&
        !options.dryRun &&
        trackerParseFailureFiles.length > 0
      ) {
        p.log.warn(
          `Skipped deleting unused images because ${trackerParseFailureFiles.length} source files could not be parsed during analysis.`,
        );
      } else {
        p.log.warn(`You have ${unusedImages.length} unused image files taking up space!`);
      }
    }
    return;
  }

  // Phase 3: Convert Image
  s.start(`Converting ${usedImages.length} used images to WebP...`);
  const conversions = await convertImagesToWebp(usedImages, options.quality, options.dryRun);

  const successfulConversions = conversions.filter((c) => !c.skipped);
  const totalOriginalSize = successfulConversions.reduce((acc, c) => acc + c.originalSize, 0);
  const totalNewSize = successfulConversions.reduce((acc, c) => acc + c.newSize, 0);
  const savedBytes = totalOriginalSize - totalNewSize;
  const savedMb = (savedBytes / 1024 / 1024).toFixed(2);

  s.stop(`Converted ${successfulConversions.length} images (saved ${savedMb} MB).`);

  // Phase 4: AST Codemod
  let updatedFilesCount = 0;
  let codemodParseFailureFiles: string[] = [];
  if (successfulConversions.length > 0) {
    s.start('Updating React code references...');
    const codeUpdateResult = await updateCodeReferences(
      codeFiles,
      successfulConversions,
      targetDir,
      options.dryRun,
    );
    updatedFilesCount = codeUpdateResult.updatedFilesCount;
    codemodParseFailureFiles = codeUpdateResult.parseFailureFiles;
    s.stop(`Updated ${updatedFilesCount} source files.`);
  }

  // Phase 5: Cleanup originals and unused images
  const canDeleteSafely =
    trackerParseFailureFiles.length === 0 && codemodParseFailureFiles.length === 0;
  let deletedConvertedCount = 0;
  let deletedUnusedCount = 0;

  if (options.deleteOriginals && !options.dryRun) {
    if (!canDeleteSafely) {
      p.log.warn(
        `Skipped deleting originals/unused images because ${trackerParseFailureFiles.length + codemodParseFailureFiles.length} source files could not be parsed.`,
      );
    } else {
      if (successfulConversions.length > 0) {
        s.start(`Deleting ${successfulConversions.length} converted original image files...`);
        deletedConvertedCount = await deleteFiles(successfulConversions.map((c) => c.originalPath));
        s.stop(`Deleted ${deletedConvertedCount} converted originals.`);
      }

      if (unusedImages.length > 0) {
        s.start(`Deleting ${unusedImages.length} unused image files...`);
        deletedUnusedCount = await deleteFiles(unusedImages);
        s.stop(`Deleted ${deletedUnusedCount} unused images.`);
      }
    }
  }
  p.log.message('\n' + pc.bgGreen(pc.black(' SUMMARY ')));
  p.log.step(`Images Converted: ${successfulConversions.length} / ${usedImages.length}`);
  p.log.step(`Space Saved: ${savedMb} MB`);
  p.log.step(`Code Files Updated: ${updatedFilesCount}`);
  if (options.deleteOriginals && !options.dryRun) {
    p.log.step(`Converted Originals Deleted: ${deletedConvertedCount}`);
  }

  if (trackWarnings.length > 0) {
    p.log.warn(`Warnings (${trackWarnings.length}):`);
    trackWarnings.slice(0, 5).forEach((w) => p.log.message(pc.yellow(`  - ${w}`)));
    if (trackWarnings.length > 5)
      p.log.message(pc.yellow(`  ...and ${trackWarnings.length - 5} more`));
  }

  if (unusedImages.length > 0) {
    if (options.deleteOriginals && !options.dryRun && canDeleteSafely) {
      p.note(
        `Successfully deleted ${deletedUnusedCount} unused images.`,
        'Unused Images Cleaned Up',
      );
    } else if (options.deleteOriginals && !options.dryRun && !canDeleteSafely) {
      p.note(
        'Unused images were not deleted because some source files failed to parse. Run in dry-run mode and inspect warnings before deleting.',
        'Unused Images Not Deleted',
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

  if (trackerParseFailureFiles.length > 0 || codemodParseFailureFiles.length > 0) {
    const parseFailureCount = trackerParseFailureFiles.length + codemodParseFailureFiles.length;
    if (options.deleteOriginals && !options.dryRun) {
      p.log.warn(
        `Parser skipped ${parseFailureCount} source files. Deletion was safety-gated for this run.`,
      );
    } else {
      p.log.warn(
        `Parser skipped ${parseFailureCount} source files. Review warnings before running with --delete-originals.`,
      );
    }
  }
}
