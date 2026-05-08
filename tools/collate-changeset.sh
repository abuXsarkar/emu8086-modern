#!/usr/bin/env bash
#
# Collate every `.changeset/*.md` fragment (except the README) into
# `CHANGELOG.md`'s `### Added (post-handoff)` section, in alphabetical
# order by filename, then delete the fragment files. Run once per
# release — see `.changeset/README.md` for the rationale.
#
# Idempotent: rerunning with no fragments is a no-op.

set -euo pipefail

cd "$(dirname "$0")/.."

CHANGESET_DIR=".changeset"
CHANGELOG="CHANGELOG.md"
ANCHOR="### Added (post-handoff)"

if [[ ! -d "$CHANGESET_DIR" ]]; then
    echo "$CHANGESET_DIR does not exist — nothing to collate."
    exit 0
fi

# Collect fragments, skipping the README and any non-.md files.
mapfile -t FRAGMENTS < <(
    find "$CHANGESET_DIR" -maxdepth 1 -type f -name '*.md' \
        ! -name 'README.md' \
        | sort
)

if [[ ${#FRAGMENTS[@]} -eq 0 ]]; then
    echo "No changeset fragments to collate."
    exit 0
fi

if ! grep -q "^$ANCHOR$" "$CHANGELOG"; then
    echo "ERROR: $CHANGELOG is missing the '$ANCHOR' anchor line."
    echo "       Add the line back, or update this script's ANCHOR var."
    exit 1
fi

# Build the inserted block. Each fragment becomes one bullet; we
# preserve their internal newlines but require they end without a
# trailing blank line (the README documents this).
TMP_INSERT="$(mktemp)"
trap 'rm -f "$TMP_INSERT"' EXIT
for f in "${FRAGMENTS[@]}"; do
    cat "$f" >> "$TMP_INSERT"
    # Each fragment is a single bullet ending in its own newline.
    # If a fragment didn't end with a newline, fix that locally.
    [[ $(tail -c1 "$f") == $'\n' ]] || echo "" >> "$TMP_INSERT"
done

# Splice the insertion right after the anchor line + the blank line
# that follows it. We use awk because GNU/BSD sed disagree on file
# inclusion behaviour; awk is portable.
TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_INSERT" "$TMP_OUT"' EXIT
awk -v anchor="$ANCHOR" -v insertfile="$TMP_INSERT" '
    BEGIN { inserted = 0 }
    {
        print
        if (!inserted && $0 == anchor) {
            getline blank
            print blank
            while ((getline line < insertfile) > 0) {
                print line
            }
            close(insertfile)
            inserted = 1
        }
    }
' "$CHANGELOG" > "$TMP_OUT"

mv "$TMP_OUT" "$CHANGELOG"

# Drop the fragments now that they've been merged.
for f in "${FRAGMENTS[@]}"; do
    rm "$f"
done

echo "Collated ${#FRAGMENTS[@]} fragment(s) into $CHANGELOG."
echo "Fragments removed; review the diff and commit."
