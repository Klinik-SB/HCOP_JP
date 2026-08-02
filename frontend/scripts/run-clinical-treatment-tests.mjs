import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const outputDirectory = mkdtempSync(join(tmpdir(), 'hcop-clinical-treatment-tests-'));
const outputFile = join(outputDirectory, 'clinical-treatment-projection.tests.cjs');

try {
  await build({
    entryPoints: ['src/app/core/clinical/clinical-treatment-projection.tests.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: outputFile,
    logLevel: 'warning'
  });
  const result = spawnSync(process.execPath, [outputFile], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
