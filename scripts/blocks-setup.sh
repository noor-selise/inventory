#!/usr/bin/env bash
# One time Blocks project setup for features 3 to 5 (specs 0003, 0004, 0005).
#
# Every mutating step prints its --dry-run first, then runs with --yes. Steps that
# find their work already done are skipped, so the script is safe to run again.
#
# Usage, from the repo root:
#   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' bash scripts/blocks-setup.sh
#
# The password is only passed to `blocks iam users create`. It is never written
# to a file or echoed. Change it after the first sign in.
set -euo pipefail

PROJECT="Dfe830076882d4e28a313347efed8fbbe"
APP_HOST="dbpgei-epxmf.slsblx.com"
REDIRECT_URIS="https://${APP_HOST}:5173/login/callback,https://${APP_HOST}/login/callback"
CLIENT_NAME="Inventory Web"

export BLOCKS_STRICT_FLAGS=1

cd "$(dirname "$0")/.."

blocks_json() {
  # Run a blocks command, drop the update notice, keep only JSON on stdout.
  blocks "$@" --project "$PROJECT" --json 2>/dev/null
}

json() {
  # json '<js expression over d>' reads JSON from stdin.
  node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);const r=($1);if(r!==undefined)console.log(typeof r==='string'?r:JSON.stringify(r))})"
}

step() { printf '\n== %s\n' "$1"; }

apply() {
  # apply <description> <blocks args...>: dry run, then the real call.
  local description="$1"
  shift
  echo "-- dry run: ${description}"
  blocks "$@" --project "$PROJECT" --dry-run --json 2>/dev/null | grep -v -i '"password"' || true
  echo "-- applying: ${description}"
  blocks "$@" --project "$PROJECT" --yes --json 2>/dev/null | grep -v -i 'secret' || true
}

step "1. Public OIDC client for the app (spec 0003 build step 1)"
CLIENT_ID=$(blocks_json auth oidc-clients list | json "(d.oIDCClientCredentials||[]).find(c=>c.clientDisplayName==='${CLIENT_NAME}')?.clientId")
if [ -z "$CLIENT_ID" ]; then
  apply "create client ${CLIENT_NAME}" auth oidc-clients save \
    --client-display-name "$CLIENT_NAME" \
    --client-type public \
    --redirect-uris "$REDIRECT_URIS" \
    --scope "openid profile" \
    --require-pkce \
    --register-as-identity-provider \
    --auto-redirect \
    --active
  CLIENT_ID=$(blocks_json auth oidc-clients list | json "(d.oIDCClientCredentials||[]).find(c=>c.clientDisplayName==='${CLIENT_NAME}')?.clientId")
else
  echo "Already exists: ${CLIENT_ID}"
fi
if [ -z "$CLIENT_ID" ]; then
  echo "Could not read the client id back. Check 'blocks auth oidc-clients list --json'." >&2
  exit 1
fi
[ -f .env ] || cp .env.example .env
sed -i.bak "s|^VITE_BLOCKS_OIDC_CLIENT_ID=.*|VITE_BLOCKS_OIDC_CLIENT_ID=${CLIENT_ID}|" .env && rm -f .env.bak
echo "Wrote VITE_BLOCKS_OIDC_CLIENT_ID to .env"

step "2. Turn on OIDC login"
if [ "$(blocks_json auth config get | json 'String(d.isOidcEnabled)')" = "true" ]; then
  echo "Already on"
else
  apply "enable OIDC" auth config save --oidc-enabled --account-action-base-url "https://${APP_HOST}"
fi

step "3. Check the identity provider has real endpoints"
blocks_json auth idp list | json "(d.data||d.items||d.identityProviders||d||[]).map?.(p=>({name:p.displayName||p.name, authorizationUrl:p.authorizationUrl||p.authorizationEndpoint||null}))"

step "4. The seven role bundles (spec 0003 AC-4)"
EXISTING_ROLES=$(blocks_json iam roles list --page-size 100 | json "(d.data||[]).map(r=>r.slug).join(',')")
while IFS='|' read -r slug name description; do
  if [[ ",${EXISTING_ROLES}," == *",${slug},"* ]]; then
    echo "Role ${slug} already exists"
  else
    apply "create role ${slug}" iam roles create --slug "$slug" --name "$name" --description "$description"
  fi
done <<'ROLES'
admin|Admin|Full access, manages the team and settings
manager|Manager|Everything except team and plan settings
sales|Sales|Customers, quotes and sales orders
purchasing|Purchasing|Vendors and purchase orders
warehouse|Warehouse|Picking, receiving, counts and transfers
production|Production|Manufacture orders and timesheets
readonly|Read only|Can view, cannot change anything
ROLES

step "5. Admin can manage the team (IAM endpoints the Team screen calls)"
apply "grant team management to admin" iam roles assign-permissions admin \
  --add-permissions "blocks-iam::iam::users,blocks-iam::iam::mutate-users,blocks-iam::iam::roles,blocks-iam::auth::resend-activation"

step "6. Data model: schemas, access rules, reload (specs 0004, 0005)"
blocks data validate --json 2>/dev/null
apply "data sync" data sync

step "7. Unique and lookup indexes"
SCHEMAS_JSON=$(blocks_json data schema list --page-size 100)
schema_id() { echo "$SCHEMAS_JSON" | json "((d.data&&d.data.items)||d.items||d.data||[]).find(s=>s.schemaName==='$1')?.id"; }
add_index() {
  # add_index <schema> <fields> [--unique]
  local id
  id=$(schema_id "$1")
  if [ -z "$id" ]; then echo "Schema $1 not found, skipping index"; return; fi
  if blocks_json data schema indexes list "$id" | json "(d.indexes||[]).some(i=>JSON.stringify(i).includes('$2'.split(',')[0].split(':')[0]))" | grep -q true; then
    echo "Index on $1($2) already exists"
    return
  fi
  apply "index $1($2) $3" data schema indexes create --schema-id "$id" --fields "$2" ${3:-} || echo "Index on $1($2) failed, continuing"
}
add_index Currency code --unique
add_index NumberingRule documentType --unique
add_index Category name,parentId --unique
add_index Product name --unique
add_index Product sku --unique
add_index ProductBarcode barcode --unique
add_index ProductBarcode productId
add_index ExchangeRate currencyCode,effectiveOn:desc

step "8. Admin user"
if [ -z "${ADMIN_EMAIL:-}" ]; then
  echo "ADMIN_EMAIL not set, skipping"
else
  AVAILABLE=$(blocks_json iam email available "$ADMIN_EMAIL" | json 'String(d.isAvailable ?? d.IsAvailable ?? d.data?.isAvailable)')
  if [ "$AVAILABLE" = "false" ]; then
    echo "${ADMIN_EMAIL} already has an account. Granting the admin role instead."
    USER_ID=$(blocks_json iam users list --email "$ADMIN_EMAIL" | json "(d.data||[])[0]?.itemId")
    [ -n "$USER_ID" ] && apply "grant admin to ${ADMIN_EMAIL}" iam users access grant "$USER_ID" --roles admin
  else
    if [ -z "${ADMIN_PASSWORD:-}" ]; then
      echo "ADMIN_PASSWORD not set: creating the user without one, they set it from the activation email."
      apply "create ${ADMIN_EMAIL}" iam users create --email "$ADMIN_EMAIL" --roles admin
    else
      echo "-- dry run: create ${ADMIN_EMAIL} with the admin role (password lines hidden)"
      blocks iam users create --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --roles admin \
        --project "$PROJECT" --dry-run --json 2>/dev/null | grep -v -i 'password' || true
      echo "-- applying: create ${ADMIN_EMAIL} with the admin role"
      blocks iam users create --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --roles admin \
        --project "$PROJECT" --yes --json 2>/dev/null | grep -v -i 'password' || true
    fi
  fi
  blocks_json iam users list --email "$ADMIN_EMAIL" | json "(d.data||[]).map(u=>({email:u.email,roles:u.roles,active:u.active}))"
fi

printf '\nDone. Next: pnpm cert, add "127.0.0.1 %s" to /etc/hosts, then pnpm dev and open https://%s:5173\n' "$APP_HOST" "$APP_HOST"
