#!/bin/bash
set -e

ISSUE_NUMBER=$1
shift

MODEL="claude-sonnet-4-6"
CONTINUE=false
FRESH=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --model=*) MODEL="${1#--model=}"; shift ;;
    --continue) CONTINUE=true; shift ;;
    --fresh) FRESH=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if $CONTINUE && $FRESH; then
  echo "Error: --continue and --fresh are mutually exclusive." >&2
  exit 1
fi

if $CONTINUE || $FRESH; then
  if [ -n "$ISSUE_NUMBER" ] && ! [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "Usage: $0 [--continue|--fresh] [--model <model-id>]" >&2
    exit 1
  fi
elif [ -z "$ISSUE_NUMBER" ] || ! [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <issue-number> [--model <model-id>] [--continue|--fresh]"
  exit 1
fi

# Pre-flight: required commands
for cmd in gh jq claude; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' is required but not installed or not in PATH" >&2
    exit 1
  fi
done

# Pre-flight: gh authenticated
if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

# Pre-flight: prevent concurrent sessions
LOCKDIR="/tmp/catalyse-issue-session.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "Error: another issue session is already running (lock at $LOCKDIR)." >&2
  echo "If you're sure none is running, remove the lock: rm -rf $LOCKDIR" >&2
  exit 1
fi
trap 'rm -rf "$LOCKDIR"' EXIT

PROMPT=""

if $CONTINUE; then
  BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$BRANCH_NAME" == "main" || "$BRANCH_NAME" == "HEAD" ]]; then
    echo "Error: not on an issue branch (currently on '$BRANCH_NAME')." >&2
    exit 1
  fi
elif $FRESH; then
  BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$BRANCH_NAME" == "main" || "$BRANCH_NAME" == "HEAD" ]]; then
    echo "Error: not on an issue branch (currently on '$BRANCH_NAME')." >&2
    exit 1
  fi
  if [[ "$BRANCH_NAME" =~ ^issue-([0-9]+)- ]]; then
    ISSUE_NUMBER="${BASH_REMATCH[1]}"
  else
    echo "Error: cannot determine issue number from branch '$BRANCH_NAME'." >&2
    exit 1
  fi

  echo "Fetching issue #${ISSUE_NUMBER}..."
  ISSUE_JSON=$(gh issue view "$ISSUE_NUMBER" --json title,body,url)
  ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body')
  ISSUE_URL=$(echo "$ISSUE_JSON" | jq -r '.url')

  GIT_LOG=$(git log --oneline main..HEAD 2>/dev/null || true)
  GIT_DIFF_STAT=$(git diff --stat main..HEAD 2>/dev/null || true)

  PROGRESS_SECTION=""
  if [ -n "$GIT_LOG" ]; then
    PROGRESS_SECTION="
Commits on this branch ahead of main:
${GIT_LOG}

Files changed:
${GIT_DIFF_STAT}"
  else
    PROGRESS_SECTION="
No commits on this branch yet ahead of main."
  fi

  PROMPT="You are resuming work on GitHub issue #${ISSUE_NUMBER} in the catalyse repository. A previous session was working on this issue but has ended. You are starting a fresh session to continue.

URL: ${ISSUE_URL}
Title: ${ISSUE_TITLE}

Description:
${ISSUE_BODY}
${PROGRESS_SECTION}

Review the existing commits and changed files to understand what has already been implemented. Then assess what remains to complete the issue and ask the user if there is anything specific to focus on or if you should continue where the previous session left off. Once aligned, continue the implementation. When all work is complete, run \`npm run check-all\` and report the results. Then push the branch and raise a PR using \`gh pr create --base main\` (--base main must be the first flags) with a clear title and description referencing the issue."
else
  echo "Fetching issue #${ISSUE_NUMBER}..."
  ISSUE_JSON=$(gh issue view "$ISSUE_NUMBER" --json title,body,url)
  ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body')
  ISSUE_URL=$(echo "$ISSUE_JSON" | jq -r '.url')

  BRANCH_SLUG=$(echo "$ISSUE_TITLE" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]/-/g' \
    | sed 's/-\{2,\}/-/g' \
    | sed 's/^-//;s/-$//' \
    | cut -c1-50)
  BRANCH_NAME="issue-${ISSUE_NUMBER}-${BRANCH_SLUG}"
  # Warn if working tree is dirty
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Warning: uncommitted changes in working tree"
    read -r -t 30 -p "Continue? [y/N] " confirm || confirm="n"
    [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
  fi

  git checkout main
  git pull

  npm run local-setup

  # Detect prerequisite issues — find lines with prerequisite keywords (excluding "blocks" lines),
  # extract all #N references and expand ranges like #81–#84 or #81-#84
  PREREQ_NUMBERS=""
  while IFS= read -r line; do
    # skip lines that are about this issue blocking others (inverse direction)
    echo "$line" | grep -iqE '^\*{0,2}blocks' && continue
    # only process lines with prerequisite-type keywords
    echo "$line" | grep -iqE '(depends on|blocked by|prerequisites?|requires|needs)' || continue
    # expand ranges like #81–#84 or #81-#84
    expanded=$(echo "$line" | sed 's/#\([0-9]*\)[–-]\([0-9]*\)/\1-\2/g')
    while [[ "$expanded" =~ ([0-9]+)-([0-9]+) ]]; do
      start=${BASH_REMATCH[1]}; end=${BASH_REMATCH[2]}
      if (( end - start > 20 )); then
        echo "Warning: ignoring large prerequisite range #${start}-#${end} (exceeds 20-issue limit)" >&2
      else
        for ((n=start; n<=end; n++)); do PREREQ_NUMBERS="$PREREQ_NUMBERS $n"; done
      fi
      expanded="${expanded/${BASH_REMATCH[0]}/}"
    done
    # pick up any remaining individual #N references
    nums=$(echo "$line" | grep -oE '#[0-9]+' | grep -oE '[0-9]+' || true)
    PREREQ_NUMBERS="$PREREQ_NUMBERS $nums"
  done <<< "$ISSUE_BODY"
  PREREQ_NUMBERS=$(echo "$PREREQ_NUMBERS" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -un || true)

  PREREQ_SECTION=""
  if [ -n "$PREREQ_NUMBERS" ]; then
    PREREQ_SECTION="\nPrerequisites:"
    for NUM in $PREREQ_NUMBERS; do
      P_JSON=$(gh issue view "$NUM" --json title,state,url 2>/dev/null || true)
      if [ -n "$P_JSON" ]; then
        P_TITLE=$(echo "$P_JSON" | jq -r '.title')
        P_STATE=$(echo "$P_JSON" | jq -r '.state')
        P_URL=$(echo "$P_JSON" | jq -r '.url')
        PREREQ_SECTION="${PREREQ_SECTION}\n- #${NUM} [${P_STATE}] ${P_TITLE} (${P_URL})"
      else
        echo "Warning: could not fetch prerequisite issue #${NUM} (not found or no access)" >&2
        PREREQ_SECTION="${PREREQ_SECTION}\n- #${NUM} [UNKNOWN] (could not fetch)"
      fi
    done
  fi

  if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    AHEAD=$(git rev-list --count "main..${BRANCH_NAME}")
    if (( AHEAD > 0 )); then
      echo "Error: branch '$BRANCH_NAME' already has $AHEAD commit(s) ahead of main — a previous session may have been started for this issue." >&2
      echo "To resume: git checkout $BRANCH_NAME && npm run issue -- --continue" >&2
      echo "To start fresh: git branch -D $BRANCH_NAME" >&2
      exit 1
    fi
    echo "Branch '$BRANCH_NAME' exists with no commits ahead of main — reusing."
    git checkout "$BRANCH_NAME"
  else
    git checkout -b "$BRANCH_NAME"
    echo "Created branch: $BRANCH_NAME"
  fi

  PROMPT="You are working on GitHub issue #${ISSUE_NUMBER} in the catalyse repository.

URL: ${ISSUE_URL}
Title: ${ISSUE_TITLE}

Description:
${ISSUE_BODY}
$(echo -e "$PREREQ_SECTION")

Before writing any code, read the relevant parts of the codebase to understand the context, then propose a clear implementation plan. As part of the plan, identify and ask the user about anything that is ambiguous or where multiple approaches are viable — interview the user to understand their preferred direction before committing to an approach. If there are open prerequisites above, flag them and ask whether to proceed anyway. Wait for the user to confirm the plan and answer any open questions before implementing. Once confirmed, implement the changes. When all work is complete, run \`npm run check-all\` and report the results. Then push the branch and raise a PR using \`gh pr create --base main\` (--base main must be the first flags) with a clear title and description referencing the issue."
fi

REAL_GIT=$(which git)
REAL_GH=$(which gh)
REAL_NPM=$(which npm)
TMPBIN=$(mktemp -d)
trap 'rm -rf "$LOCKDIR" "$TMPBIN"' EXIT

for cmd in \
  railway aws gcloud az brew \
  curl wget nc netcat socat ftp sftp telnet \
  yarn pnpm bun npx pip pip3 gem cargo \
  ssh scp rsync \
  prisma python python3 ruby perl go \
  open osascript docker; do
  printf '#!/bin/bash\necho "%s: not permitted in issue sessions" >&2\nexit 1\n' "$cmd" > "$TMPBIN/$cmd"
  chmod +x "$TMPBIN/$cmd"
done

cat > "$TMPBIN/gh" << GHSCRIPT
#!/bin/bash
base_value() {
  local next=0
  for arg in "\$@"; do
    [[ "\$next" == "1" ]] && { echo "\$arg"; return; }
    [[ "\$arg" == "--base" ]] && next=1
  done
}
if [[ "\$1" == "pr" && "\$2" == "view" ]]; then
  exec "$REAL_GH" "\$@"
fi
if [[ "\$1" == "pr" && "\$2" == "create" ]]; then
  if [[ "\$(base_value "\$@")" != "main" ]]; then
    echo "gh pr create: --base main is required" >&2
    exit 1
  fi
  exec "$REAL_GH" "\$@"
fi
if [[ "\$1" == "pr" && "\$2" == "edit" ]]; then
  BASE="\$(base_value "\$@")"
  if [[ -n "\$BASE" && "\$BASE" != "main" ]]; then
    echo "gh pr edit: --base must target main" >&2
    exit 1
  fi
  exec "$REAL_GH" "\$@"
fi
echo "gh \$*: not permitted in issue sessions (only 'gh pr create' and 'gh pr edit' are allowed)" >&2
exit 1
GHSCRIPT
chmod +x "$TMPBIN/gh"

cat > "$TMPBIN/git" << GITSCRIPT
#!/bin/bash
SUBCMD=\$("$REAL_GIT" config --get "alias.\$1" 2>/dev/null || echo "\$1")
case "\$SUBCMD" in
  push)
    if [[ "\$*" == *"--force"* || "\$*" == *" -f"* || "\$*" == *"--tags"* ]]; then
      echo "git push --force/--tags: not permitted in issue sessions" >&2
      exit 1
    fi
    # allow push only if no branch specified, or branch matches the issue branch
    for arg in "\${@:2}"; do
      if [[ "\$arg" != -* && "\$arg" != "origin" && "\$arg" != "" && "\$arg" != "$BRANCH_NAME" ]]; then
        echo "git push to '\$arg': not permitted — can only push $BRANCH_NAME" >&2
        exit 1
      fi
    done
    exec "$REAL_GIT" "\$@"
    ;;
  checkout|switch)
    echo "git \$1: not permitted in issue sessions — stay on the issue branch" >&2
    exit 1
    ;;
  worktree)
    echo "git worktree: not permitted in issue sessions" >&2
    exit 1
    ;;
  config)
    if [[ "\$*" == *"--global"* || "\$*" == *"--system"* ]]; then
      echo "git config --global/--system: not permitted in issue sessions" >&2
      exit 1
    fi
    exec "$REAL_GIT" "\$@"
    ;;
  reset)
    if [[ "\$*" == *"--hard"* ]]; then
      echo "git reset --hard: not permitted in issue sessions" >&2
      exit 1
    fi
    exec "$REAL_GIT" "\$@"
    ;;
  *)
    exec "$REAL_GIT" "\$@"
    ;;
esac
GITSCRIPT
chmod +x "$TMPBIN/git"

cat > "$TMPBIN/npm" << NPMSCRIPT
#!/bin/bash
case "\$1" in
  install|ci|audit|list|ls|outdated|exec)
    exec "$REAL_NPM" "\$@"
    ;;
  run)
    case "\$2" in
      fetch-prod-db|cron:backup|build:railway|local-setup|issue|demo|demo:snapshot|demo:compare|test:ui|test:headed|test:dev|test:dev:log|test:dev:headed|test:dev:ui)
        echo "npm run \$2: not permitted in issue sessions" >&2
        exit 1
        ;;
      *)
        exec "$REAL_NPM" "\$@"
        ;;
    esac
    ;;
  *)
    echo "npm \$1: not permitted in issue sessions" >&2
    exit 1
    ;;
esac
NPMSCRIPT
chmod +x "$TMPBIN/npm"

cat > "$TMPBIN/issue-session-canary" << 'CANARY'
#!/bin/bash
echo "issue-session-sandbox-active"
CANARY
chmod +x "$TMPBIN/issue-session-canary"

CANARY_OUTPUT=$(PATH="$TMPBIN:$PATH" issue-session-canary 2>&1)
if [[ "$CANARY_OUTPUT" != "issue-session-sandbox-active" ]]; then
  echo "Error: sandbox canary check failed (got: '$CANARY_OUTPUT'). Aborting." >&2
  exit 1
fi

echo ""
if $CONTINUE; then
  echo "Resuming Claude session on branch ${BRANCH_NAME} (sandbox restored)."
elif $FRESH; then
  echo "Starting fresh Claude session for issue #${ISSUE_NUMBER} on branch ${BRANCH_NAME}."
else
  echo "Launching Claude session for issue #${ISSUE_NUMBER} on branch ${BRANCH_NAME}."
fi
echo "If the session ends unexpectedly, run 'npm run issue -- --continue' to resume with the sandbox active."
echo ""

unset RAILWAY_TOKEN RESEND_API_KEY GOOGLE_CLIENT_SECRET CRON_SECRET
if $CONTINUE; then
  PATH="$TMPBIN:$PATH" claude --model "$MODEL" --continue --strict-mcp-config --dangerously-skip-permissions
else
  PATH="$TMPBIN:$PATH" claude --model "$MODEL" --strict-mcp-config --dangerously-skip-permissions "$PROMPT"
fi
