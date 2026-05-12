# Distribution

Where `modern8086` and `m86` are published, what each channel costs,
and what the first-time setup looks like. The release pipeline
(`.github/workflows/release.yml`) drives the four free channels
automatically once the per-channel gate variables are flipped on.

## Channel summary

| Channel | What ships | Cost | Auto-publish on tag | Maintainer setup |
|---|---|---|---|---|
| GitHub Releases | All artifacts + checksums | $0 | Yes, always | None |
| npm `@modern8086/cli` | Node shim → native `m86` binary | $0 | When `vars.NPM_PUBLISH_ENABLED=true` | npm account + `NPM_TOKEN` |
| Homebrew tap | `m86` formula + `modern8086` cask (macOS DMG) | $0 | When `vars.HOMEBREW_TAP_ENABLED=true` | Tap repo + `TAP_DEPLOY_TOKEN` |
| Scoop bucket | `m86` Windows manifest | $0 | When `vars.SCOOP_BUCKET_ENABLED=true` | Bucket repo + `BUCKET_DEPLOY_TOKEN` |
| Chocolatey | `m86` Windows package | $0 | When `vars.CHOCO_PUBLISH_ENABLED=true` | Choco maintainer account + `CHOCO_API_KEY` |
| **Google Play Store** | **Signed Android AAB** | **$25** one-time (paid) | When `vars.ANDROID_BUILD_ENABLED=true` (build) + `vars.PLAY_STORE_UPLOAD_ENABLED=true` (upload) | Play Console account + keystore + service account JSON |
| Microsoft Store | MSIX of the Tauri desktop bundle | **$19** one-time | Manual (Partner Center upload) | Partner Center account |
| Mac App Store | MAS-sandboxed .app | **$99/yr** | Manual (App Store Connect upload) | Apple Developer Program |
| Snap (snapcraft.io) | strict-confinement snap of the desktop app | $0 | Manual until snapcraft.yaml lands | Snapcraft account |
| Flathub | flatpak of the desktop app | $0 | External (PR to flathub/flathub) | Flathub manifest review |

The first four (npm + Homebrew + Scoop + Chocolatey) cover roughly
every dev-savvy install path on macOS, Windows, and Linux at zero
cost, no annual fee, no app review. Recommended baseline. The store
channels (MS Store, Mac App Store) add discovery for non-dev users
but cost money and add review latency.

## 1. npm (`@modern8086/cli`)

The npm package is a tiny Node shim. On `npm install -g`, the
postinstall script downloads the right native binary for the
platform from the matching GitHub Release, verifies its SHA-256
against `checksums.txt`, and drops it next to the shim.

### One-time setup

1. Create an npm account (or use existing): https://www.npmjs.com/signup
2. Verify your email and enable 2FA (required for publishing scoped packages).
3. Reserve the `@modern8086` scope by publishing your first package
   to it — npm auto-creates the scope on first publish. Alternatively:
   `npm org create modern8086`.
4. Generate a granular access token at https://www.npmjs.com/settings/<you>/tokens:
   - Type: **Granular Access Token**.
   - Permissions: **Read and write** on `@modern8086/*` packages.
   - Expiration: 1 year (renew at each major version).
5. Add the token to the repo's secrets:
   `Settings → Secrets and variables → Actions → New repository secret`
   - Name: `NPM_TOKEN`
   - Value: the token from step 4.
6. Flip the publish gate:
   `Settings → Secrets and variables → Actions → Variables tab`
   - Add `NPM_PUBLISH_ENABLED` with value `true`.

### Per-release flow

Push a `v*.*.*` tag — the workflow:

1. Builds the four CLI binaries.
2. Bundles them into platform tarballs/zips.
3. Uploads them + `checksums.txt` to the GitHub Release.
4. Bumps `packages/cli-npm/package.json` to match the tag.
5. Runs `npm publish --access public --provenance` against
   `https://registry.npmjs.org` using `NPM_TOKEN`.

After publish:

```bash
npm install -g @modern8086/cli
m86 --help
```

## 2. Homebrew tap (`abuxsarkar/modern8086`)

Two artifacts: a **formula** for the CLI and a **cask** for the
desktop DMG. Both live in a separate "tap" repo that users opt into.

### One-time setup

1. Create a public repo on GitHub named exactly
   `abuXsarkar/homebrew-modern8086` (the `homebrew-` prefix is
   required — that's what `brew tap` expects).
   - Initialise it empty (no README, no LICENSE).
2. Generate a fine-grained PAT at
   https://github.com/settings/personal-access-tokens/new:
   - Repository access: only `abuXsarkar/homebrew-modern8086`.
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write**.
3. Add it to the main repo's secrets:
   - Name: `TAP_DEPLOY_TOKEN`
   - Value: the PAT.
4. Flip the gate:
   - Variable `HOMEBREW_TAP_ENABLED` = `true`.

### Per-release flow (manual, until the auto-publish job lands)

After a tag push has built artifacts:

```bash
./packaging/scripts/generate-distribution-manifests.sh 1.1.0
# → target/packaging/homebrew/Formula/m86.rb
# → target/packaging/homebrew/Casks/modern8086.rb
```

Copy those two files into the tap repo, commit, push. Then any
user can:

```bash
brew tap abuxsarkar/modern8086
brew install m86             # CLI
brew install --cask modern8086  # desktop app
```

### Why a tap instead of homebrew-core?

homebrew-core has strict notability and stability criteria (≥75
GitHub stars, no breaking changes for 30 days, etc.) plus a
multi-week review queue. A personal tap lets you publish day-one and
costs nothing in either money or review delay. We can graduate to
homebrew-core later if usage grows.

## 3. Scoop bucket (`abuxsarkar/scoop-modern8086`)

Windows CLI distribution. Single JSON manifest in a bucket repo.

### One-time setup

1. Create a public repo `abuXsarkar/scoop-modern8086` with the
   directory layout:

   ```text
   /
   └── bucket/
       └── m86.json
   ```

2. Generate a fine-grained PAT (same scopes as the Homebrew one but
   for this repo).
3. Add `BUCKET_DEPLOY_TOKEN` secret + `SCOOP_BUCKET_ENABLED=true`
   variable to the main repo.

### Per-release flow

```bash
./packaging/scripts/generate-distribution-manifests.sh 1.1.0
# → target/packaging/scoop/m86.json
```

Drop into the bucket repo, commit, push. Users:

```powershell
scoop bucket add modern8086 https://github.com/abuXsarkar/scoop-modern8086
scoop install m86
```

## 4. Chocolatey

Windows package manager with broader reach than Scoop (used by IT
shops + corporate machines). New maintainers go through moderation
on their first few packages.

### One-time setup

1. Sign up at https://community.chocolatey.org/.
2. Generate an API key at https://community.chocolatey.org/account.
3. Add `CHOCO_API_KEY` secret + `CHOCO_PUBLISH_ENABLED=true` variable.

### Per-release flow

```bash
./packaging/scripts/generate-distribution-manifests.sh 1.1.0
# → target/packaging/chocolatey/m86.nuspec + tools/

cd target/packaging/chocolatey
choco pack
choco push m86.1.1.0.nupkg \
  --source https://push.chocolatey.org/ \
  --api-key $CHOCO_API_KEY
```

First package goes through 1–3 days of moderation. Subsequent
updates are instant after you reach **Trusted** status (~5 published
packages without issues).

## 5. Google Play Store

The most reach of any single channel: the Android Play Store puts
modern8086 on millions of student devices that don't run a desktop
OS daily. Full step-by-step (keystore generation, secrets, listing
fields, service-account JSON for auto-publish) lives at
[`packaging/android/SETUP.md`](../packaging/android/SETUP.md) — this
section is the short version.

### Build pipeline

The release workflow's `android` job:

1. Installs JDK 17, Android SDK + NDK r26, Rust + Android targets.
2. Builds the wasm bundle and the web bundle.
3. Runs `cargo tauri android init --ci` to scaffold
   `packages/desktop/gen/android/` (gitignored).
4. Patches the generated `app/build.gradle.kts` for release signing
   via `packaging/android/gradle-signing-patch.sh`.
5. Writes `keystore.properties` from the `ANDROID_KEYSTORE_*`
   secrets.
6. Runs `cargo tauri android build --aab` to produce a signed AAB.
7. Attaches the AAB to the GitHub Release.
8. If `vars.PLAY_STORE_UPLOAD_ENABLED=true`, uploads to the
   Internal-test track (or `vars.PLAY_STORE_TRACK` if set) via
   `r0adkll/upload-google-play@v1`.

### Two gates

- `vars.ANDROID_BUILD_ENABLED=true` — enables the AAB build at all.
- `vars.PLAY_STORE_UPLOAD_ENABLED=true` — enables the auto-upload
  step on top. Useful to flip the build on without the upload first,
  test the AAB locally, then flip the upload on for the next tag.

### Tracks

The workflow defaults to the **Internal testing** track —
auto-promoting to Production on every tag is too risky. Promote
manually in Play Console after a sanity check. Override with
`vars.PLAY_STORE_TRACK = alpha | beta | internal | production` if you
want a different default.

### Why the $25 is worth it

Google Play has a one-time $25 developer-account fee (lifetime, no
renewals). For an educational tool targeting students, that's $25 vs
the de-facto unreachability of every student who can't install
sideloaded APKs (i.e. most). Compare with Apple's $99/yr — Play is
strictly cheaper and reaches more student-owned devices.

## 6. Microsoft Store

Worth a paragraph on tradeoffs. The Store ships an MSIX, which can
be produced two ways:

- **Submit the existing MSI**: Partner Center accepts Win32 (MSI/EXE)
  app submissions directly since 2023. The Store wraps it for
  delivery; no MSIX conversion needed on your side. Use this path.
- **Build an MSIX from scratch**: more control but requires an
  AppxManifest.xml, MakeAppx, and re-signing. Skip unless you need
  per-feature container isolation.

### One-time setup

1. Sign up at https://partner.microsoft.com/en-us/dashboard (one-time
   $19 individual / $99 company).
2. Verify identity (passport + selfie video) — 24–72 hr review.
3. Reserve the app name **modern8086** in Partner Center → Apps and
   games → Create new app.
4. Fill out: description (copy from `tauri.conf.json`'s
   `longDescription`), 4+ screenshots (1920×1080 PNG), age rating
   (use the IARC questionnaire — likely 3+), category (Developer
   tools), pricing (Free).

### Per-release flow

1. Push a tag, wait for the GitHub Release to populate.
2. Download `modern8086_<version>_x64_en-US.msi` from the release.
3. Partner Center → Submission → upload the MSI → submit for
   certification.
4. Certification takes 1–3 days. After acceptance the Store listing
   goes live within hours.

No code-signing certificate is required for Store submission — the
Store re-signs with its own cert. (For sideload distribution
outside the Store you still want Authenticode signing; see the
`SIGNING_ENABLED` toggle in `release.yml`.)

## 7. Mac App Store

Apple Developer Program ($99/yr) is the gate, and it's also what
unblocks notarized DMGs for outside-Store distribution. If you're
going to pay the $99 anyway for notarization, MAS is mostly extra
configuration, not extra money.

### One-time setup

1. Enrol at https://developer.apple.com/programs/.
2. Create an App ID matching the bundle identifier
   (`com.cyberdude.modern8086` from `tauri.conf.json`).
3. Generate two distribution certificates in
   https://developer.apple.com/account/resources/certificates:
   - **Mac App Distribution** (for MAS submissions).
   - **Developer ID Application** (for notarized DMGs outside the Store).
4. App Store Connect → New App → reserve name **modern8086**.

### MAS submission caveats

- The Tauri-built `.app` is *not* MAS-ready as-is. MAS requires:
  - The **App Sandbox** entitlement.
  - Hardened runtime + a few specific entitlements (file access,
    network client).
  - Signing with the **Mac App Distribution** certificate, not
    Developer ID.
- Tauri 2 supports MAS but it's an opt-in build path. Track
  https://github.com/tauri-apps/tauri/discussions/4316 for the
  current state of the upstream MAS recipe.

For now we ship the **notarized DMG** outside the Store (via Apple
Developer ID) and treat MAS as a follow-on. The notarized DMG is
~95% of the user value at 0% of the MAS configuration cost.

## 8. Snap, Flathub, AUR

Linux package channels that are nice-to-have but not on the critical
path. Each has its own packaging file format:

- **Snap (snapcraft.io)**: `snap/snapcraft.yaml`. Strict
  confinement; harder for an app that wants webkit + system fonts.
  Tauri's webkit base image is a reasonable starting point.
- **Flathub**: a `org.modern8086.App.yml` manifest committed to a
  fork of `flathub/flathub` then reviewed. Review can take 2–4
  weeks the first time.
- **AUR**: a `PKGBUILD` file in `aur.archlinux.org`. Trivial; ask a
  community contributor or maintain it yourself.

Recommended order: skip these in v1.1.0. When a user opens an issue
asking for one, that's the signal that the audience is there and
it's worth the packaging cost.

## What to do for the v1.1.0 release

In order of effort/reward:

1. **npm** — populate `NPM_TOKEN`, flip `NPM_PUBLISH_ENABLED`, push tag. Pipeline does the rest.
2. **Homebrew tap** — create the `homebrew-modern8086` repo, populate `TAP_DEPLOY_TOKEN`, flip `HOMEBREW_TAP_ENABLED`. Push tag; the auto-publish job (forthcoming) opens a PR to the tap.
3. **Scoop bucket** — same shape as Homebrew, repo `scoop-modern8086`.
4. **Chocolatey** — most user-facing friction (moderation review on the first package); worth doing once but feel free to defer.
5. **Microsoft Store** — $19 well spent if you have any non-dev Windows users in the target audience. Manual upload per release until automation lands.
6. **Mac App Store / notarized DMG** — fold this into the existing `SIGNING_ENABLED` work for the Apple Developer Program enrolment. Notarized DMG is the priority; MAS is the follow-on.

## Per-channel automation status

| Channel | In release.yml today | Planned |
|---|---|---|
| GitHub Releases | ✅ | — |
| npm | ✅ (gated) | — |
| Homebrew tap | 🟡 manifests generated as a release artifact | Auto-PR to tap repo (`TAP_DEPLOY_TOKEN`) |
| Scoop bucket | 🟡 manifest generated as a release artifact | Auto-PR to bucket repo (`BUCKET_DEPLOY_TOKEN`) |
| Chocolatey | 🟡 nuspec generated as a release artifact | Windows-runner job that runs `choco push` |
| Google Play | ✅ build (gated) + ✅ upload (gated) | Production-track promotion stays manual |
| MS Store | ❌ | Partner Center has no public submission API; stays manual |
| Mac App Store | ❌ | Tauri MAS build path needs to land first |
| Snap | ❌ | Snapcraft GitHub Action exists; cheap to add later |
| Flathub | ❌ | External; we maintain the manifest, Flathub maintains the build |
