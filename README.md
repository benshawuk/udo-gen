# udo-gen

Schema-first code generator for Laravel + React. One **Unified Data Object** (UDO) file
defines a resource's facts (fields, validation, relationships, UI hints), and the
generator emits all the artifacts that would otherwise be hand-maintained across
~13 files: Model (with abstract base), Migration, FormRequest, API Resource, Controller
(with abstract base), Factory, route entries, TypeScript module, FE validation rules,
and a React scaffold shell.

## Status

**Pre-alpha.** Design locked; scaffolding underway. See `docs/SPEC.md` (TBD) for the
locked v1 design.

## Mental model

- **Facts** live in `udo/{Resource}.udo.json` (JSONC).
- **Code** lives in PHP/TS. The UDO never tries to express logic.
- **Generated/** files are regenerated on every run.
- **Extension files** (`Product.php`, `ProductController.php`, React scaffolds) are
  scaffolded once and never overwritten — they're yours forever.

## Install (during development)

```bash
git clone <this-repo> ~/Documents/Coding/js/udo-gen
cd ~/Documents/Coding/js/udo-gen
pnpm install

# Symlink into a host Laravel project:
cd /path/to/laravel-project
pnpm link ~/Documents/Coding/js/udo-gen
```

## Usage (current — pre-alpha)

```bash
udo validate ./udo/VerificationCode.udo.json
udo gen-preview ./udo/VerificationCode.udo.json
```

Generation of real files is not yet wired. The current commands prove the parse + validate
+ template path end-to-end.

## Repo layout

```
src/         TypeScript source for the CLI and generator
schema/      JSON Schema for the UDO format (udo-v1.schema.json)
templates/   Built-in Eta templates (one per artifact)
examples/    Worked example UDOs against the schema
bin/         Shell entry point (`udo` -> dist/cli.js)
tests/       Vitest suite
```
