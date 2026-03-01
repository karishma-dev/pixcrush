import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import fs from 'fs/promises';
import path from 'path';
import type { CodeUpdateResult, ConversionResult } from '../types.ts';

const traverse = typeof _traverse === 'function' ? _traverse : (_traverse as any).default;
const generate = typeof _generate === 'function' ? _generate : (_generate as any).default;

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
        let source = pathNode.node.value;
        if (typeof source !== 'string') return;

        // Save the raw original in case there was a query param we need to preserve visually
        const fullOriginalSource = source;
        source = source.split('?')[0];

        if (source.match(/\.(png|jpe?g)$/i)) {
          let matchedOriginalPath: string | undefined;

          if (source.startsWith('/')) {
            const cleanSource = source.replace(/^\//, '');
            for (const [origPath] of conversionMap.entries()) {
              if (
                origPath.endsWith(path.join('public', cleanSource)) ||
                origPath.endsWith(cleanSource)
              ) {
                matchedOriginalPath = origPath;
                break;
              }
            }
          } else {
            const relativePath = path.normalize(path.resolve(path.dirname(file), source));
            if (conversionMap.has(relativePath)) {
              matchedOriginalPath = relativePath;
            } else {
              const cleanSource = source.replace(/^@\/?|^~/, '');
              for (const [origPath] of conversionMap.entries()) {
                if (origPath.endsWith(cleanSource)) {
                  matchedOriginalPath = origPath;
                  break;
                }
              }
            }
          }

          if (matchedOriginalPath) {
            // Reapply query param if it existed on the match (e.g. img.png?url -> img.webp?url)
            const queryParam = fullOriginalSource.includes('?')
              ? '?' + fullOriginalSource.split('?')[1]
              : '';
            const newSource = source.replace(/\.(png|jpe?g)$/i, '.webp') + queryParam;

            pathNode.node.value = newSource;
            if (pathNode.node.extra) {
              pathNode.node.extra.rawValue = newSource;
              const originalQuote = (pathNode.node.extra as any).raw?.[0] || '"';
              (pathNode.node.extra as any).raw = `${originalQuote}${newSource}${originalQuote}`;
            }
            isModified = true;
          }
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
