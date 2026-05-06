import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units.shift() ?? 'KB';
  while (value >= 1024 && units.length > 0) {
    value /= 1024;
    unit = units.shift() ?? unit;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function listFiles(dir: string, extensions?: string[]) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => !extensions || extensions.some((extension) => file.endsWith(extension)))
    .map((file) => {
      const path = join(dir, file);
      return { file, path, size: statSync(path).size };
    })
    .sort((a, b) => b.size - a.size);
}

function printSection(title: string, rows: Array<{ file: string; size: number }>) {
  console.log(`\n${title}`);
  if (rows.length === 0) {
    console.log('  No files found.');
    return;
  }
  for (const row of rows) {
    console.log(`  ${row.file.padEnd(32)} ${formatBytes(row.size)}`);
  }
  const total = rows.reduce((sum, row) => sum + row.size, 0);
  console.log(`  ${'Total'.padEnd(32)} ${formatBytes(total)}`);
}

printSection('Expo assets', listFiles(join(ROOT, 'assets')));
printSection('Android build artifacts', listFiles(join(ROOT, 'builds'), ['.apk', '.aab']));
printSection('Web static assets', listFiles(join(ROOT, 'dist', '_expo', 'static', 'js'), ['.js']));
