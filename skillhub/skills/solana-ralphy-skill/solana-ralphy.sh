#!/usr/bin/env bash

# ============================================
# Solana Ralphy - Autonomous AI Coding Loop
# For Solana Development with Bags.fm & Pump.fun
# Extends Ralphy with Solana-specific capabilities
# ============================================

set -euo pipefail

# ============================================
# VERSION & SOLANA CONFIGURATION
# ============================================

VERSION="1.0.0"
RALPHY_VERSION="3.1.0"

# Solana-specific options
SOLANA_NETWORK="devnet"
WITH_BAGS=false
WITH_PUMP=false
PROGRAM_FRAMEWORK="anchor"  # anchor or pinocchio
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Inherit Ralphy defaults
SKIP_TESTS=false
SKIP_LINT=false
AI_ENGINE="claude"
DRY_RUN=false
MAX_ITERATIONS=0
MAX_RETRIES=3
RETRY_DELAY=5
VERBOSE=false

# Git options
BRANCH_PER_TASK=false
CREATE_PR=false
BASE_BRANCH=""
PR_DRAFT=false

# Parallel execution
PARALLEL=false
MAX_PARALLEL=3

# PRD source
PRD_SOURCE="markdown"
PRD_FILE="SOLANA_PRD.md"
GITHUB_REPO=""
GITHUB_LABEL=""

# Colors
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
  RED=$(tput setaf 1)
  GREEN=$(tput setaf 2)
  YELLOW=$(tput setaf 3)
  BLUE=$(tput setaf 4)
  MAGENTA=$(tput setaf 5)
  CYAN=$(tput setaf 6)
  PURPLE="\033[38;2;153;69;255m"  # Solana purple #9945FF
  NEON="\033[38;2;20;241;149m"    # Solana green #14F195
  BOLD=$(tput bold)
  DIM=$(tput dim)
  RESET=$(tput sgr0)
else
  RED="" GREEN="" YELLOW="" BLUE="" MAGENTA="" CYAN="" PURPLE="" NEON="" BOLD="" DIM="" RESET=""
fi

# State
ai_pid=""
monitor_pid=""
tmpfile=""
current_step="Thinking"
total_input_tokens=0
total_output_tokens=0
total_actual_cost="0"
total_duration_ms=0
iteration=0
retry_count=0
declare -a parallel_pids=()
declare -a task_branches=()
WORKTREE_BASE=""
ORIGINAL_DIR=""

# ============================================
# LOGGING
# ============================================

log_info() { echo "${BLUE}[INFO]${RESET} $*"; }
log_success() { echo "${GREEN}[OK]${RESET} $*"; }
log_warn() { echo "${YELLOW}[WARN]${RESET} $*"; }
log_error() { echo "${RED}[ERROR]${RESET} $*" >&2; }
log_debug() { [[ "$VERBOSE" == true ]] && echo "${DIM}[DEBUG] $*${RESET}"; }
log_solana() { echo -e "${PURPLE}[SOLANA]${RESET} $*"; }

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g' | sed -E 's/^-|-$//g' | cut -c1-50
}

# ============================================
# HELP
# ============================================

show_help() {
  cat << EOF
${BOLD}Solana Ralphy${RESET} - Autonomous AI Coding for Solana (v${VERSION})

${BOLD}SOLANA OPTIONS:${RESET}
  --network NETWORK     Target network: devnet|mainnet (default: devnet)
  --with-bags           Enable Bags.fm token operations
  --with-pump           Enable Pump.fun token operations
  --anchor              Use Anchor framework (default)
  --pinocchio           Use Pinocchio for high-performance programs

${BOLD}AI ENGINE OPTIONS:${RESET}
  --claude              Use Claude Code (default)
  --opencode            Use OpenCode
  --cursor              Use Cursor agent
  --codex               Use Codex CLI

${BOLD}WORKFLOW OPTIONS:${RESET}
  --no-tests            Skip tests
  --no-lint             Skip linting
  --fast                Skip both

${BOLD}EXECUTION OPTIONS:${RESET}
  --max-iterations N    Stop after N iterations
  --max-retries N       Max retries per task (default: 3)
  --dry-run             Preview without executing

${BOLD}PARALLEL EXECUTION:${RESET}
  --parallel            Run tasks in parallel
  --max-parallel N      Max concurrent agents (default: 3)

${BOLD}GIT OPTIONS:${RESET}
  --branch-per-task     Create branch for each task
  --base-branch NAME    Base branch (default: current)
  --create-pr           Create pull requests
  --draft-pr            Create as drafts

${BOLD}PRD SOURCE:${RESET}
  --prd FILE            PRD file (default: SOLANA_PRD.md)
  --yaml FILE           Use YAML task file
  --github REPO         Fetch from GitHub issues

${BOLD}EXAMPLES:${RESET}
  ./solana-ralphy.sh --prd SOLANA_PRD.md
  ./solana-ralphy.sh --with-bags --yaml token-launch.yaml
  ./solana-ralphy.sh --parallel --anchor --network devnet
  ./solana-ralphy.sh --pinocchio --fast --network mainnet

EOF
}

# ============================================
# ARGUMENT PARSING
# ============================================

parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      # Solana-specific
      --network)
        SOLANA_NETWORK="${2:-devnet}"
        shift 2
        ;;
      --with-bags)
        WITH_BAGS=true
        shift
        ;;
      --with-pump)
        WITH_PUMP=true
        shift
        ;;
      --anchor)
        PROGRAM_FRAMEWORK="anchor"
        shift
        ;;
      --pinocchio)
        PROGRAM_FRAMEWORK="pinocchio"
        shift
        ;;
      # Workflow
      --no-tests|--skip-tests)
        SKIP_TESTS=true
        shift
        ;;
      --no-lint|--skip-lint)
        SKIP_LINT=true
        shift
        ;;
      --fast)
        SKIP_TESTS=true
        SKIP_LINT=true
        shift
        ;;
      # AI Engine
      --opencode) AI_ENGINE="opencode"; shift ;;
      --claude) AI_ENGINE="claude"; shift ;;
      --cursor|--agent) AI_ENGINE="cursor"; shift ;;
      --codex) AI_ENGINE="codex"; shift ;;
      # Execution
      --dry-run) DRY_RUN=true; shift ;;
      --max-iterations) MAX_ITERATIONS="${2:-0}"; shift 2 ;;
      --max-retries) MAX_RETRIES="${2:-3}"; shift 2 ;;
      --retry-delay) RETRY_DELAY="${2:-5}"; shift 2 ;;
      # Parallel
      --parallel) PARALLEL=true; shift ;;
      --max-parallel) MAX_PARALLEL="${2:-3}"; shift 2 ;;
      # Git
      --branch-per-task) BRANCH_PER_TASK=true; shift ;;
      --base-branch) BASE_BRANCH="${2:-}"; shift 2 ;;
      --create-pr) CREATE_PR=true; shift ;;
      --draft-pr) PR_DRAFT=true; shift ;;
      # PRD Source
      --prd)
        PRD_FILE="${2:-SOLANA_PRD.md}"
        PRD_SOURCE="markdown"
        shift 2
        ;;
      --yaml)
        PRD_FILE="${2:-solana-tasks.yaml}"
        PRD_SOURCE="yaml"
        shift 2
        ;;
      --github)
        GITHUB_REPO="${2:-}"
        PRD_SOURCE="github"
        shift 2
        ;;
      --github-label)
        GITHUB_LABEL="${2:-}"
        shift 2
        ;;
      -v|--verbose) VERBOSE=true; shift ;;
      -h|--help) show_help; exit 0 ;;
      --version) echo "Solana Ralphy v${VERSION} (Ralphy v${RALPHY_VERSION})"; exit 0 ;;
      *)
        log_error "Unknown option: $1"
        exit 1
        ;;
    esac
  done
}

# ============================================
# ENVIRONMENT CHECKS
# ============================================

check_solana_env() {
  local missing=()

  # Check Solana RPC
  if [[ -z "${SOLANA_RPC_URL:-}" ]] && [[ -z "${RPC_URL:-}" ]]; then
    log_warn "SOLANA_RPC_URL not set, using default"
    export SOLANA_RPC_URL="https://api.${SOLANA_NETWORK}.solana.com"
  fi

  # Check private key for operations
  if [[ "$WITH_BAGS" == true ]] || [[ "$WITH_PUMP" == true ]]; then
    if [[ -z "${PRIVATE_KEY:-}" ]]; then
      log_error "PRIVATE_KEY required for token operations"
      missing+=("PRIVATE_KEY")
    fi
  fi

  # Check Bags API key
  if [[ "$WITH_BAGS" == true ]] && [[ -z "${BAGS_API_KEY:-}" ]]; then
    log_error "BAGS_API_KEY required for Bags.fm operations"
    missing+=("BAGS_API_KEY")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Missing environment variables: ${missing[*]}"
    exit 1
  fi

  log_solana "Network: ${SOLANA_NETWORK}"
  log_solana "RPC: ${SOLANA_RPC_URL:-$RPC_URL}"
  [[ "$WITH_BAGS" == true ]] && log_solana "Bags.fm: enabled"
  [[ "$WITH_PUMP" == true ]] && log_solana "Pump.fun: enabled"
}

check_requirements() {
  local missing=()

  # Check PRD source
  case "$PRD_SOURCE" in
    markdown)
      if [[ ! -f "$PRD_FILE" ]]; then
        log_error "$PRD_FILE not found"
        exit 1
      fi
      ;;
    yaml)
      if [[ ! -f "$PRD_FILE" ]]; then
        log_error "$PRD_FILE not found"
        exit 1
      fi
      if ! command -v yq &>/dev/null; then
        log_error "yq required for YAML parsing"
        exit 1
      fi
      ;;
    github)
      if [[ -z "$GITHUB_REPO" ]]; then
        log_error "GitHub repo required"
        exit 1
      fi
      if ! command -v gh &>/dev/null; then
        log_error "GitHub CLI (gh) required"
        exit 1
      fi
      ;;
  esac

  # Check AI CLI
  case "$AI_ENGINE" in
    opencode)
      command -v opencode &>/dev/null || { log_error "OpenCode CLI not found"; exit 1; }
      ;;
    codex)
      command -v codex &>/dev/null || { log_error "Codex CLI not found"; exit 1; }
      ;;
    cursor)
      command -v agent &>/dev/null || { log_error "Cursor agent not found"; exit 1; }
      ;;
    *)
      command -v claude &>/dev/null || { log_error "Claude Code CLI not found"; exit 1; }
      ;;
  esac

  # Check jq
  command -v jq &>/dev/null || missing+=("jq")

  # Check gh for PRs
  [[ "$CREATE_PR" == true ]] && ! command -v gh &>/dev/null && {
    log_error "GitHub CLI required for --create-pr"
    exit 1
  }

  [[ ${#missing[@]} -gt 0 ]] && log_warn "Missing: ${missing[*]}"

  # Create progress file
  [[ ! -f "progress.txt" ]] && touch progress.txt

  # Set base branch
  if [[ "$BRANCH_PER_TASK" == true ]] && [[ -z "$BASE_BRANCH" ]]; then
    BASE_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  fi

  # Solana environment
  check_solana_env
}

# ============================================
# CLEANUP
# ============================================

cleanup() {
  local exit_code=$?
  
  [[ -n "$monitor_pid" ]] && kill "$monitor_pid" 2>/dev/null || true
  [[ -n "$ai_pid" ]] && kill "$ai_pid" 2>/dev/null || true
  
  for pid in "${parallel_pids[@]+"${parallel_pids[@]}"}"; do
    kill "$pid" 2>/dev/null || true
  done
  
  pkill -P $$ 2>/dev/null || true
  
  [[ -n "$tmpfile" ]] && rm -f "$tmpfile"
  
  if [[ -n "$WORKTREE_BASE" ]] && [[ -d "$WORKTREE_BASE" ]]; then
    for dir in "$WORKTREE_BASE"/agent-*; do
      [[ -d "$dir" ]] && git worktree remove "$dir" 2>/dev/null || true
    done
    rm -rf "$WORKTREE_BASE" 2>/dev/null || true
  fi
  
  [[ $exit_code -eq 130 ]] && {
    printf "\n"
    log_warn "Interrupted!"
    [[ -n "${task_branches[*]+"${task_branches[*]}"}" ]] && log_info "Branches: ${task_branches[*]}"
  }
}

# ============================================
# TASK SOURCES
# ============================================

get_tasks_markdown() {
  grep '^\- \[ \]' "$PRD_FILE" 2>/dev/null | sed 's/^- \[ \] //' || true
}

get_next_task_markdown() {
  grep -m1 '^\- \[ \]' "$PRD_FILE" 2>/dev/null | sed 's/^- \[ \] //' | cut -c1-60 || echo ""
}

count_remaining_markdown() {
  grep -c '^\- \[ \]' "$PRD_FILE" 2>/dev/null || echo "0"
}

count_completed_markdown() {
  grep -c '^\- \[x\]' "$PRD_FILE" 2>/dev/null || echo "0"
}

mark_task_complete_markdown() {
  local task=$1
  local escaped_task
  escaped_task=$(printf '%s\n' "$task" | sed 's/[[\.*^$/]/\\&/g')
  sed -i.bak "s/^- \[ \] ${escaped_task}/- [x] ${escaped_task}/" "$PRD_FILE"
  rm -f "${PRD_FILE}.bak"
}

get_tasks_yaml() {
  yq -r '.tasks[] | select(.completed != true) | .title' "$PRD_FILE" 2>/dev/null || true
}

get_next_task_yaml() {
  yq -r '.tasks[] | select(.completed != true) | .title' "$PRD_FILE" 2>/dev/null | head -1 | cut -c1-60 || echo ""
}

count_remaining_yaml() {
  yq -r '[.tasks[] | select(.completed != true)] | length' "$PRD_FILE" 2>/dev/null || echo "0"
}

count_completed_yaml() {
  yq -r '[.tasks[] | select(.completed == true)] | length' "$PRD_FILE" 2>/dev/null || echo "0"
}

mark_task_complete_yaml() {
  local task=$1
  yq -i "(.tasks[] | select(.title == \"$task\")).completed = true" "$PRD_FILE"
}

get_task_config_yaml() {
  local task=$1
  yq -r ".tasks[] | select(.title == \"$task\") | .config // {}" "$PRD_FILE" 2>/dev/null || echo "{}"
}

get_task_type_yaml() {
  local task=$1
  yq -r ".tasks[] | select(.title == \"$task\") | .type // \"general\"" "$PRD_FILE" 2>/dev/null || echo "general"
}

get_next_task() {
  case "$PRD_SOURCE" in
    markdown) get_next_task_markdown ;;
    yaml) get_next_task_yaml ;;
    github) get_next_task_github ;;
  esac
}

count_remaining_tasks() {
  case "$PRD_SOURCE" in
    markdown) count_remaining_markdown ;;
    yaml) count_remaining_yaml ;;
    github) count_remaining_github ;;
  esac
}

mark_task_complete() {
  local task=$1
  case "$PRD_SOURCE" in
    markdown) mark_task_complete_markdown "$task" ;;
    yaml) mark_task_complete_yaml "$task" ;;
    github) mark_task_complete_github "$task" ;;
  esac
}

# ============================================
# SOLANA-SPECIFIC PROMPT BUILDER
# ============================================

build_solana_context() {
  local task_type="${1:-general}"
  local context=""
  
  # Base Solana context
  context="You are working on a Solana project.
Network: ${SOLANA_NETWORK}
RPC: ${SOLANA_RPC_URL:-${RPC_URL:-https://api.devnet.solana.com}}

"

  # Framework context
  case "$PROGRAM_FRAMEWORK" in
    pinocchio)
      context+="Program Framework: Pinocchio (zero-dependency, high-performance)
- Use entrypoint! macro for entry
- Manual account deserialization for CU efficiency
- No heap allocations where possible
"
      ;;
    *)
      context+="Program Framework: Anchor
- Use #[program] and #[derive(Accounts)]
- Anchor account constraints for validation
- IDL auto-generation
"
      ;;
  esac

  # Task-type specific context
  case "$task_type" in
    token)
      if [[ "$WITH_BAGS" == true ]]; then
        context+="
Token Launch Platform: Bags.fm
- Use @bagsfm/bags-sdk for token operations
- Fee sharing supported (BPS-based splits)
- Partner config available for revenue share
"
      elif [[ "$WITH_PUMP" == true ]]; then
        context+="
Token Launch Platform: Pump.fun
- Bonding curve mechanics
- Auto-migration to Raydium at cap
"
      fi
      ;;
    frontend)
      context+="
Frontend Stack: @solana/client + @solana/react-hooks (framework-kit)
- Use createSolanaRpc() for RPC connection
- Use useWallet() from framework-kit
- Transaction signing with sendAndConfirmTransaction()
"
      ;;
    testing)
      context+="
Testing Framework: LiteSVM for unit tests, Surfpool for integration
- LiteSVM: Fast, in-memory Solana VM
- Surfpool: Test against mainnet state
- Mollusk: Instruction-level testing
"
      ;;
    program)
      context+="
Program Development Best Practices:
- Validate all accounts (ownership, signer, writability)
- Use PDAs for program-owned accounts
- Emit events/logs for indexers
- Consider CU optimization
"
      ;;
  esac

  echo "$context"
}

build_prompt() {
  local task_override="${1:-}"
  local prompt=""
  local task_type="general"
  
  # Get task type if using YAML
  if [[ "$PRD_SOURCE" == "yaml" ]] && [[ -n "$task_override" ]]; then
    task_type=$(get_task_type_yaml "$task_override")
  fi
  
  # Add Solana context
  prompt="$(build_solana_context "$task_type")

"

  # Add PRD context
  case "$PRD_SOURCE" in
    markdown)
      prompt+="@${PRD_FILE} @progress.txt
"
      ;;
    yaml)
      prompt+="@${PRD_FILE} @progress.txt
"
      if [[ -n "$task_override" ]]; then
        local config
        config=$(get_task_config_yaml "$task_override")
        [[ "$config" != "{}" ]] && prompt+="Task Config: $config
"
      fi
      ;;
    github)
      prompt+="Task: $task_override
@progress.txt
"
      ;;
  esac

  prompt+="
1. Find the highest-priority incomplete task and implement it."

  local step=2
  
  # Solana-specific steps
  if [[ "$task_type" == "program" ]]; then
    prompt+="
$step. Build and verify the program compiles: anchor build (or cargo build-sbf for Pinocchio)"
    step=$((step+1))
  fi

  if [[ "$SKIP_TESTS" == false ]]; then
    prompt+="
$step. Write tests (use LiteSVM for Solana programs)
$((step+1)). Run tests and ensure they pass"
    step=$((step+2))
  fi

  if [[ "$SKIP_LINT" == false ]]; then
    prompt+="
$step. Run linting (clippy for Rust, eslint for TypeScript)"
    step=$((step+1))
  fi

  # Completion step
  case "$PRD_SOURCE" in
    markdown)
      prompt+="
$step. Update PRD: change '- [ ]' to '- [x]' for completed task"
      ;;
    yaml)
      prompt+="
$step. Update ${PRD_FILE}: set completed: true"
      ;;
    github)
      prompt+="
$step. Note completion in progress.txt (issue will auto-close)"
      ;;
  esac
  
  step=$((step+1))
  
  prompt+="
$step. Append progress to progress.txt
$((step+1)). Commit with descriptive message

IMPORTANT: Work on ONE task only."

  [[ "$SKIP_TESTS" == false ]] && prompt+=" Stop if tests fail."
  [[ "$SKIP_LINT" == false ]] && prompt+=" Stop if lint fails."

  prompt+="
If ALL tasks complete, output <promise>COMPLETE</promise>."

  echo "$prompt"
}

# ============================================
# AI ENGINE
# ============================================

run_ai_command() {
  local prompt=$1
  local output_file=$2
  
  case "$AI_ENGINE" in
    opencode)
      OPENCODE_PERMISSION='{"*":"allow"}' opencode run \
        --format json \
        "$prompt" > "$output_file" 2>&1 &
      ;;
    cursor)
      agent --print --force \
        --output-format stream-json \
        "$prompt" > "$output_file" 2>&1 &
      ;;
    codex)
      codex exec --full-auto \
        --json \
        "$prompt" > "$output_file" 2>&1 &
      ;;
    *)
      claude --dangerously-skip-permissions \
        --verbose \
        --output-format stream-json \
        -p "$prompt" > "$output_file" 2>&1 &
      ;;
  esac
  
  ai_pid=$!
}

# ============================================
# PROGRESS MONITOR (Solana-themed)
# ============================================

monitor_progress() {
  local file=$1
  local task=$2
  local start_time
  start_time=$(date +%s)
  local spinstr='◐◓◑◒'
  local spin_idx=0

  task="${task:0:45}"

  while true; do
    local elapsed=$(($(date +%s) - start_time))
    local mins=$((elapsed / 60))
    local secs=$((elapsed % 60))

    if [[ -f "$file" ]] && [[ -s "$file" ]]; then
      local content
      content=$(tail -c 5000 "$file" 2>/dev/null || true)

      if echo "$content" | grep -qE 'anchor build|cargo build-sbf'; then
        current_step="Building"
      elif echo "$content" | grep -qE 'anchor deploy|solana program deploy'; then
        current_step="Deploying"
      elif echo "$content" | grep -qE 'git commit'; then
        current_step="Committing"
      elif echo "$content" | grep -qE 'anchor test|litesvm|mollusk'; then
        current_step="Testing"
      elif echo "$content" | grep -qE '"tool":"[Ww]rite"|"tool":"[Ee]dit"'; then
        current_step="Implementing"
      elif echo "$content" | grep -qE '"tool":"[Rr]ead"'; then
        current_step="Reading"
      fi
    fi

    local spinner_char="${spinstr:$spin_idx:1}"
    
    # Solana-colored output
    printf "\r  %s ${PURPLE}%-14s${RESET} │ %s ${DIM}[%02d:%02d]${RESET}    " \
      "$spinner_char" "$current_step" "$task" "$mins" "$secs"

    spin_idx=$(( (spin_idx + 1) % ${#spinstr} ))
    sleep 0.15
  done
}

# ============================================
# CALCULATE COST
# ============================================

calculate_cost() {
  local input=$1
  local output=$2
  if command -v bc &>/dev/null; then
    echo "scale=4; ($input * 0.000003) + ($output * 0.000015)" | bc
  else
    echo "N/A"
  fi
}

# ============================================
# SINGLE TASK EXECUTION
# ============================================

run_single_task() {
  local task_override="${1:-}"
  local iter="${2:-$iteration}"
  
  local next_task
  next_task=$(get_next_task)
  
  if [[ -z "$next_task" ]]; then
    return 2  # All complete
  fi

  local remaining completed
  remaining=$(count_remaining_tasks)
  completed=$(count_completed_tasks)
  
  echo ""
  echo -e "${BOLD}${NEON}━━━ Task $((completed + 1))/$((completed + remaining)) ━━━${RESET}"
  echo -e "${CYAN}$next_task${RESET}"
  echo ""

  if [[ "$BRANCH_PER_TASK" == true ]]; then
    local branch
    branch=$(create_task_branch "$next_task")
    log_info "Branch: $branch"
  fi

  if [[ "$DRY_RUN" == true ]]; then
    log_info "[DRY RUN] Would execute task"
    mark_task_complete "$next_task"
    return 0
  fi

  local prompt
  prompt=$(build_prompt "$next_task")
  log_debug "Prompt: $prompt"

  tmpfile=$(mktemp)
  current_step="Thinking"

  monitor_progress "$tmpfile" "$next_task" &
  monitor_pid=$!

  run_ai_command "$prompt" "$tmpfile"

  wait "$ai_pid" || true

  kill "$monitor_pid" 2>/dev/null || true
  monitor_pid=""

  printf "\r%80s\r" ""

  # Parse results (simplified)
  if [[ -f "$tmpfile" ]]; then
    local result
    result=$(cat "$tmpfile")
    
    if echo "$result" | grep -q "COMPLETE"; then
      log_success "All tasks complete!"
      rm -f "$tmpfile"
      return 2
    fi
    
    # Extract tokens if available
    local input_tokens output_tokens
    input_tokens=$(echo "$result" | grep -oP '"input_tokens":\s*\K\d+' | tail -1 || echo "0")
    output_tokens=$(echo "$result" | grep -oP '"output_tokens":\s*\K\d+' | tail -1 || echo "0")
    
    total_input_tokens=$((total_input_tokens + input_tokens))
    total_output_tokens=$((total_output_tokens + output_tokens))
  fi

  rm -f "$tmpfile"

  # Verify completion
  local new_remaining
  new_remaining=$(count_remaining_tasks)
  
  if [[ "$new_remaining" -lt "$remaining" ]]; then
    log_success "Task completed"
    retry_count=0
    
    if [[ "$CREATE_PR" == true ]] && [[ "$BRANCH_PER_TASK" == true ]]; then
      create_pull_request "${task_branches[-1]}" "$next_task"
    fi
    
    return 0
  else
    ((retry_count++))
    if [[ $retry_count -ge $MAX_RETRIES ]]; then
      log_error "Max retries reached"
      retry_count=0
      return 1
    fi
    log_warn "Task not marked complete, retry $retry_count/$MAX_RETRIES"
    sleep "$RETRY_DELAY"
    return 0
  fi
}

# ============================================
# GIT HELPERS
# ============================================

create_task_branch() {
  local task=$1
  local branch_name="solana-ralphy/$(slugify "$task")"
  
  local stash_before stash_after stashed=false
  stash_before=$(git stash list -1 --format='%gd %s' 2>/dev/null || true)
  git stash push -m "solana-ralphy-autostash" >/dev/null 2>&1 || true
  stash_after=$(git stash list -1 --format='%gd %s' 2>/dev/null || true)
  [[ -n "$stash_after" ]] && [[ "$stash_after" != "$stash_before" ]] && stashed=true
  
  git checkout "$BASE_BRANCH" 2>/dev/null || true
  git pull origin "$BASE_BRANCH" 2>/dev/null || true
  git checkout -b "$branch_name" 2>/dev/null || git checkout "$branch_name" 2>/dev/null || true
  
  [[ "$stashed" == true ]] && git stash pop >/dev/null 2>&1 || true
  
  task_branches+=("$branch_name")
  echo "$branch_name"
}

create_pull_request() {
  local branch=$1
  local task=$2
  local draft_flag=""
  [[ "$PR_DRAFT" == true ]] && draft_flag="--draft"
  
  git push -u origin "$branch" 2>/dev/null || return 1
  
  gh pr create \
    --base "$BASE_BRANCH" \
    --head "$branch" \
    --title "🔷 $task" \
    --body "Automated Solana PR by Solana Ralphy" \
    $draft_flag 2>/dev/null || return 1
}

# ============================================
# SUMMARY
# ============================================

show_summary() {
  echo ""
  echo -e "${BOLD}${PURPLE}════════════════════════════════════════════${RESET}"
  echo -e "${NEON}✓ Solana PRD Complete!${RESET} Finished $iteration task(s)"
  echo -e "${BOLD}${PURPLE}════════════════════════════════════════════${RESET}"
  echo ""
  echo "${BOLD}>>> Cost Summary${RESET}"
  
  if [[ "$AI_ENGINE" == "cursor" ]]; then
    echo "${DIM}Token usage not available for Cursor${RESET}"
  else
    echo "Input tokens:  $total_input_tokens"
    echo "Output tokens: $total_output_tokens"
    echo "Total tokens:  $((total_input_tokens + total_output_tokens))"
    local cost
    cost=$(calculate_cost "$total_input_tokens" "$total_output_tokens")
    echo "Est. cost:     \$$cost"
  fi
  
  if [[ -n "${task_branches[*]+"${task_branches[*]}"}" ]]; then
    echo ""
    echo "${BOLD}>>> Branches Created${RESET}"
    for branch in "${task_branches[@]}"; do
      echo "  - $branch"
    done
  fi
  
  echo ""
  echo -e "${BOLD}>>> Solana Config${RESET}"
  echo "  Network: $SOLANA_NETWORK"
  echo "  Framework: $PROGRAM_FRAMEWORK"
  [[ "$WITH_BAGS" == true ]] && echo "  Bags.fm: enabled"
  [[ "$WITH_PUMP" == true ]] && echo "  Pump.fun: enabled"
  
  echo -e "${BOLD}${PURPLE}════════════════════════════════════════════${RESET}"
}

# ============================================
# MAIN
# ============================================

main() {
  parse_args "$@"

  [[ "$DRY_RUN" == true ]] && [[ "$MAX_ITERATIONS" -eq 0 ]] && MAX_ITERATIONS=1
  
  trap cleanup EXIT
  trap 'exit 130' INT TERM HUP
  
  check_requirements
  
  # Banner
  echo -e "${BOLD}${PURPLE}════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${NEON}Solana Ralphy${RESET} - Autonomous Solana Development"
  echo -e "${BOLD}${PURPLE}════════════════════════════════════════════${RESET}"
  
  local engine_display
  case "$AI_ENGINE" in
    opencode) engine_display="${CYAN}OpenCode${RESET}" ;;
    cursor) engine_display="${YELLOW}Cursor${RESET}" ;;
    codex) engine_display="${BLUE}Codex${RESET}" ;;
    *) engine_display="${MAGENTA}Claude Code${RESET}" ;;
  esac
  
  echo "Engine: $engine_display"
  echo "Source: ${CYAN}$PRD_SOURCE${RESET} ($PRD_FILE)"
  echo -e "Network: ${PURPLE}$SOLANA_NETWORK${RESET}"
  echo "Framework: ${CYAN}$PROGRAM_FRAMEWORK${RESET}"
  
  local mode_parts=()
  [[ "$SKIP_TESTS" == true ]] && mode_parts+=("no-tests")
  [[ "$SKIP_LINT" == true ]] && mode_parts+=("no-lint")
  [[ "$DRY_RUN" == true ]] && mode_parts+=("dry-run")
  [[ "$PARALLEL" == true ]] && mode_parts+=("parallel:$MAX_PARALLEL")
  [[ "$BRANCH_PER_TASK" == true ]] && mode_parts+=("branch-per-task")
  [[ "$WITH_BAGS" == true ]] && mode_parts+=("bags")
  [[ "$WITH_PUMP" == true ]] && mode_parts+=("pump")
  
  [[ ${#mode_parts[@]} -gt 0 ]] && echo "Mode: ${YELLOW}${mode_parts[*]}${RESET}"
  echo -e "${BOLD}${PURPLE}════════════════════════════════════════════${RESET}"

  # Main loop
  while true; do
    ((iteration++))
    local result_code=0
    run_single_task "" "$iteration" || result_code=$?
    
    case $result_code in
      0) ;; # Continue
      1) log_warn "Task failed, continuing..." ;;
      2) show_summary; exit 0 ;;
    esac
    
    if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $iteration -ge $MAX_ITERATIONS ]]; then
      log_warn "Reached max iterations ($MAX_ITERATIONS)"
      show_summary
      exit 0
    fi
    
    sleep 1
  done
}

main "$@"
