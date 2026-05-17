#!/bin/bash
set -e

ISSUE_NUMBER=$1

if [ -z "$ISSUE_NUMBER" ] || ! [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <issue-number>"
  exit 1
fi

# Pre-flight: required commands
for cmd in gh jq claude docker; do
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

# Warn if working tree is dirty
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Warning: uncommitted changes in working tree"
  read -r -p "Continue? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

git checkout main
git pull

npm run local-setup

echo "Fetching issue #${ISSUE_NUMBER}..."
ISSUE_JSON=$(gh issue view "$ISSUE_NUMBER" --json title,body,url)
ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body')
ISSUE_URL=$(echo "$ISSUE_JSON" | jq -r '.url')

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
    for ((n=start; n<=end; n++)); do PREREQ_NUMBERS="$PREREQ_NUMBERS $n"; done
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
    fi
  done
fi

BRANCH_SLUG=$(echo "$ISSUE_TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed 's/[^a-z0-9]/-/g' \
  | sed 's/-\{2,\}/-/g' \
  | sed 's/^-//;s/-$//' \
  | cut -c1-50)
BRANCH_NAME="issue-${ISSUE_NUMBER}-${BRANCH_SLUG}"

git checkout -b "$BRANCH_NAME"
echo "Created branch: $BRANCH_NAME"

PROMPT="You are working on GitHub issue #${ISSUE_NUMBER} in the catalyse repository.

URL: ${ISSUE_URL}
Title: ${ISSUE_TITLE}

Description:
${ISSUE_BODY}
$(echo -e "$PREREQ_SECTION")

Before writing any code, propose a clear implementation plan and wait for the user to confirm. If there are open prerequisites above, flag them and ask whether to proceed anyway. Once confirmed, implement the changes. When all work is complete, run \`npm run check-all\` and report the results. Then push the branch and raise a PR using \`gh pr create\` with a clear title and description referencing the issue."

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
if [[ "\$1" == "pr" && "\$2" == "view" ]]; then
  exec "$REAL_GH" "\$@"
fi
if [[ "\$1" == "pr" && "\$2" == "create" ]]; then
  for arg in "\$@"; do
    if [[ "\$arg" == "--base" ]]; then
      NEXT_IS_BASE=1
      continue
    fi
    if [[ "\$NEXT_IS_BASE" == "1" ]]; then
      if [[ "\$arg" != "main" ]]; then
        echo "gh pr create: can only target main branch" >&2
        exit 1
      fi
      break
    fi
  done
  exec "$REAL_GH" "\$@"
fi
if [[ "\$1" == "pr" && "\$2" == "edit" ]]; then
  if [[ "\$*" == *"--base"* ]]; then
    echo "gh pr edit --base: not permitted in issue sessions" >&2
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
    for arg in "\$@"; do
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

# Note: --sandbox runs Claude in a Docker container. If the container does not
# inherit the host PATH, the wrappers above will not apply inside the session.
# The --sandbox flag still provides filesystem/network isolation independently.
echo ""
echo "Launching Claude session for issue #${ISSUE_NUMBER} on branch ${BRANCH_NAME}."
echo "If the session ends unexpectedly, run 'claude --continue' from this directory to resume."
echo ""

unset RAILWAY_TOKEN RESEND_API_KEY GOOGLE_CLIENT_SECRET CRON_SECRET
PATH="$TMPBIN:$PATH" claude --no-mcp --sandbox --dangerously-skip-permissions "$PROMPT"
