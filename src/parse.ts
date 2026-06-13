import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJsonc, printParseErrorCode, type ParseError } from 'jsonc-parser';
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { UdoDocument } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, '..', 'schema', 'udo-v1.schema.json');
const PUDO_EVAL_PATH = resolve(here, '..', 'php', 'eval-pudo.php');

export interface ParseSuccess {
  ok: true;
  filePath: string;
  document: UdoDocument;
}

export interface ParseFailure {
  ok: false;
  filePath: string;
  stage: 'read' | 'jsonc' | 'php' | 'schema';
  errors: string[];
}

export type ParseResult = ParseSuccess | ParseFailure;

let cachedValidator: ReturnType<typeof buildValidator> | null = null;

function buildValidator() {
  const schemaJson = readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(schemaJson);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile<UdoDocument>(schema);
}

function getValidator() {
  if (!cachedValidator) cachedValidator = buildValidator();
  return cachedValidator;
}

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath || '(root)';
  const extra =
    err.keyword === 'additionalProperties' && err.params && 'additionalProperty' in err.params
      ? ` (unknown property: '${err.params.additionalProperty}')`
      : '';
  return `${path}: ${err.message}${extra}`;
}

function formatJsoncError(err: ParseError, source: string): string {
  const lineCol = lineColumnAt(source, err.offset);
  return `line ${lineCol.line}, col ${lineCol.column}: ${printParseErrorCode(err.error)}`;
}

function lineColumnAt(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

/**
 * Parses a master file in either format: .udo.json (JSONC) or .pudo.php
 * (a PHP class extending Pudo\Resource). Both validate against the same
 * v1 schema and yield the same document, so generators never know the
 * difference.
 */
export function parseUdoFile(filePath: string): ParseResult {
  if (filePath.endsWith('.php')) {
    return parsePudoFile(filePath);
  }
  return parseJsoncUdoFile(filePath);
}

function parsePudoFile(filePath: string): ParseResult {
  const absolute = resolve(filePath);

  const result = spawnSync('php', [PUDO_EVAL_PATH, absolute], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    const isMissingPhp = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      ok: false,
      filePath: absolute,
      stage: 'php',
      errors: [
        isMissingPhp
          ? `'php' binary not found on PATH. PUDO files (.pudo.php) need a PHP 8.1+ CLI to evaluate.`
          : result.error.message,
      ],
    };
  }

  if (result.status !== 0) {
    const lines = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      ok: false,
      filePath: absolute,
      stage: 'php',
      errors: lines.length > 0 ? lines : [`php exited with code ${result.status}`],
    };
  }

  let document: unknown;
  try {
    document = JSON.parse(result.stdout);
  } catch {
    return {
      ok: false,
      filePath: absolute,
      stage: 'php',
      errors: ['PUDO evaluator did not produce valid JSON.', result.stdout.slice(0, 500)],
    };
  }

  return validateDocument(absolute, document);
}

function parseJsoncUdoFile(filePath: string): ParseResult {
  const absolute = resolve(filePath);

  let source: string;
  try {
    source = readFileSync(absolute, 'utf8');
  } catch (e) {
    return {
      ok: false,
      filePath: absolute,
      stage: 'read',
      errors: [(e as Error).message],
    };
  }

  const errors: ParseError[] = [];
  const document = parseJsonc(source, errors, { allowTrailingComma: true });

  if (errors.length > 0) {
    return {
      ok: false,
      filePath: absolute,
      stage: 'jsonc',
      errors: errors.map((e) => formatJsoncError(e, source)),
    };
  }

  return validateDocument(absolute, document);
}

function validateDocument(absolute: string, document: unknown): ParseResult {
  const validate = getValidator();
  if (!validate(document)) {
    return {
      ok: false,
      filePath: absolute,
      stage: 'schema',
      errors: (validate.errors ?? []).map(formatAjvError),
    };
  }

  return {
    ok: true,
    filePath: absolute,
    document: document as UdoDocument,
  };
}
