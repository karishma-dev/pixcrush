import fg from 'fast-glob';
import type { ScanResult } from '../types.js';

export async function scanDirectory(targetDir: string): Promise<ScanResult> {
  const imagePatterns = ['**/*.{png,jpg,jpeg,PNG,JPG,JPEG}'];
  const codePatterns = ['**/*.{js,jsx,ts,tsx}'];

  const ignore = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.git/**',
    // Framework Specific SEO / Static Metadata files that are never strictly "imported" in code
    '**/favicon*.{png,jpg,jpeg,ico}',
    '**/apple-icon*.{png,jpg,jpeg}',
    '**/apple-touch-icon*.{png,jpg,jpeg}',
    '**/icon*.{png,jpg,jpeg}',
    '**/opengraph-image*.{png,jpg,jpeg}',
    '**/twitter-image*.{png,jpg,jpeg}',

    // PWA & Manifest Icons (referenced in manifest.json/manifest.webmanifest, which our AST doesn't parse)
    '**/android-chrome-*.{png,jpg,jpeg}',
    '**/mstile-*.{png,jpg,jpeg}',
    '**/web-app-manifest-*.{png,jpg,jpeg}',
  ];

  const [imageFiles, codeFiles] = await Promise.all([
    fg(imagePatterns, { cwd: targetDir, ignore, absolute: true }),
    fg(codePatterns, { cwd: targetDir, ignore, absolute: true }),
  ]);

  return { imageFiles, codeFiles };
}
