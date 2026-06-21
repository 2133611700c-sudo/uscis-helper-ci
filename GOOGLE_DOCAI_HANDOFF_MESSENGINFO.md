# 1. STATUS
- STATUS: PASS
- Date: 2026-05-25 (America/Los_Angeles)
- Assembled by: Codex GPT-5 (Principal Engineer / Handoff Owner)
- VERIFIED in this handoff:
  - Google Cloud project exists and is selected (`messenginfo`, number `537268475735`)
  - Billing is enabled for project
  - `documentai.googleapis.com` is enabled
  - Document AI OCR processor exists and is enabled
  - Service account exists, key was created, and assigned roles are verifiable
  - Real `:process` request succeeded against created processor (no error)
- OPEN / UNVERIFIED in this handoff:
  - Production runtime secret mount path and deployment wiring
  - Final least-privilege hardening review for roles
  - Batch processing path
  - Non-image MIME coverage in live test (PDF not tested in this run)
  - Quota/limits acceptance review
  - Key rotation automation

# 2. GOOGLE CLOUD RESOURCE INVENTORY
VERIFIED resources:
- project_id: `messenginfo`
- project_number: `537268475735`
- billing status: `billingEnabled=true` (billingAccountName: `billingAccounts/017B06-FADD49-787B9A`)
- API enabled status: `documentai.googleapis.com = enabled`
- processor type: `OCR_PROCESSOR` (Document OCR)
- processor display name: `messenginfo-docai-ocr-primary-us`
- processor_id: `d207a62dc88ed12c`
- region: `us`
- full processor resource path: `projects/537268475735/locations/us/processors/d207a62dc88ed12c`
- service account email: `messenginfo-docai-ocr-sa@messenginfo.iam.gserviceaccount.com`
- assigned roles (current, verified by IAM policy):
  - `roles/documentai.apiUser`
  - `roles/documentai.editor`
  - `roles/documentai.viewer`
  - `roles/serviceusage.serviceUsageConsumer`
  - `roles/storage.objectViewer`

# 3. AUTH / CREDENTIAL MODEL
## Local dev auth (VERIFIED)
- ADC/service-account JSON flow was used and tested.
- Working credential file path:
  - `/Users/sergiiivanenko/.config/messenginfo/secrets/messenginfo-docai-ocr-sa-20260525.json`
- Local env model:
  - `GOOGLE_APPLICATION_CREDENTIALS=/Users/sergiiivanenko/.config/messenginfo/secrets/messenginfo-docai-ocr-sa-20260525.json`
  - `GOOGLE_CLOUD_PROJECT=messenginfo`
  - `GOOGLE_CLOUD_LOCATION=us`
  - `DOCAI_PROCESSOR_ID=d207a62dc88ed12c`
- Credential lookup mode: ADC via `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON).

## Production auth (OPEN / UNVERIFIED)
- Recommended target model: mounted secret path or secret manager backed service account credentials (ADC-compatible), no embedded key in code.
- Exact production mount path and runtime wiring are not verified in this handoff.

## Secret/repo safety
- JSON key file is not stored in `uscis-helper` repo.
- Repo leak check result for `uscis-helper`: no matches for key filename/private_key markers.
- Note: evidence files under `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808` contain key *path references* (not key material).

# 4. VERIFIED TEST REQUEST
- Endpoint used:
  - `https://us-documentai.googleapis.com/v1/projects/537268475735/locations/us/processors/d207a62dc88ed12c:process`
- Auth method used:
  - Service account JSON key -> ADC -> OAuth2 bearer token.
- MIME type used:
  - `image/jpeg`
- Processor used:
  - `projects/537268475735/locations/us/processors/d207a62dc88ed12c`
- Result:
  - success (no error)
  - pages: `1`
  - text length: `423`
- Evidence files:
  - `process_request.json`
  - `process_response.json`
  - `verification_summary.txt`

# 5. INTEGRATION INPUTS FOR NEXT AGENT
Use exactly these inputs:
- `GOOGLE_CLOUD_PROJECT=messenginfo`
- `GOOGLE_CLOUD_LOCATION=us`
- `DOCAI_PROCESSOR_ID=d207a62dc88ed12c`
- `DOCAI_PROCESSOR_RESOURCE_NAME=projects/537268475735/locations/us/processors/d207a62dc88ed12c`
- `GOOGLE_APPLICATION_CREDENTIALS=/Users/sergiiivanenko/.config/messenginfo/secrets/messenginfo-docai-ocr-sa-20260525.json` (local dev verified)
- service account email: `messenginfo-docai-ocr-sa@messenginfo.iam.gserviceaccount.com`
- region: `us`
- expected MIME types for initial implementation: `image/jpeg`, `image/png`, `application/pdf` (only `image/jpeg` was live-tested in this run)
- sync process endpoint pattern:
  - `https://{location}-documentai.googleapis.com/v1/projects/{project_number}/locations/{location}/processors/{processor_id}:process`
- processing mode in scope now: `sync only` (batch path not tested here)

# 6. MINIMAL WORKING CALL
1. Accept user file bytes (`jpg/png/pdf`).
2. Build `rawDocument` payload:
   - `mimeType`: exact MIME
   - `content`: base64(file-bytes)
3. Authenticate with ADC (service account credentials).
4. POST to:
   - `https://us-documentai.googleapis.com/v1/projects/537268475735/locations/us/processors/d207a62dc88ed12c:process`
5. Read response sections:
   - `document.text`
   - `document.pages[]`
   - `document.mimeType`
   - `document.entities[]` (if present)
6. Persist in Supabase (implementation target for next agent):
   - request metadata: `project_id`, `location`, `processor_id`, `mime_type`
   - normalized OCR payload: full `document` JSON
   - denormalized quick fields: `page_count`, `text`, `text_length`
   - provenance: `processed_at`, `processor_resource_name`, request file hash

Minimal request body shape:
```json
{
  "rawDocument": {
    "mimeType": "image/jpeg",
    "content": "<base64-bytes>"
  }
}
```

# 7. SECURITY RULES
- Do not commit JSON key files to any repo.
- Do not print `private_key` values in logs, docs, chats, commits, or code comments.
- Do not embed secrets in source code.
- Prefer ADC + mounted secret path or secret manager in production.
- Current JSON-key path is VERIFIED for local development only.
- Production secret mount strategy is required before release and remains OPEN.

# 8. EVIDENCE INDEX
| Artifact | Path | What it proves |
|---|---|---|
| console_welcome_project.png | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/console_welcome_project.png` | Correct active GCP project context (`messenginfo`) |
| console_document_ai_processors.png | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/console_document_ai_processors.png` | Processor exists in Document AI UI (`Document OCR`, enabled) |
| console_service_accounts.png | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/console_service_accounts.png` | Service account exists and key ID visible |
| processor_create_response.json | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/processor_create_response.json` | Processor created with ID/type/state/endpoint |
| processor_get.json | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/processor_get.json` | Processor retrievable via API |
| service_account_summary.txt | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/service_account_summary.txt` | Service account email and key file path |
| process_request.json | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/process_request.json` | Exact payload used for live process request |
| process_response.json | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/process_response.json` | Successful OCR response (`document` present) |
| verification_summary.txt | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/verification_summary.txt` | API enabled + IAM roles + process success summary |
| integration_packet.json | `/Users/sergiiivanenko/Documents/New project/MESSENGINFO_DOCAI_SETUP_20260525-013808/integration_packet.json` | Consolidated integration identifiers and env inputs |

# 9. OPEN / UNVERIFIED
- Production runtime credential mount path and deployment wiring are not verified.
- Least-privilege completeness has not been hardened down from current role set.
- Batch processing (`:batchProcess`) not tested.
- PDF live request not tested in this run (only JPEG tested).
- Quota/cost guardrails not reviewed for production throughput.
- Key rotation/revocation operational policy not configured in this handoff.

# 10. NEXT AGENT ACTIONS
Step 1. Wire backend config/env to read `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `DOCAI_PROCESSOR_ID`, `GOOGLE_APPLICATION_CREDENTIALS`.
Step 2. Implement a single server-side DocAI client/service for sync `:process` (rawDocument path).
Step 3. Add strict MIME validation (`image/jpeg`, `image/png`, `application/pdf`) and size guardrails.
Step 4. Persist OCR result to Supabase with full `document` JSON + denormalized fields (`text`, `page_count`, `text_length`).
Step 5. Connect existing OCR pipeline entrypoint to call this service as primary external OCR engine.
Step 6. Add runtime error mapping (`PERMISSION_DENIED`, `INVALID_ARGUMENT`, `RESOURCE_EXHAUSTED`, `UNAVAILABLE`) to user-facing/manual fallback path.
Step 7. Add integration tests with fixture(s): one JPEG (must pass), one PDF (must be added and verified).
Step 8. Move credentials to production secret mount/secret manager and remove any reliance on local absolute path.
Step 9. Re-run live end-to-end in target environment and update STATUS/HANDOFF/CHANGELOG with VERIFIED vs OPEN.
