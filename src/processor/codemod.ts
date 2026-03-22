import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import fs from 'fs/promises';
import path from 'path';
import { CodeUpdateResult, ConversionResult } from '../types.js';

const traverse = typeof _traverse === 'function' ? _traverse : (_traverse as any).default;
const generate = typeof _generate === 'function' ? _generate : (_generate as any).default;
const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;

function findMatchedOriginalPath(
  source: string,
  file: string,
  conversionMap: Map<string, string>,
): string | undefined {
  if (source.startsWith('/')) {
    const cleanSource = source.replace(/^\//, '');
    for (const [origPath] of conversionMap.entries()) {
      if (origPath.endsWith(path.join('public', cleanSource)) || origPath.endsWith(cleanSource)) {
        return origPath;
      }
    }
    return undefined;
  }

  const relativePath = path.normalize(path.resolve(path.dirname(file), source));
  if (conversionMap.has(relativePath)) {
    return relativePath;
  }

  const cleanSource = source.replace(/^@\/?|^~/, '');
  for (const [origPath] of conversionMap.entries()) {
    if (origPath.endsWith(cleanSource)) {
      return origPath;
    }
  }

  return undefined;
}

function getUpdatedImageSource(
  fullOriginalSource: string,
  file: string,
  conversionMap: Map<string, string>,
): string | undefined {
  const sourceWithoutQuery = fullOriginalSource.split('?')[0];
  if (!IMAGE_EXT_RE.test(sourceWithoutQuery)) return undefined;

  const matchedOriginalPath = findMatchedOriginalPath(sourceWithoutQuery, file, conversionMap);
  if (!matchedOriginalPath) return undefined;

  const queryParam = fullOriginalSource.includes('?')
    ? '?' + fullOriginalSource.split('?')[1]
    : '';
  return sourceWithoutQuery.replace(IMAGE_EXT_RE, '.webp') + queryParam;
}

function rewriteHtmlImageReferences(
  code: string,
  file: string,
  conversionMap: Map<string, string>,
): { code: string; isModified: boolean } {
  let isModified = false;
  let updatedCode = code;

  // Handle srcset-like attributes where each segment can carry a density descriptor.
  updatedCode = updatedCode.replace(
    /\b(srcset|data-srcset)\s*=\s*(["'])(.*?)\2/gi,
    (full, attrName, quote, rawValue) => {
      const segments = rawValue.split(',');
      const rewrittenSegments = segments.map((segment: string) => {
        const trimmed = segment.trim();
        if (!trimmed) return segment;

        const leading = segment.match(/^\s*/)?.[0] ?? '';
        const trailing = segment.match(/\s*$/)?.[0] ?? '';
        const [urlToken, ...rest] = trimmed.split(/\s+/);

        const updatedSource = getUpdatedImageSource(urlToken, file, conversionMap);
        if (!updatedSource) return segment;

        isModified = true;
        const descriptor = rest.length ? ` ${rest.join(' ')}` : '';
        return `${leading}${updatedSource}${descriptor}${trailing}`;
      });

      return `${attrName}=${quote}${rewrittenSegments.join(',')}${quote}`;
    },
  );

  // Handle plain URL-bearing attributes that can reference images in HTML.
  updatedCode = updatedCode.replace(
    /\b(src|href|poster|content|data-src)\s*=\s*(["'])(.*?)\2/gi,
    (full, attrName, quote, rawValue) => {
      const updatedSource = getUpdatedImageSource(rawValue, file, conversionMap);
      if (!updatedSource) return full;

      isModified = true;
      return `${attrName}=${quote}${updatedSource}${quote}`;
    },
  );

  return { code: updatedCode, isModified };
}

export async function updateCodeReferences(
  codeFiles: string[],
  conversions: ConversionResult[],
  targetDir: string,
  dryRun: boolean,
): Promise<CodeUpdateResult> {
  let updatedFilesCount = 0;
  const parseFailureFiles: string[] = [];

  const conversionMap = new Map<string, string>();
  for (const c of conversions) {
    if (!c.skipped && c.newPath) {
      conversionMap.set(path.normalize(c.originalPath), path.normalize(c.newPath));
    }
  }

  if (conversionMap.size === 0) {
    return { updatedFilesCount: 0, parseFailureFiles };
  }

  for (const file of codeFiles) {
    const code = await fs.readFile(file, 'utf8');
    const fileExt = path.extname(file).toLowerCase();

    if (fileExt === '.html' || fileExt === '.htm') {
      const rewritten = rewriteHtmlImageReferences(code, file, conversionMap);
      if (rewritten.isModified) {
        updatedFilesCount++;
        if (!dryRun) {
          await fs.writeFile(file, rewritten.code);
        }
      }
      continue;
    }

    let ast;
    try {
      ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });
    } catch (e) {
      parseFailureFiles.push(path.relative(targetDir, file));
      continue;
    }

    let isModified = false;

    traverse(ast, {
      StringLiteral(pathNode: any) {
        const source = pathNode.node.value;
        if (typeof source !== 'string') return;

        // Save the raw original in case there was a query param we need to preserve visually
        const fullOriginalSource = source;

        const newSource = getUpdatedImageSource(fullOriginalSource, file, conversionMap);
        if (newSource) {
          pathNode.node.value = newSource;
          if (pathNode.node.extra) {
            pathNode.node.extra.rawValue = newSource;
            const originalQuote = (pathNode.node.extra as any).raw?.[0] || '"';
            (pathNode.node.extra as any).raw = `${originalQuote}${newSource}${originalQuote}`;
          }
          isModified = true;
        }
      },
    });

    if (isModified) {
      updatedFilesCount++;
      if (!dryRun) {
        const output = generate(
          ast,
          {
            retainLines: true,
          },
          code,
        );

        await fs.writeFile(file, output.code);
      }
    }
  }

  return { updatedFilesCount, parseFailureFiles };
}
