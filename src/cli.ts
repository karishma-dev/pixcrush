import { cac } from 'cac';
import { runCrush } from './index.js';
import { DEFAULT_OPTIONS } from './config.js';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'path';

const cli = cac('pixcrush');

cli
  .command('[dir]', 'Scan and convert images in directory (default: .)')
  .option('--dry-run', 'Run without writing any files')
  .option('--quality <number>', 'WebP compression quality (default: 80)')
  .option('--delete-originals', 'Delete original images after successful conversion')
  .action(async (dir, options) => {
    const targetDir = path.resolve(process.cwd(), dir || '.');

    console.log(pc.bold(pc.magenta('pix') + pc.cyan('crush')));
    console.log(pc.dim('WebP image migration for React & Next.js'));
    console.log(pc.dim('─────────────────────────────────────────'));

    p.intro(pc.bgMagenta(pc.white(' pixcrush ')) + '  WebP Image Migrator');

    let isDryRun = options.dryRun;
    if (isDryRun === undefined) {
      const dryRunPrompt = await p.confirm({
        message: 'Would you like to run in Dry Run mode first to preview changes?',
        initialValue: true,
      });
      if (p.isCancel(dryRunPrompt)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
      }
      isDryRun = dryRunPrompt;
    }

    if (isDryRun) {
      p.note('Running in DRY RUN mode. No files will be modified.', 'info');
    }

    let deleteOriginals = options.deleteOriginals;
    if (deleteOriginals === undefined) {
      const deletePrompt = await p.confirm({
        message: 'Should we automatically delete original PNG/JPG files after conversion?',
        initialValue: false,
      });
      if (p.isCancel(deletePrompt)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
      }
      deleteOriginals = deletePrompt;
    }

    try {
      await runCrush(targetDir, {
        dryRun: isDryRun,
        quality: options.quality ? parseInt(options.quality, 10) : DEFAULT_OPTIONS.quality,
        deleteOriginals: deleteOriginals,
      });
      p.outro(pc.green('Finished successfully!'));
    } catch (error) {
      p.cancel(pc.red('An error occurred during execution.'));
      console.error(error);
      process.exit(1);
    }
  });

cli.help();
cli.version('1.0.0');

try {
  cli.parse();
} catch (err: any) {
  process.exit(1);
}
