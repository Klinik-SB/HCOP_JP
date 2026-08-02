import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const outputDirectory = mkdtempSync(join(tmpdir(), 'hcop-clinical-tests-'));
const suites = [
  'src/app/core/clinical/clinical-treatment-projection.tests.ts',
  'src/app/core/clinical/clinical-print-projection.tests.ts',
  'src/app/core/patients/patient-workspace.normalization.tests.ts'
];

try {
  for (const [index, entryPoint] of suites.entries()) {
    const outputFile = join(outputDirectory, `clinical-suite-${index}.cjs`);
    await build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      outfile: outputFile,
      logLevel: 'warning'
    });
    const result = spawnSync(process.execPath, [outputFile], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
