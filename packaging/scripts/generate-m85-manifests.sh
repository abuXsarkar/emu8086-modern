#!/usr/bin/env bash
# Fill the m85 distribution manifest templates from a tagged release.
#
# Usage:
#   ./packaging/scripts/generate-m85-manifests.sh 0.1.0
#
# Pulls the matching checksums.txt from the m85-v<version> GitHub
# Release, fills the templates under packaging/{homebrew,scoop,
# chocolatey-8085}, emits ready-to-commit files under target/
# packaging-m85/.
#
# The maintainer then copies into their tap / bucket / chocolatey
# push repos and pushes upstream. Independent of generate-
# distribution-manifests.sh which handles the 8086 release.

set -euo pipefail

VERSION="${1:?usage: generate-m85-manifests.sh <version>  e.g. 0.1.0}"
TAG="m85-v${VERSION}"
REPO="abuXsarkar/modern8086"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/target/packaging-m85"

echo ">> filling manifests for ${TAG}"
mkdir -p "${OUT}/homebrew/Formula" \
         "${OUT}/scoop/bucket" \
         "${OUT}/chocolatey-8085/tools"

CHECKSUMS="$(curl -fsSL "https://github.com/${REPO}/releases/download/${TAG}/checksums.txt")"

sha_for() {
  echo "$CHECKSUMS" | awk -v f="$1" '$2 == f { print $1 }'
}

SHA_MAC_AARCH64=$(sha_for "m85-macos-aarch64.tar.gz")
SHA_MAC_X86_64=$(sha_for "m85-macos-x86_64.tar.gz")
SHA_LINUX_X86_64=$(sha_for "m85-linux-x86_64.tar.gz")
SHA_WIN_X86_64=$(sha_for "m85-windows-x86_64.zip")

for f in SHA_MAC_AARCH64 SHA_MAC_X86_64 SHA_LINUX_X86_64 SHA_WIN_X86_64; do
  if [ -z "${!f:-}" ]; then
    echo "missing ${f} in checksums.txt — aborting" >&2
    exit 1
  fi
done

substitute() {
  sed \
    -e "s|{{VERSION_M85}}|${VERSION}|g" \
    -e "s|{{SHA256_M85_MACOS_AARCH64}}|${SHA_MAC_AARCH64}|g" \
    -e "s|{{SHA256_M85_MACOS_X86_64}}|${SHA_MAC_X86_64}|g" \
    -e "s|{{SHA256_M85_LINUX_X86_64}}|${SHA_LINUX_X86_64}|g" \
    -e "s|{{SHA256_M85_WINDOWS_X86_64}}|${SHA_WIN_X86_64}|g"
}

substitute < "${ROOT}/packaging/homebrew/Formula/m85.rb.template" \
  > "${OUT}/homebrew/Formula/m85.rb"
substitute < "${ROOT}/packaging/scoop/m85.json.template" \
  > "${OUT}/scoop/bucket/m85.json"
substitute < "${ROOT}/packaging/chocolatey-8085/m85.nuspec.template" \
  > "${OUT}/chocolatey-8085/m85.nuspec"
substitute < "${ROOT}/packaging/chocolatey-8085/tools/chocolateyinstall.ps1.template" \
  > "${OUT}/chocolatey-8085/tools/chocolateyinstall.ps1"
cp "${ROOT}/packaging/chocolatey-8085/tools/chocolateyuninstall.ps1" \
   "${OUT}/chocolatey-8085/tools/chocolateyuninstall.ps1"

echo
echo "wrote:"
find "${OUT}" -type f | sort
echo
echo "Next steps:"
echo "  homebrew tap repo:  cp ${OUT}/homebrew/Formula/m85.rb <tap>/Formula/  ; git add ... ; git commit ; git push"
echo "  scoop bucket repo:  cp ${OUT}/scoop/bucket/m85.json   <bucket>/bucket/ ; git add ... ; git commit ; git push"
echo "  chocolatey push  :  cd ${OUT}/chocolatey-8085 && choco pack && choco push m85.${VERSION}.nupkg --source https://push.chocolatey.org/ --api-key \$CHOCO_API_KEY"
