#!/usr/bin/env bash
# Fills the version + per-asset SHA-256 placeholders in the
# `packaging/{homebrew,scoop,chocolatey}/*.template` files and writes
# the filled manifests under `target/packaging/`.
#
# Inputs:
#   - $1 (or $VERSION env): release version (e.g. "1.1.0", no "v" prefix)
#   - GitHub Release `vX.Y.Z` must exist with the following assets:
#       m86-linux-x86_64.tar.gz
#       m86-macos-x86_64.tar.gz
#       m86-macos-aarch64.tar.gz
#       m86-windows-x86_64.zip
#       modern8086_X.Y.Z_universal.dmg  (or whatever Tauri names it)
#       checksums.txt                    (preferred — sed reads sums from here)
#
# If `checksums.txt` is available, sums are read from there. Otherwise
# the script downloads each asset and computes its sha256 locally.
#
# Output: ready-to-commit files in `target/packaging/`:
#   homebrew/Formula/m86.rb
#   homebrew/Casks/modern8086.rb
#   scoop/m86.json
#   chocolatey/m86.nuspec
#   chocolatey/tools/chocolateyinstall.ps1
#
# Usage:
#   ./packaging/scripts/generate-distribution-manifests.sh 1.1.0

set -euo pipefail

VERSION="${1:-${VERSION:-}}"
if [ -z "$VERSION" ]; then
  echo "usage: $0 <version>   (or set VERSION env)" >&2
  exit 2
fi

REPO="abuXsarkar/modern8086"
TAG="v${VERSION}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPLATE_DIR="${ROOT}/packaging"
OUT_DIR="${ROOT}/target/packaging"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "${TMP_DIR}"' EXIT

mkdir -p \
  "${OUT_DIR}/homebrew/Formula" \
  "${OUT_DIR}/homebrew/Casks" \
  "${OUT_DIR}/scoop" \
  "${OUT_DIR}/chocolatey/tools"

# Try checksums.txt first; fall back to per-asset downloads.
CHECKSUMS_URL="https://github.com/${REPO}/releases/download/${TAG}/checksums.txt"
CHECKSUMS_FILE="${TMP_DIR}/checksums.txt"

if curl -fsSL "${CHECKSUMS_URL}" -o "${CHECKSUMS_FILE}" 2>/dev/null; then
  echo "Using checksums.txt from ${TAG}"
else
  echo "checksums.txt missing — will download each asset and hash locally."
  : > "${CHECKSUMS_FILE}"
fi

sha_for() {
  local asset="$1"
  local sum
  # sha256sum/checksums.txt format: "<hash>  <name>"
  sum="$(awk -v a="$asset" '$2 == a { print $1; exit }' "${CHECKSUMS_FILE}" || true)"
  if [ -n "$sum" ]; then
    echo "$sum"
    return
  fi
  local url="https://github.com/${REPO}/releases/download/${TAG}/${asset}"
  local f="${TMP_DIR}/${asset}"
  if ! curl -fsSL "$url" -o "$f"; then
    echo "ERROR: cannot fetch ${asset} from ${url}" >&2
    return 1
  fi
  sha256sum "$f" | awk '{print $1}'
}

LINUX_X64="$(sha_for m86-linux-x86_64.tar.gz)"
MACOS_X64="$(sha_for m86-macos-x86_64.tar.gz)"
MACOS_ARM="$(sha_for m86-macos-aarch64.tar.gz)"
WIN_X64="$(sha_for m86-windows-x86_64.zip)"
# Tauri DMG name: modern8086_<version>_universal.dmg
DMG="$(sha_for "modern8086_${VERSION}_universal.dmg" || echo MISSING)"

fill() {
  sed \
    -e "s|{{VERSION}}|${VERSION}|g" \
    -e "s|{{SHA256_LINUX_X86_64}}|${LINUX_X64}|g" \
    -e "s|{{SHA256_MACOS_X86_64}}|${MACOS_X64}|g" \
    -e "s|{{SHA256_MACOS_AARCH64}}|${MACOS_ARM}|g" \
    -e "s|{{SHA256_WINDOWS_X86_64}}|${WIN_X64}|g" \
    -e "s|{{SHA256_MACOS_UNIVERSAL_DMG}}|${DMG}|g"
}

fill < "${TEMPLATE_DIR}/homebrew/Formula/m86.rb.template" \
  > "${OUT_DIR}/homebrew/Formula/m86.rb"
fill < "${TEMPLATE_DIR}/homebrew/Casks/modern8086.rb.template" \
  > "${OUT_DIR}/homebrew/Casks/modern8086.rb"
fill < "${TEMPLATE_DIR}/scoop/m86.json.template" \
  > "${OUT_DIR}/scoop/m86.json"
fill < "${TEMPLATE_DIR}/chocolatey/m86.nuspec.template" \
  > "${OUT_DIR}/chocolatey/m86.nuspec"
fill < "${TEMPLATE_DIR}/chocolatey/tools/chocolateyinstall.ps1.template" \
  > "${OUT_DIR}/chocolatey/tools/chocolateyinstall.ps1"
cp "${TEMPLATE_DIR}/chocolatey/tools/chocolateyuninstall.ps1" \
  "${OUT_DIR}/chocolatey/tools/chocolateyuninstall.ps1"

echo
echo "Filled manifests:"
find "${OUT_DIR}" -type f -printf "  %p\n"
echo
echo "Next:"
echo "  1. Drop \`${OUT_DIR}/homebrew/{Formula,Casks}/*\` into the tap repo abuXsarkar/homebrew-modern8086 and commit."
echo "  2. Drop \`${OUT_DIR}/scoop/m86.json\` into the bucket repo abuXsarkar/scoop-modern8086 as \`bucket/m86.json\` and commit."
echo "  3. From \`${OUT_DIR}/chocolatey/\`: \`choco pack && choco push m86.${VERSION}.nupkg --source https://push.chocolatey.org/ --api-key \$CHOCO_API_KEY\`"
