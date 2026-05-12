# Release process

Step-by-step for cutting a release. Aimed at the maintainer with
push rights; not user-facing. Versioning rules: [`SEMVER.md`](../SEMVER.md).

## 0. When to release

Cut a release when **either** of these holds:

- A meaningful set of features or fixes has landed on `main` and
  the `[Unreleased]` section of `CHANGELOG.md` is non-trivial.
- A security fix needs to ship.

Don't release on a cadence; release when there's something to
release.

## 1. Pre-flight on `main`

Make sure the tip of `main` is green:

```bash
git fetch origin
git checkout origin/main

# Full Rust suite — desktop crate excluded locally because Tauri
# wants Linux GUI deps; CI has them.
cargo test --workspace --exclude emu8086-desktop
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check

# Web side.
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r build
pnpm -r test
```

Open the GitHub Actions tab; confirm the latest `CI` run on `main`
is **success** across all three OS runners. If any are red, fix
first.

## 2. Decide the version

Read the `[Unreleased]` section of [`CHANGELOG.md`](../CHANGELOG.md):

- Any breaking change per [`SEMVER.md`](../SEMVER.md)? → **MAJOR** bump.
- Otherwise, any new feature visible to users? → **MINOR** bump.
- Otherwise, only bug fixes / docs / internal? → **PATCH** bump.

In this doc, `vX.Y.Z` is the chosen string.

## 3. Bump version strings

Every workspace package that ships to users:

```bash
# Rust crates — set the workspace package version once; member
# crates inherit via `version.workspace = true`.
sed -i 's/^version = ".*"  *# workspace$/version = "X.Y.Z"  # workspace/' \
  Cargo.toml

# pnpm packages — only those that actually publish or that consumers
# read a version from. Most are private; bumping them is for the
# CHANGELOG, not for npm.
for p in packages/web packages/cli-npm packages/plugin-sdk packages/desktop \
         packages/classroom-protocol packages/classroom-server \
         packages/devices/ts; do
  jq --arg v "X.Y.Z" '.version = $v' "$p/package.json" > "$p/package.json.tmp"
  mv "$p/package.json.tmp" "$p/package.json"
done
```

Re-run the pre-flight tests after the bump.

## 4. Move `[Unreleased]` → `[X.Y.Z]`

In `CHANGELOG.md`, rename the `## [Unreleased]` heading to `## [X.Y.Z] — YYYY-MM-DD` and add a fresh empty `## [Unreleased]` block above it. Update the link refs at the bottom of the file.

Optionally collate the per-PR `.changeset/*.md` fragments into the release entry via:

```bash
./tools/collate-changeset.sh > /tmp/release-notes-X.Y.Z.md
# Edit, then paste into CHANGELOG under the new heading. Clear the
# .changeset/ directory.
```

## 5. Commit, push, PR, merge

```bash
git checkout -b release/X.Y.Z
git add Cargo.toml packages/*/package.json packages/*/*/package.json CHANGELOG.md
git commit -m "release: X.Y.Z"
git push -u origin release/X.Y.Z
gh pr create --title "Release X.Y.Z" --body "$(cat /tmp/release-notes-X.Y.Z.md)"
gh pr merge --squash --delete-branch
```

CI runs again on the PR; merge once green.

## 6. Tag and GitHub Release

```bash
git fetch origin
git checkout origin/main
git tag -a vX.Y.Z -m "release X.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "X.Y.Z" --notes-file /tmp/release-notes-X.Y.Z.md
```

## 7. Build + attach artifacts

These run automatically on tag push (see `.github/workflows/release.yml`):

- `modern8086-cli` binary for `linux-x64`, `darwin-x64`, `darwin-arm64`, `windows-x64`.
- Tauri desktop bundles: `.deb`, `.AppImage`, `.dmg`, `.app.tar.gz`, `.msi`, `.exe` setup.
- The web bundle as a single tarball, for self-hosters.
- SHA-256 checksums file.

Confirm the workflow ran successfully and all artifacts are
attached to the release. Re-run failed matrix legs from the
Actions UI if necessary.

## 8. npm publish (CLI wrapper)

If the CLI version changed:

```bash
cd packages/cli-npm
npm publish --access public
```

The `cli-npm` package's `postinstall` script fetches the right
binary from the GitHub Release we just published, so the npm
package only ships JavaScript glue + checksums.

## 9. Docker images

Built on tag push by `.github/workflows/release.yml` and pushed to
`ghcr.io/abuXsarkar/modern8086:X.Y.Z` and `:latest`. Same for
the classroom-server image at
`ghcr.io/abuXsarkar/modern8086-classroom:X.Y.Z`.

Confirm the tags are visible at
[`https://github.com/abuXsarkar?tab=packages`](https://github.com/abuXsarkar?tab=packages).

## 10. Announce

Post the release in:

- The repo's GitHub Discussions (Announcements).
- Any mailing list / Discord / forum we've stood up.
- Update the hosted IDE's tagline (`packages/web/src/i18n/en.ts` → bump the lead text if release-worthy).

## Signing (post-1.0)

Code-signing keys and entitlement profiles are tracked in the
release-keys vault outside the repo. The release workflow expects
the following secrets when the corresponding artifacts are signed:

- `APPLE_DEVELOPER_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_CERTIFICATE_P12`, `APPLE_CERTIFICATE_PASSWORD` —
  Developer-ID signing + notarization for macOS DMG / .app.
- `WINDOWS_SIGN_CERT_P12`, `WINDOWS_SIGN_CERT_PASSWORD` —
  Authenticode signing for MSI / NSIS.
- `NPM_TOKEN` — `npm publish` automation for the CLI wrapper.

Without the secrets, the workflow still produces unsigned bundles
that install but trip the OS's untrusted-developer gate. v1.0 may
ship unsigned and document the workaround; v1.1+ should be signed.
