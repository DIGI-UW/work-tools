#!/bin/bash
# Build .skill files from skill source directories.
# Copies shared references, zips each skill, and optionally symlinks for Claude Code.
#
# Usage: ./build-skills.sh [--symlink] [--template] [--config=NAME]
#   --symlink       Also create/update .claude/skills/ symlinks for Claude Code
#   --template      Build shareable versions: swap my-config.md for my-config.example.md
#   --config=NAME   Use my-config.NAME.md instead of my-config.md (e.g., --config=dev, --config=pm)
set -e

SYMLINK=false
TEMPLATE=false
CONFIG_NAME=""
for arg in "$@"; do
  case "$arg" in
    --symlink)      SYMLINK=true ;;
    --template)     TEMPLATE=true ;;
    --config=*)     CONFIG_NAME="${arg#--config=}" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/skills"
SHARED_DIR="$SKILLS_DIR/shared"
OUTPUT_DIR="$SKILLS_DIR/built-archive"
CLAUDE_SKILLS_DIR="$SCRIPT_DIR/.claude/skills"

if $TEMPLATE; then
  OUTPUT_DIR="$SKILLS_DIR/built-archive/templates"
elif [ -n "$CONFIG_NAME" ]; then
  OUTPUT_DIR="$SKILLS_DIR/built-archive/$CONFIG_NAME"
fi

mkdir -p "$OUTPUT_DIR"

SKILL_DIRS=(daily-planner weekly-harvest-timesheet deep-research)
VERSION=$(git -C "$SCRIPT_DIR" describe --tags --always 2>/dev/null || echo "dev")

echo "=== Building Skills (version: $VERSION) ==="
if [ -n "$CONFIG_NAME" ]; then
  echo "  Config: $CONFIG_NAME"
elif $TEMPLATE; then
  echo "  Mode: template (placeholder config)"
fi
echo ""

for SKILL_NAME in "${SKILL_DIRS[@]}"; do
  SKILL_SRC="$SKILLS_DIR/$SKILL_NAME"

  if [ ! -f "$SKILL_SRC/SKILL.md" ]; then
    echo "  SKIP $SKILL_NAME (no SKILL.md)"
    continue
  fi

  # Create a temp build directory
  BUILD_DIR=$(mktemp -d)
  SKILL_BUILD="$BUILD_DIR/$SKILL_NAME"
  mkdir -p "$SKILL_BUILD"

  # Copy skill contents
  cp -r "$SKILL_SRC"/* "$SKILL_BUILD/"

  # Copy shared references
  if [ -d "$SHARED_DIR" ]; then
    mkdir -p "$SKILL_BUILD/references"
    for shared_file in "$SHARED_DIR"/*.md; do
      if [ -f "$shared_file" ]; then
        cp "$shared_file" "$SKILL_BUILD/references/"
      fi
    done
  fi

  # Config selection: --template uses example, --config=NAME uses named config
  if $TEMPLATE; then
    CONFIG_EXAMPLE="$SKILL_BUILD/references/my-config.example.md"
    CONFIG_TARGET="$SKILL_BUILD/references/my-config.md"
    if [ -f "$CONFIG_EXAMPLE" ]; then
      cp "$CONFIG_EXAMPLE" "$CONFIG_TARGET"
    fi
  elif [ -n "$CONFIG_NAME" ]; then
    NAMED_CONFIG="$SKILL_BUILD/references/my-config.${CONFIG_NAME}.md"
    CONFIG_TARGET="$SKILL_BUILD/references/my-config.md"
    if [ -f "$NAMED_CONFIG" ]; then
      cp "$NAMED_CONFIG" "$CONFIG_TARGET"
    else
      echo "  WARN: $SKILL_NAME has no my-config.${CONFIG_NAME}.md — using default"
    fi
  fi

  # Clean up non-active config files from the build (keep only my-config.md)
  rm -f "$SKILL_BUILD"/references/my-config.*.md

  # Build .skill file (zip)
  SKILL_FILE="$OUTPUT_DIR/$SKILL_NAME.skill"
  (cd "$BUILD_DIR" && zip -qr "$SKILL_FILE" "$SKILL_NAME/")

  # Calculate size
  SIZE=$(du -h "$SKILL_FILE" | cut -f1 | xargs)
  FILE_COUNT=$(cd "$BUILD_DIR" && find "$SKILL_NAME" -type f | wc -l | xargs)

  echo "  $SKILL_NAME.skill ($SIZE, $FILE_COUNT files)"

  # Clean up
  rm -rf "$BUILD_DIR"
done

# Symlink for Claude Code
if $SYMLINK; then
  echo ""
  echo "--- Claude Code Symlinks ---"
  mkdir -p "$CLAUDE_SKILLS_DIR"

  for SKILL_NAME in "${SKILL_DIRS[@]}"; do
    SKILL_SRC="$SKILLS_DIR/$SKILL_NAME"
    LINK_PATH="$CLAUDE_SKILLS_DIR/$SKILL_NAME"

    if [ -L "$LINK_PATH" ]; then
      echo "  $SKILL_NAME → already linked"
    elif [ -d "$LINK_PATH" ]; then
      echo "  $SKILL_NAME → directory exists (skipping)"
    else
      ln -s "$SKILL_SRC" "$LINK_PATH"
      echo "  $SKILL_NAME → linked"
    fi
  done
fi

echo ""
echo "=== Done. Output: $OUTPUT_DIR ==="
