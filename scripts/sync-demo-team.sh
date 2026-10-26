#!/usr/bin/env bash
# Sync dev demo team: deactivate legacy @example.com invites, ensure yopmail roster (spec 0003).
#
# Usage (password never written to disk):
#   DEMO_TEAM_PASSWORD='…' ADMIN_EMAIL=noor@yopmail.com bash scripts/sync-demo-team.sh
#
# Dry-run only: DRY_RUN=1 DEMO_TEAM_PASSWORD='…' bash scripts/sync-demo-team.sh
set -euo pipefail

PROJECT="Dfe830076882d4e28a313347efed8fbbe"
ADMIN_EMAIL="${ADMIN_EMAIL:-noor@yopmail.com}"
export BLOCKS_STRICT_FLAGS=1

cd "$(dirname "$0")/.."

if [ -z "${DEMO_TEAM_PASSWORD:-}" ]; then
  echo "Set DEMO_TEAM_PASSWORD to the shared initial password for demo accounts." >&2
  exit 1
fi

blocks_json() {
  blocks "$@" --project "$PROJECT" --json 2>/dev/null
}

json() {
  node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);const r=($1);if(r!==undefined)console.log(typeof r==='string'?r:JSON.stringify(r))})"
}

apply() {
  local description="$1"
  shift
  echo "-- ${description}"
  if [ "${DRY_RUN:-}" = "1" ]; then
    blocks "$@" --project "$PROJECT" --dry-run --json 2>/dev/null | grep -v -i '"password"' || true
    return
  fi
  blocks "$@" --project "$PROJECT" --dry-run --json 2>/dev/null | grep -v -i '"password"' || true
  blocks "$@" --project "$PROJECT" --yes --json 2>/dev/null | grep -v -i 'password' || true
}

user_id() {
  local email="$1"
  blocks_json iam users list --email "$email" --page-size 5 | json "(d.data||[]).find(u=>String(u.email).toLowerCase()==='${email,,}')?.itemId||''"
}

user_active() {
  local email="$1"
  blocks_json iam users list --email "$email" --page-size 5 | json "String((d.data||[]).find(u=>String(u.email).toLowerCase()==='${email,,}')?.active)"
}

remove_legacy_email() {
  local email="$1"
  local id roles
  id=$(user_id "$email")
  [ -z "$id" ] && return 0
  roles=$(blocks_json iam users list --email "$email" --page-size 5 | json "JSON.stringify((d.data||[])[0]?.roles||{})")
  if [ "$roles" != "{}" ] && [ -n "$roles" ] && [ "$roles" != '""' ]; then
    apply "revoke org access for ${email}" iam users access revoke "$id"
  fi
  if [ "$(user_active "$email")" = "true" ]; then
    apply "deactivate ${email}" iam users deactivate "$id"
  else
    echo "Legacy removed from roster: ${email}"
  fi
}

ensure_member() {
  local email="$1" first="$2" last="$3" role="$4"
  local available id
  available=$(blocks_json iam email available "$email" | json 'String(d.isAvailable ?? d.IsAvailable ?? d.data?.isAvailable)')
  if [ "$available" = "true" ]; then
    apply "create ${email} (${role})" iam users create \
      --email "$email" --first-name "$first" --last-name "$last" \
      --password "$DEMO_TEAM_PASSWORD" --roles "$role"
    id=$(user_id "$email")
    [ -n "$id" ] && apply "activate ${email}" iam users activate "$id" --reason "Demo team sync"
    return
  fi
  id=$(user_id "$email")
  [ -z "$id" ] && { echo "Could not resolve user id for ${email}" >&2; return 1; }
  apply "grant ${role} to ${email}" iam users access grant "$id" --roles "$role"
  if [ "$(user_active "$email")" = "false" ]; then
    apply "activate ${email}" iam users activate "$id" --reason "Demo team sync"
  fi
}

printf '\n== Remove legacy *.demo@example.com from org roster\n'
LEGACY=(
  manager.demo@example.com
  sales.demo@example.com
  purchasing.demo@example.com
  warehouse.demo@example.com
  production.demo@example.com
  readonly.demo@example.com
)
for email in "${LEGACY[@]}"; do
  remove_legacy_email "$email"
done

printf '\n== Ensure admin %s\n' "$ADMIN_EMAIL"
id=$(user_id "$ADMIN_EMAIL")
if [ -z "$id" ]; then
  echo "Admin ${ADMIN_EMAIL} not found. Run scripts/blocks-setup.sh with ADMIN_EMAIL and ADMIN_PASSWORD first." >&2
  exit 1
fi
apply "grant admin to ${ADMIN_EMAIL}" iam users access grant "$id" --roles admin
if [ "$(user_active "$ADMIN_EMAIL")" = "false" ]; then
  apply "activate ${ADMIN_EMAIL}" iam users activate "$id" --reason "Demo team sync"
fi

printf '\n== Ensure yopmail demo roster (one per role)\n'
while IFS='|' read -r email first last role; do
  ensure_member "$email" "$first" "$last" "$role"
done <<'ROSTER'
maya@yopmail.com|Maya|Manager|manager
sami@yopmail.com|Sami|Sales|sales
priya@yopmail.com|Priya|Purchasing|purchasing
wasim@yopmail.com|Wasim|Warehouse|warehouse
pablo@yopmail.com|Pablo|Production|production
rita@yopmail.com|Rita|Readonly|readonly
ROSTER

printf '\n== Current roster (emails only)\n'
blocks_json iam users list --page-size 50 | json "(d.data||[]).map(u=>({email:u.email,active:u.active,roles:u.roles}))"

printf '\nDone.\n'
