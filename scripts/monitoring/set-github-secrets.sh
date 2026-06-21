#!/bin/bash
set -euo pipefail

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "Missing SUPABASE_URL"
  exit 1
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Missing SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi

if [[ -z "${RESEND_API_KEY:-}" ]]; then
  echo "Missing RESEND_API_KEY"
  exit 1
fi

gh secret set SUPABASE_URL --body "$SUPABASE_URL"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$SUPABASE_SERVICE_ROLE_KEY"
gh secret set RESEND_API_KEY --body "$RESEND_API_KEY"
gh secret set CONTACT_EMAIL_DESTINATION --body "2133611700uscis@gmail.com"
gh secret set FEDERAL_REGISTER_USER_AGENT --body "Messenginfo Monitoring/1.0 (contact@messenginfo.com)"

echo "GitHub secrets updated."
