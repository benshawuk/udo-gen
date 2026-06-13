# udo-gen - TODO

Master task list. Near-term goal: open-source the repo on GitHub.

## Open-source / publish

- [ ] Make the GitHub repo (`benshawuk/udo-gen`) public.
- [x] Rewrite the README: short UDO concept + one fully annotated example that
      exercises all syntax and lists every generator ("adapter").
- [x] Add a `LICENSE` file (MIT).
- [x] Add `license`, `repository`, `author`, `homepage`, `bugs`, and `keywords`
      fields to `package.json`.
- [ ] Confirm publish contents: add a `files` allowlist (or `.npmignore`) so only
      `dist/`, `schema/`, `templates/`, `bin/`, `README`, `LICENSE` ship.
- [ ] Add CI (GitHub Actions): install, `pnpm build`, `pnpm test` on push/PR.
- [ ] Add `CONTRIBUTING.md` (optional, nice for OSS).

## Platform adapters (keep the UDO as the master resource)

- [ ] Formalize the adapter interface so a target stack is a registered, pluggable
      set of `render*(doc)` modules + templates rather than hard-wired imports in
      `src/generate/index.ts`.
- [x] Add a `--target` (or config) selector so `udo gen` can emit for a chosen
      stack instead of always Laravel + React. Done for the frontend:
      `udo gen <path> --target react|autoform` (default `react`). The `autoform`
      target emits `{feature}/validation/generated.ts` (regen) +
      `autoform-config.ts` (scaffold-once) instead of the ResourcePage scaffold;
      see `src/generate/autoform.ts`.
- [ ] Prove agnosticism with a second adapter set (e.g. Django/DRF backend or a
      Vue/Svelte frontend) against the unchanged schema. (`autoform` is the first
      proof on the frontend side.)
- [ ] Document "writing your own adapter" once the interface is stable.

## Generator / CLI

- [ ] `udo gen` real-file generation is wired in `src/generate/index.ts`; the
      README quick-start still describes `gen-preview` as the proven path - verify
      `gen` end-to-end against a real Laravel project and update docs.
- [ ] Write the locked v1 design doc referenced by the README (`docs/SPEC.md`).
- [ ] Field rename support in `udo migrate` (currently drop+add; flagged for
      manual data migration).
- [ ] `morphTo` example in the README is mildly contrived - revisit once a real
      polymorphic resource exists in the examples.

## Docs / examples

- [ ] Add a third worked example to `examples/` matching the README tour resource
      (Article), or trim the README example to reference `examples/Product`.
- [ ] Generate an API reference for the UDO types from `src/types.ts`.

## Housekeeping

- [x] `.DS_Store` - confirmed none tracked and pattern is git-ignored.
- [x] `package.json` scripts - confirmed no duplicate keys.
