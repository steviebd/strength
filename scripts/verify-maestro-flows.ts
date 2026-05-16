import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const flowsDir = join(repoRoot, 'apps/expo/.maestro');
const sourceDirs = [join(repoRoot, 'apps/expo/app'), join(repoRoot, 'apps/expo/components')];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listFiles(path, predicate));
    } else if (predicate(entry)) {
      files.push(path);
    }
  }

  return files;
}

function read(path: string) {
  return readFileSync(path, 'utf8');
}

if (!existsSync(flowsDir)) {
  fail(`Maestro flows directory not found: ${relative(repoRoot, flowsDir)}`);
}

const allFlowFiles = readdirSync(flowsDir)
  .filter((file) => /\.(ya?ml)$/i.test(file))
  .sort();
const runnableFlowFiles = allFlowFiles.filter((file) => !file.startsWith('_'));

if (runnableFlowFiles.length === 0) {
  fail(`No runnable Maestro flows found in ${relative(repoRoot, flowsDir)}`);
}

const flowContents = new Map(
  allFlowFiles.map((file) => [file, read(join(flowsDir, file))] as const),
);

for (const file of allFlowFiles) {
  const content = flowContents.get(file) ?? '';
  if (!content.startsWith('appId: ${MAESTRO_APP_ID}\n---\n')) {
    fail(`${file} must start with the shared appId header`);
  }
}

for (const [file, content] of flowContents) {
  const runFlowMatches = content.matchAll(/runFlow:\s*['"]?([^'"\n]+)['"]?/g);
  for (const match of runFlowMatches) {
    const target = match[1].trim();
    if (!existsSync(join(flowsDir, target))) {
      fail(`${file} references missing runFlow target: ${target}`);
    }
  }
}

const sourceText = sourceDirs
  .flatMap((dir) => listFiles(dir, (name) => /\.(tsx?|jsx?)$/i.test(name)))
  .map(read)
  .join('\n');

const referencedIds = new Set<string>();
for (const content of flowContents.values()) {
  for (const match of content.matchAll(/id:\s*['"]([^'"]+)['"]/g)) {
    const id = match[1];
    if (!id.includes('${')) {
      referencedIds.add(id);
    }
  }
}

const dynamicIdPrefixes = [
  'custom-program-exercise-',
  'custom-program-start-',
  'custom-program-workout-',
  'custom-program-workout-name-',
  'program-custom-1rm-',
  'program-option-',
  'program-1rm-',
  'workout-exercise-create-muscle-',
  'workout-action-',
  'workout-set-',
] as const;

function idLooksCoveredByDynamicSource(id: string) {
  const prefix = dynamicIdPrefixes.find((candidate) => id.startsWith(candidate));
  if (!prefix) return false;
  return sourceText.includes(prefix);
}

const missingIds = [...referencedIds].filter(
  (id) => !sourceText.includes(id) && !idLooksCoveredByDynamicSource(id),
);
if (missingIds.length > 0) {
  fail(
    `Maestro references missing source testID/accessibilityLabel values: ${missingIds.join(', ')}`,
  );
}

const allRunnableFlowText = runnableFlowFiles
  .map((file) => flowContents.get(file) ?? '')
  .join('\n');
const requiredCoverage = [
  ['shared login helper', 'runFlow: _shared-login.yml'],
  ['custom template', 'template-save'],
  ['custom exercise creation', 'workout-exercise-create-submit'],
  ['AMRAP', 'AMRAP'],
  ['custom program creation', 'program-create-custom'],
  ['custom program 1RM prompt', 'program-custom-1rm-1'],
  ['program 1RM setup', 'program-1rm-squat'],
  ['schedule review', 'program-continue-to-review'],
  ['schedule inspection', 'View Schedule'],
] as const;

const missingCoverage = requiredCoverage.filter(
  ([, needle]) => !allRunnableFlowText.includes(needle),
);
if (missingCoverage.length > 0) {
  fail(`Maestro flow coverage is missing: ${missingCoverage.map(([label]) => label).join(', ')}`);
}

console.log(`Verified ${runnableFlowFiles.length} Maestro flows.`);
console.log(`Runnable flows: ${runnableFlowFiles.join(', ')}`);
