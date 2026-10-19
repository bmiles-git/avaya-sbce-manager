# Avaya SBCE Manager

Console for Avaya Session Border Controller for Enterprise 10.2. The site you sign in to is [`web/`](web/). Caddy terminates TLS in front of it.

## Install

1. Point a DNS A or AAAA record at the host. Let's Encrypt will not issue a certificate without it.
2. In `Caddyfile`, replace `example.com` with that name.
3. From this directory:

```bash
docker compose up --build
```

- `https://your-domain` is the public console (port 443).
- `https://your-domain:8443` is the local-account listener.

Caddy obtains and renews the certificate on port 443. Port 8443 uses Caddy's internal certificate so it can stay off the public internet.

To build the console by itself, without Docker:

```bash
cd web
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 8080
```

Put your own TLS proxy in front of port 8080. Do not publish 8080.

## First account

Sign in on port 8443 as `admin`. The starting password is `harbor-admin`. Open **Users** and set a new password before anyone else uses the host.

The sample user `harbor` / `lookout` can see only Harbor Health. Remove that account before go-live. **Reset demo** restores both sample passwords and the sample customers.

An administrator with no customers selected can see every customer. An operator must be assigned at least one. Entra ID on port 443 is still a full administrator. Local accounts are the ones you scope to a customer.

Accounts are kept in the console data on this build. The password is stored as a SHA-256 of the username and the password, not as plain text. This is not yet a shared server directory.

## Firewall

On the host that runs Docker:

| Port | Who can connect | Why |
|---|---|---|
| tcp/80 | Internet | Let's Encrypt HTTP-01 for this console's own certificate. Not used for SBCE names. |
| tcp/443 | Internet | Entra ID sign-in and the customer certificate upload link. |
| tcp/8443 | Gage management network or VPN only | Local accounts. Bind it to a management address instead of `0.0.0.0` when you can. |
| tcp/8080, tcp/8000 | Nobody outside Docker | Application ports. Caddy is the only client. |

Outbound from this host:

- tcp/443 to each EMS or SBCE management address. That is the Configuration API.
- tcp/443 to the Let's Encrypt API, and to your DNS provider if a managed certificate does not use a CNAME.
- DNS (udp/tcp 53) to your resolvers.

On the SBCE, the 10.2 management interface already accepts tcp/443 and drops everything else. Add this host as an allowed management source. The console does not use SSH (tcp/222) and it does not write certificates through a data interface.

An HA pair is one configuration. The console still has to reach the management address of both nodes, because the active is installed first and the standby is installed after the health check. The certificate on the two nodes is the same.

If a management address is not reachable from this host, use the customer's existing VPN or the outbound tunnel on that device. The customer does not need that VPN to open the upload link. The link is on port 443.

For a managed trunk, publish:

`_acme-challenge.<fqdn>` CNAME `<certificate id>.acme.gagetech.net`

The console answers that name. Do not put an HTTP challenge on the SBCE.
