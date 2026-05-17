#!/bin/bash
set -e

ISSUE_NUMBER=$1

if [ -z "$ISSUE_NUMBER" ]; then
  echo "Usage: $0 <issue-number>"
  exit 1
fi

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
BRANCH_NAME="issue-${ISSUE_NUMBER}/${BRANCH_SLUG}"

git checkout -b "$BRANCH_NAME"
echo "Created branch: $BRANCH_NAME"

PROMPT="You are working on GitHub issue #${ISSUE_NUMBER} in the catalyse repository.

URL: ${ISSUE_URL}
Title: ${ISSUE_TITLE}

Description:
${ISSUE_BODY}
$(echo -e "$PREREQ_SECTION")

Before writing any code, propose a clear implementation plan and wait for the user to confirm. If there are open prerequisites above, flag them and ask whether to proceed anyway. Once confirmed, implement the changes. When all work is complete, run \`npm run check-all\` and report the results."

REAL_GIT=$(which git)
TMPBIN=$(mktemp -d)
trap 'rm -rf "$TMPBIN"' EXIT

for cmd in gh railway curl wget yarn pnpm bun ssh scp rsync prisma python python3 osascript; do
  printf '#!/bin/bash\necho "%s: not permitted in issue sessions" >&2\nexit 1\n' "$cmd" > "$TMPBIN/$cmd"
  chmod +x "$TMPBIN/$cmd"
done

cat > "$TMPBIN/git" << GITSCRIPT
#!/bin/bash
SUBCMD=\$("$REAL_GIT" config --get "alias.\$1" 2>/dev/null || echo "\$1")
case "\$SUBCMD" in
  push)
    echo "git push: not permitted in issue sessions" >&2
    exit 1
    ;;
  checkout|switch)
    echo "git \$1: not permitted in issue sessions — stay on the issue branch" >&2
    exit 1
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

REAL_NPM=$(which npm)
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

PATH="$TMPBIN:$PATH" claude --no-mcp --sandbox "$PROMPT"
