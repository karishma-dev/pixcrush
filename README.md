# pixcrush

[![npm version](https://img.shields.io/npm/v/pixcrush)](https://www.npmjs.com/package/pixcrush)
[![npm downloads](https://img.shields.io/npm/dm/pixcrush)](https://www.npmjs.com/package/pixcrush)
[![license](https://img.shields.io/npm/l/pixcrush)](./LICENSE)
[![node](https://img.shields.io/node/v/pixcrush)](https://nodejs.org)

**pixcrush** is a CLI tool that automatically migrates React, Next.js, and Turborepo projects to optimized WebP images and rewrites source code references to match. It converts PNG and JPG images to optimized WebP, compresses them, and safely rewrites your source code references so nothing breaks.

## Why pixcrush?

Most real-world React and Next.js codebases have hundreds of PNG and JPG images sitting in `/public` or scattered across the repo. Converting them to modern formats is boring, risky, and time-consuming because you also have to update imports and `src` paths everywhere.

pixcrush automates this entire migration safely and repeatably.

## Quickstart

Run once with no install required:

```bash
npx pixcrush .
```

Or install globally for repeated use:

```bash
npm install -g pixcrush
pixcrush .
```

If you don't pass any flags, pixcrush will ask you two quick questions before running.

---

## Flags

| Flag                 | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `--dry-run`          | Preview what would change without writing any files  |
| `--delete-originals` | Delete original `.png`/`.jpg` files after conversion |
| `--quality <number>` | WebP compression quality, 1-100 (default: `80`)      |
| `--help`             | Show usage info                                      |
| `--version`          | Show version                                         |

```bash
# Preview what would happen with no files modified
pixcrush . --dry-run

# Convert images and remove the originals afterwards
pixcrush . --delete-originals

# Convert at a higher quality
pixcrush . --quality 90

# Non-interactive full run
pixcrush . --delete-originals --quality 85
```

---

## Features

- **Safe AST rewrites** - Uses Babel to update imports and JSX src attributes to .webp without reformatting your files.
- **Smart compression** - Skips conversion if the resulting WebP would be larger than the original.
- **Next.js and Turborepo support** - Resolves deeply nested `apps/web/public/` paths so absolute image links like `src="/images/hero.png"` are matched correctly.
- **Orphan detection** - Reports any image that is never referenced in your source code.
- **Garbage collection** - With `--delete-originals`, also removes unused orphaned images automatically.
- **SEO safe** - Ignores framework metadata assets like `favicon*.png`, `apple-icon*.png`, `opengraph-image*.png`, and PWA manifest icons so critical metadata images are never touched.

---

## How It Works

1. **Scan** - Discovers all `.png`/`.jpg` and `.js`/`.ts`/`.jsx`/`.tsx` files using `fast-glob`.
2. **Analyze** - Parses your source code with Babel AST to identify which images are actually used.
3. **Convert** - Compresses used images to WebP using `sharp` (in-memory, only writes if smaller).
4. **Rewrite** - Updates import paths and `src` attributes in your source code.
5. **Report** - Prints a summary of images converted, space saved, files updated, and any warnings.

---

## Limitations

- Dynamic image paths like `` `images/${name}.png` `` are detected and warned about but not automatically rewritten.
- CSS files are not parsed. Only `.js`, `.ts`, `.jsx`, and `.tsx` are supported.

---

## Debugging

Run with `DEBUG_CRUSH=1` to see verbose path resolution output:

```bash
DEBUG_CRUSH=1 pixcrush .
```

---

## Author

Built by **Karishma Garg** — Frontend Engineer

- GitHub: [@karishma-dev](https://github.com/karishma-dev)
- Portfolio: [karishma.dev](https://karishma.dev)

---

## License

MIT. See [LICENSE](./LICENSE) for details.
