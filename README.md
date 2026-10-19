# Avaya SBCE Manager

Dockerized management plane for Avaya Session Border Controller for Enterprise (SBCE) / EMS.

Focused on safe certificate lifecycle automation, configuration snapshots, multi-customer organization, and proactive expiration reporting.

## v1 Scope

- Dual-auth web UI (Entra ID on :443, local admin on :8443)
- Customer / Site / Device hierarchy
- Encrypted credential store
- Config snapshots + restore
- Certificate inventory, monitoring, and renewal (upload + CSR workflow)
- Temporary scoped customer upload links for signed certificates
- Reporting Profiles (Email, Slack, Teams Adaptive Cards via MSAL)
- Device lock, dry-run, HA-pair awareness, audit log
- Customer access via outbound tunnel or existing VPN

## Quick Start (development)

```bash
docker compose up --build
```

- Entra / main UI: https://localhost:443
- Local admin: https://localhost:8443

## Status

Early scaffolding — core models and API skeleton in progress.
