#!/usr/bin/env bash
# Patch the freshly-`tauri android init`-generated
# packages/desktop/gen/android/app/build.gradle.kts to use a release
# signing config sourced from a keystore.properties file (which the
# release workflow writes from GitHub secrets).
#
# Tauri's default scaffold ships a debug-signing-only config that
# Play Store rejects. Rather than fork the Tauri templates, we
# post-edit the generated Gradle once at build time. The patch is
# idempotent — re-running it on an already-patched file is a no-op.
#
# Usage:
#   ./packaging/android/gradle-signing-patch.sh \
#     packages/desktop/gen/android/app/build.gradle.kts

set -euo pipefail

BUILD_GRADLE="${1:?usage: $0 path/to/app/build.gradle.kts}"

if grep -q "signingConfigs\.release" "$BUILD_GRADLE" 2>/dev/null; then
  echo "[gradle-signing-patch] already patched, skipping."
  exit 0
fi

# Read keystore.properties from the same `app/` dir; created by CI.
SIGNING_BLOCK='
import java.util.Properties
import java.io.FileInputStream

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
'

SIGNING_CONFIG='
    signingConfigs {
        create("release") {
            if (keystoreProperties.getProperty("storeFile") != null) {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }
'

# Insert imports at the top (after the existing imports block).
# Tauri's template puts plugin DSL at the very top, then android
# block. We slip the Properties import just after the first blank
# line above `android {`.
python3 <<PY
import re, sys
p = "$BUILD_GRADLE"
src = open(p).read()
prefix = """$SIGNING_BLOCK"""
config = """$SIGNING_CONFIG"""

# 1. Prepend the imports/properties-loader block if not already there.
if "rootProject.file(\\"keystore.properties\\")" not in src:
    src = prefix.lstrip() + "\n" + src

# 2. Inject signingConfigs { ... } as the first child of the
#    android { ... } block. Match the line containing 'android {'
#    and add the config right after.
src = re.sub(
    r"(android\s*\{\s*\n)",
    lambda m: m.group(1) + config,
    src,
    count=1,
)

# 3. Make the release buildType use the release signingConfig.
#    Tauri's default release block has no signingConfig line; add
#    one right after `getByName("release") {` (or `release {`).
src = re.sub(
    r"(getByName\(\"release\"\)\s*\{\s*\n|release\s*\{\s*\n)",
    lambda m: m.group(1) + "            signingConfig = signingConfigs.getByName(\"release\")\n",
    src,
    count=1,
)

open(p, "w").write(src)
PY

echo "[gradle-signing-patch] patched $BUILD_GRADLE"
