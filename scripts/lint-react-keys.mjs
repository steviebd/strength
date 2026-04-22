import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const ROOT_DIR = process.cwd();
const TARGET_DIR = path.join(ROOT_DIR, 'apps', 'expo');
const TARGET_EXTENSIONS = new Set(['.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.expo', 'dist', 'build']);

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (TARGET_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function getLineAndColumn(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function formatLocation(filePath, sourceFile, node) {
  const { line, column } = getLineAndColumn(sourceFile, node);
  return `${path.relative(ROOT_DIR, filePath)}:${line}:${column}`;
}

function unwrapExpression(expression) {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function templateHasStaticText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.length > 0;
  }

  if (!ts.isTemplateExpression(node)) {
    return false;
  }

  if (node.head.text.length > 0) {
    return true;
  }

  return node.templateSpans.some((span) => span.literal.text.length > 0);
}

function isSimpleRiskyExpression(expression) {
  const current = unwrapExpression(expression);

  if (
    ts.isIdentifier(current) ||
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current) ||
    ts.isNumericLiteral(current) ||
    ts.isStringLiteral(current)
  ) {
    return true;
  }

  if (ts.isNoSubstitutionTemplateLiteral(current) || ts.isTemplateExpression(current)) {
    return !templateHasStaticText(current);
  }

  return false;
}

function getJsxAttributeName(node) {
  return ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
}

function getArrowReturnedExpression(node) {
  if (ts.isArrowFunction(node)) {
    if (ts.isBlock(node.body)) {
      const returnStatement = node.body.statements.find(ts.isReturnStatement);
      return returnStatement?.expression ?? null;
    }

    return node.body;
  }

  return null;
}

function collectIssuesForFile(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const issues = [];

  function report(node, message) {
    issues.push(`${formatLocation(filePath, sourceFile, node)} ${message}`);
  }

  function inspectKeyAttribute(node) {
    if (!node.initializer) {
      report(node, 'JSX key must use a scoped template, not an empty key attribute.');
      return;
    }

    if (ts.isStringLiteral(node.initializer)) {
      report(node, 'JSX key must be scoped. Use a template like `section:${id}` instead of a raw literal.');
      return;
    }

    if (!ts.isJsxExpression(node.initializer) || !node.initializer.expression) {
      return;
    }

    if (isSimpleRiskyExpression(node.initializer.expression)) {
      report(
        node,
        'JSX key must be scoped. Avoid raw identifiers, member access, or unscoped template expressions.',
      );
    }
  }

  function inspectKeyExtractorAttribute(node) {
    if (!node.initializer || !ts.isJsxExpression(node.initializer) || !node.initializer.expression) {
      return;
    }

    const returnedExpression = getArrowReturnedExpression(unwrapExpression(node.initializer.expression));
    if (!returnedExpression) {
      return;
    }

    if (isSimpleRiskyExpression(returnedExpression)) {
      report(
        node,
        'keyExtractor must return a scoped key. Use a namespaced template such as `library:${item.id}`.',
      );
    }
  }

  function visit(node) {
    if (ts.isJsxAttribute(node)) {
      const name = getJsxAttributeName(node);

      if (name === 'key') {
        inspectKeyAttribute(node);
      }

      if (name === 'keyExtractor') {
        inspectKeyExtractorAttribute(node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return issues;
}

const files = await collectFiles(TARGET_DIR);
const issues = [];

for (const filePath of files) {
  const sourceText = await readFile(filePath, 'utf8');
  issues.push(...collectIssuesForFile(filePath, sourceText));
}

if (issues.length > 0) {
  console.error('React key lint failed:\n');
  for (const issue of issues) {
    console.error(issue);
  }
  process.exit(1);
}

console.log(`React key lint passed for ${files.length} files.`);
