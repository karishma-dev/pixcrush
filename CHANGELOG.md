# Changelog

All notable changes to pixcrush will be documented here.

---

## [1.0.1] - 2026-02-26

### Changed

- Removed "Future Plans" section from README
- Minor README cleanup

---

## [1.0.0] - 2026-02-26

### Added

- Initial release
- Scan PNG/JPG images in React, Next.js, and Turborepo projects
- Convert used images to WebP using `sharp` (skips conversion if WebP is larger)
- Automatically rewrite import paths and JSX `src` attributes via Babel AST
- Interactive prompts for dry-run and delete-originals options when no flags are passed
- `--dry-run` flag to preview changes without writing files
- `--delete-originals` flag to remove original images after conversion
- `--quality` flag to control WebP compression quality (default: 80)
- Orphan detection — reports images that are not referenced in any source file
- Garbage collection — deletes unused images when `--delete-originals` is set
- SEO safe — skips `favicon*.png`, `apple-icon*.png`, `opengraph-image*.png`, and PWA manifest icons
- Next.js and Turborepo path resolution for deeply nested `public/` directories
- `DEBUG_CRUSH=1` environment variable for verbose path resolution logging
