# Android / Google Play Store setup

What you (the maintainer) do **once**, before the CI Android job can
ship signed APKs (for sideload) + a signed AAB (for Play Console).

## 1. Generate the upload keystore

This is the key that signs every AAB you upload to Play Console.
Keep it stable across releases — losing it means losing the ability
to publish updates under the same app listing.

```bash
keytool -genkey -v \
  -keystore upload.keystore \
  -alias upload \
  -keyalg RSA -keysize 2048 \
  -validity 36500
```

You'll be prompted for two passwords (one for the keystore, one for
the key) and a distinguished name. The DN doesn't have to be your
real name; Google only looks at the public key.

**Back up `upload.keystore` immediately.** Push it to 1Password, a
hardware key, anywhere safe. If you lose it, you cannot publish
updates to the same listing — you'd have to register a new app.

## 2. Add three secrets + one variable to the GitHub repo

`Settings → Secrets and variables → Actions`:

| Name | Value | Where |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.keystore` | Secrets |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password from `keytool` | Secrets |
| `ANDROID_KEY_PASSWORD` | the key password from `keytool` (often same as keystore) | Secrets |
| `ANDROID_KEY_ALIAS` | `upload` (or whatever you passed to `-alias`) | Secrets |
| `ANDROID_BUILD_ENABLED` | `true` | Variables |

Once these are set, the next tag push builds release-signed APKs
(one per ABI) and a universal AAB, then attaches all of them to the
GitHub Release. You upload the AAB manually to Play Console for the
first listing; the APKs are immediately sideload-installable.

## 3. Create the Play Console listing (one-time, manual)

1. Sign in to https://play.google.com/console (you said you already
   have a paid Google Play Developer account — $25 lifetime).
2. **Create app** → name `modern8086`, default language English (US),
   app or game = App, free or paid = Free, declare acknowledgements.
3. Under **Set up your app**:
   - **App access**: "All functionality available without special access".
   - **Ads**: "No, this app does not contain ads".
   - **Content rating**: take the IARC questionnaire — answer "No" to
     every category. Likely **Everyone**.
   - **Target audience**: 13+, not specifically aimed at children.
   - **News app**: No.
   - **COVID-19 contact tracing**: No.
   - **Data safety**: declare what the app collects. Default config
     collects nothing; if you keep it that way, every category is
     "No". If you ever turn on opt-in metrics, declare those.
   - **Government app**: No.
   - **Financial features**: No.
4. **Store listing** (Main store listing → English (United States)):
   - Copy text from `packaging/android/listing/en-US/`:
     - App name → `title.txt`
     - Short description → `short_description.txt`
     - Full description → `full_description.txt`
   - Upload graphics (you'll need to produce these once):
     - App icon: 512×512 PNG, 32-bit with alpha.
     - Feature graphic: 1024×500 PNG/JPG.
     - At least 2 screenshots (phone, 16:9 or 9:16, 320–3840 px).
   - Categorization: **Education** → **Tools** (developer tools fits if
     Education is rejected; Education plays better with classroom searches).
   - Contact details: support email = your maintainer email.
   - Privacy policy: required. Host one at
     `https://modern8086.com/privacy/` and link it here. Simplest:
     a markdown page that says "modern8086 collects no personal data
     unless you opt into local-only metrics in Settings. No data
     leaves your device. Source: github.com/abuXsarkar/modern8086.".

## 4. First upload (manual)

1. Wait for a `v1.1.0` (or later) GitHub Release with the
   `modern8086-android-X.Y.Z.aab` asset attached.
2. Play Console → **Production** (or **Internal testing** for a
   first dry-run) → **Create new release**.
3. Upload the AAB.
4. Paste `whats-new/en-US/default.txt` into the release notes.
5. Save → Review release → Roll out.

First production review usually takes 3–7 days. Internal-testing
track is instant — recommended for the first push so you can verify
the AAB installs cleanly on a real device before committing to a
production listing.

## 5. Auto-publish on subsequent tags (optional)

Once the listing exists, you can let CI push subsequent AABs
directly to the **Internal testing** track without touching Play
Console.

1. Google Play Console → Setup → API access → "Link a project" to
   a Google Cloud project (create one if needed).
2. In Cloud Console, create a service account with role "Service
   Account User". Download its JSON key.
3. Back in Play Console → API access → grant the service account
   "Release manager" or "Release apps to testing tracks only" on
   the modern8086 app.
4. Add two more secrets/variables to the GitHub repo:

| Name | Value |
|---|---|
| `PLAY_STORE_SERVICE_ACCOUNT_JSON` (secret) | contents of the JSON key file |
| `PLAY_STORE_UPLOAD_ENABLED` (variable) | `true` |
| `PLAY_STORE_TRACK` (variable) | `internal` (or `alpha`, `beta`, `production`) |

The release workflow's `android` job will then call
`r0adkll/upload-google-play@v1` after the AAB is built and push it
to the chosen track.

Production track promotions stay manual — code goes to Internal
automatically, you promote it to Production from the Play Console
UI after sanity-checking a build.
