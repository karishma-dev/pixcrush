import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import fs from 'fs/promises';
import path from 'path';
import { TrackerResult } from '../types.js';

const traverse = typeof _traverse === 'function' ? _traverse : (_traverse as any).default;
const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;

function extractImageSources(value: string): string[] {
  const sources: string[] = [];

  // Handles both plain src values (`/img/a.jpg`) and srcset values (`/img/a.jpg 1x, /img/b.jpg 2x`).
  for (const candidate of value.split(',')) {
    const segment = candidate.trim();
    if (!segment) continue;

    const [urlToken] = segment.split(/\s+/);
    if (!urlToken) continue;

    const source = urlToken.split('?')[0];
    if (IMAGE_EXT_RE.test(source)) {
      sources.push(source);
    }
  }

  return sources;
}

function registerUsedImageSource(
  source: string,
  file: string,
  targetDir: string,
  usedImagePaths: Set<string>,
  absolutePublicUsages: Set<string>,
) {
  if (source.startsWith('http') || source.startsWith('data:')) {
    return; // Ignore external/inline URLs
  }

  if (source.startsWith('/')) {
    // Absolute public mapping. Next.js maps these to a `public` folder usually.
    // Instead of guessing where the public folder is in a monorepo, we store the clean path.
    const cleanSource = source.replace(/^\//, '');
    absolutePublicUsages.add(cleanSource);

    // Still add the default root guesses just in case it's a standard repo
    const publicPath = path.join(targetDir, 'public', cleanSource);
    const rootPath = path.join(targetDir, cleanSource);
    const srcPublicPath = path.join(targetDir, 'src', 'public', cleanSource);

    usedImagePaths.add(publicPath);
    usedImagePaths.add(rootPath);
    usedImagePaths.add(srcPublicPath);
  } else {
    // Relative mapping
    const relativePath = path.resolve(path.dirname(file), source);
    const rootPath = path.resolve(targetDir, source.replace(/^@\/?|^~/, ''));
    const srcPath = path.resolve(targetDir, 'src', source.replace(/^@\/?|^~/, ''));

    usedImagePaths.add(relativePath);
    usedImagePaths.add(rootPath);
    usedImagePaths.add(srcPath);
  }
}

export async function trackAndReconcileImages(
  codeFiles: string[],
  imageFiles: string[],
  targetDir: string,
): Promise<TrackerResult> {
  const usedImagePaths = new Set<string>();
  const absolutePublicUsages = new Set<string>();
  const warnings: string[] = [];
  const parseFailureFiles: string[] = [];

  for (const file of codeFiles) {
    const code = await fs.readFile(file, 'utf8');

    let ast;
    try {
      ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });
    } catch (e: any) {
      parseFailureFiles.push(path.relative(targetDir, file));
      if (process.env.DEBUG_CRUSH) {
        console.warn(`[DEBUG] Failed to parse ${path.relative(targetDir, file)}: ${e.message}`);
      }
      continue;
    }

    traverse(ast, {
      StringLiteral(pathNode: any) {
        const rawValue = pathNode.node.value;
        if (typeof rawValue !== 'string') return;

        for (const source of extractImageSources(rawValue)) {
          registerUsedImageSource(source, file, targetDir, usedImagePaths, absolutePublicUsages);
        }
      },
      TemplateLiteral(pathNode: any) {
        // We still need to catch dynamic Next.js templates like `/url/${id}.png`
        for (const quasi of pathNode.node.quasis) {
          const val = quasi.value.raw;
          if (val.match(/\.(png|jpe?g)$/i)) {
            warnings.push(`Dynamic \`src\` found in ${path.relative(targetDir, file)}`);
          }
        }
      },
    });
  }

  const usedImages: string[] = [];
  const unusedImages: string[] = [];

  const normalizedImageFiles = new Set(imageFiles.map((p) => path.normalize(p)));
  const normalizedUsedPaths = new Set(Array.from(usedImagePaths).map((p) => path.normalize(p)));

  if (process.env.DEBUG_CRUSH) {
    console.log('--- CRUSH DEBUG ---');
    console.log('targetDir:', targetDir);
    console.log('Normalized Glob Images:', Array.from(normalizedImageFiles));
    console.log('Normalized AST Used Paths:', Array.from(normalizedUsedPaths));
    console.log('------------------');
  }

  for (const img of normalizedImageFiles) {
    let isUsed = normalizedUsedPaths.has(img);

    // Check if this image satisfies any of the absolute public usages (e.g. Next.js <Image src="/images/logo.png" />)
    // In a monorepo, `img` might be `/Users/xyz/repo/apps/web/public/images/logo.png`
    if (!isUsed) {
      for (const publicUsage of absolutePublicUsages) {
        // Does the actual file on disk end with public/images/logo.png or images/logo.png?
        if (img.endsWith(path.join('public', publicUsage)) || img.endsWith(publicUsage)) {
          isUsed = true;
          break;
        }
      }
    }

    if (isUsed) {
      usedImages.push(img);
    } else {
      unusedImages.push(img);
    }
  }

  return { usedImages, unusedImages, warnings, parseFailureFiles };
}
