# Pilot Journey QA Pack

This pack validates three high-value pilot journeys against a deployed API:
- luxury honeymoon
- family summer travel
- flexible destination planning

The script verifies for each journey:
1. signed widget token issuance
2. chat session bootstrap
3. chat response quality (citations + qualification threshold)
4. escalation path and CRM task ID

## Run
```bash
export API_BASE_URL="https://<api-domain>"
export WIDGET_ADMIN_KEY="<widget-admin-key>"
export SMOKE_TENANT_ID="tenant_luxe_demo"      # optional
export SMOKE_SITE_ID="luxevoyages.example"     # optional
npm run qa:pilot
```

## Expected output
- `PASS <journey_name> ...` for all 3 journeys
- final line `Pilot journey pack passed`

If any assertion fails, the script exits non-zero for CI/CD gating.
