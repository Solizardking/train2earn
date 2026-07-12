#!/usr/bin/env bash

# Solana Ralphy Skill Installer
# Installs the skill to Claude Code skills directory

set -euo pipefail

SKILL_NAME="solana-ralphy"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[38;2;153;69;255m'
NEON='\033[38;2;20;241;149m'
RESET='\033[0m'

show_banner() {
  echo -e "${PURPLE}"
  echo "╔═══════════════════════════════════════════╗"
  echo "║         Solana Ralphy Installer           ║"
  echo "║   Autonomous AI Coding for Solana         ║"
  echo "╚═══════════════════════════════════════════╝"
  echo -e "${RESET}"
}

show_help() {
  cat << EOF
Usage: ./install.sh [OPTIONS]

Options:
  --personal    Install to ~/.claude/skills (default)
  --project     Install to .claude/skills in current directory
  --path PATH   Install to custom path
  --help        Show this help

Examples:
  ./install.sh                    # Personal installation
  ./install.sh --project          # Project-specific
  ./install.sh --path /custom     # Custom location
EOF
}

# Parse arguments
INSTALL_PATH="$HOME/.claude/skills"
INSTALL_TYPE="personal"

while [[ $# -gt 0 ]]; do
  case $1 in
    --personal)
      INSTALL_PATH="$HOME/.claude/skills"
      INSTALL_TYPE="personal"
      shift
      ;;
    --project)
      INSTALL_PATH=".claude/skills"
      INSTALL_TYPE="project"
      shift
      ;;
    --path)
      INSTALL_PATH="$2"
      INSTALL_TYPE="custom"
      shift 2
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

show_banner

echo -e "${BLUE}Installation type:${RESET} $INSTALL_TYPE"
echo -e "${BLUE}Target path:${RESET} $INSTALL_PATH/$SKILL_NAME"
echo ""

# Create directory
mkdir -p "$INSTALL_PATH/$SKILL_NAME"

# Copy files
echo -e "${NEON}Copying skill files...${RESET}"
cp -r "$SCRIPT_DIR"/* "$INSTALL_PATH/$SKILL_NAME/"

# Make scripts executable
chmod +x "$INSTALL_PATH/$SKILL_NAME/solana-ralphy.sh"
chmod +x "$INSTALL_PATH/$SKILL_NAME/install.sh"

# Install npm dependencies if needed
if [[ -f "$INSTALL_PATH/$SKILL_NAME/assets/package.json" ]]; then
  echo -e "${NEON}Installing npm dependencies...${RESET}"
  cd "$INSTALL_PATH/$SKILL_NAME/assets"
  if command -v npm &>/dev/null; then
    npm install --silent 2>/dev/null || true
  fi
  cd - > /dev/null
fi

echo ""
echo -e "${GREEN}✓ Solana Ralphy installed successfully!${RESET}"
echo ""
echo -e "${PURPLE}Quick Start:${RESET}"
echo ""
echo "  1. Create a Solana PRD:"
echo "     cp $INSTALL_PATH/$SKILL_NAME/templates/SOLANA_PRD.md ./SOLANA_PRD.md"
echo ""
echo "  2. Set environment variables:"
echo "     export SOLANA_RPC_URL=https://api.devnet.solana.com"
echo "     export PRIVATE_KEY=<your_key>"
echo "     export BAGS_API_KEY=<your_key>  # For token ops"
echo ""
echo "  3. Run Solana Ralphy:"
echo "     $INSTALL_PATH/$SKILL_NAME/solana-ralphy.sh --prd SOLANA_PRD.md"
echo ""
echo -e "${NEON}Or use with Claude Code:${RESET}"
echo "     Claude will automatically detect the skill"
echo ""
