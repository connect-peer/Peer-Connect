# Contributing changes

Peer Connect uses automatic semantic versioning through Conventional Commits.
Push changes to `main` using one of these commit message types:

- `fix: ...` for a bug fix (patch release, for example 1.0.0 → 1.0.1)
- `feat: ...` for a new feature (minor release, for example 1.0.0 → 1.1.0)
- `feat!: ...` or a `BREAKING CHANGE:` footer for an incompatible change (major release, for example 1.0.0 → 2.0.0)
- `docs: ...`, `chore: ...`, and `style: ...` for changes that do not need a release

After a release-worthy change reaches `main`, GitHub Actions opens or updates a
release pull request. Review and merge that PR. It updates `version.json`,
records the changes in the release notes, creates a `vX.Y.Z` Git tag, and
publishes a GitHub Release. The displayed site version reads from `version.json`.

If the workflow does not run, check the repository's **Settings → Actions →
General → Workflow permissions** and allow the workflow to write repository
contents and pull requests.
