# Avaya SBCE Manager

Dockerized management plane for Avaya Session Border Controller for Enterprise (SBCE) / EMS.

Focused on safe certificate lifecycle automation, configuration snapshots, multi-customer organization, and proactive expiration reporting.

The clickable console (Gage Technologies branding, simulated SBCE calls for testing) lives in [`web/`](web/). The Docker service in this directory is the management plane that talks to real EMS/SBCE hosts.

## v1 Scope

- Dual-auth web UI (Entra ID on :443, local admin on :8443)
- Automatic HTTPS via Caddy + Let's Encrypt
- Customer / Site / Device hierarchy
- Encrypted credential store
- Config snapshots + restore
- Certificate inventory, monitoring, and renewal (upload + CSR workflow)
- Temporary scoped customer upload links for signed certificates
- Reporting Profiles (Email, Slack, Teams Adaptive Cards via MSAL)
- Device lock, dry-run, HA-pair awareness, audit log
- Customer access via outbound tunnel or existing VPN

## Quick Start (development)

1. Edit `Caddyfile` and replace `example.com` with your real domain (required for Let's Encrypt).
2. Point the domain's DNS A/AAAA record at the host running Docker.
3. Run:

```bash
docker compose up --build
```

- Main UI (Entra ID): `https://your-domain` (port 443)
- Local admin: `https://your-domain:8443` (uses Caddy internal TLS by default)

Caddy automatically obtains and renews the Let's Encrypt certificate for the main site.

## Status

Early scaffolding — core models and API skeleton in progress. HTTPS reverse proxy added.
