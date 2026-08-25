# Changesets

This folder holds [changesets](https://github.com/changesets/changesets) — one file per
user-visible change, describing what changed and how it affects the version.

Add one with `pnpm changeset` as part of the PR that makes the change. Releasing later turns
every accumulated changeset into version bumps and CHANGELOG entries in a single command.

All six published packages are in a `fixed` group: they always release together on one shared
version, because `create-prompton` pins the others at `^<its own version>` when it generates the
scaffold template. `@prompton-dev/starter` is ignored — it is the dogfood site, not a package.

See the Releasing section in the root `CLAUDE.md` for the full flow.
