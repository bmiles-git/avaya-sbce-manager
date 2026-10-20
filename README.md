# Avaya SBCE Manager

Console for Avaya Session Border Controller for Enterprise 10.2. Caddy serves [`web/`](web/) on port 443 and on port 8443.

Do the steps in order. Starting Docker before DNS and the firewall is the usual reason the first certificate request fails.

What you need before step 1:

- A public name, such as `sbce.example.com`
- The address of this host. Both listeners use it. There is no separate management network.

This brings up the console. It does not log in to an SBCE, open a SAL session, or renew a trunk certificate. Customers, devices, and passwords are stored in the browser that signs in. Two people do not share that data. **Continue with Entra ID** is not a real Entra login yet. Do not put the name on the public internet until that button is a real login, unless you accept that anyone who can open the site can see the rehearsal.

## 1. Install Docker and git

Rocky, RHEL, or Alma:

```bash
sudo dnf -y install git dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin firewalld
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Ubuntu:

```bash
sudo apt-get update
sudo apt-get -y install git ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

On Debian, change `ubuntu` in that repository line to `debian`.

## 2. Clone

Clone as your user, not as root. A root-owned checkout makes the next `git pull` fail.

```bash
sudo mkdir -p /opt/avaya-sbce-manager
sudo chown "$USER:$USER" /opt/avaya-sbce-manager
git clone https://github.com/bmiles-git/avaya-sbce-manager.git /opt/avaya-sbce-manager
cd /opt/avaya-sbce-manager
git checkout main
```

## 3. Set the public name

```bash
cd /opt/avaya-sbce-manager
cp .env.example .env
```

Edit `.env`:

```bash
SITE_ADDRESS=avaya-sbc.aws.gagetech.com
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_REDIRECT_URI=https://avaya-sbc.aws.gagetech.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=sbce@example.com
```

`Continue with Entra ID` redirects to Microsoft and asks for the Gage account. Access is granted when that account is `@gagetech.com`. Any other account is refused. In Entra, register an app:

1. App registrations, new registration. Supported account types: this directory only.
2. Redirect URI platform: Single-page application. URI: `https://avaya-sbc.aws.gagetech.com` with no path and no port.
3. Copy the Application (client) ID into `ENTRA_CLIENT_ID` and the Directory (tenant) ID into `ENTRA_TENANT_ID`.
4. Under Authentication, leave implicit grant off. The browser uses the authorization code with PKCE.
5. Assign the Gage employees who should open the console, or leave assignment open if every person in the Gage tenant should be able to try. The console still refuses an account that is not `@gagetech.com`.

A Gage employee who signs in is an administrator of this console. After changing `.env`, run `sudo docker compose up -d` so the container sees the tenant and client ID. Sign out of any session that was created before this change.

`SITE_ADDRESS` is the name of this host. Port 443 and port 8443 both listen on every address the host has. `.env` is not committed. Do not edit `Caddyfile` to put the name in it. The next pull would conflict.

Mail is sent only from port 8443. Without `SMTP_HOST` and `SMTP_FROM`, **Send test email** and **Send reminder** stop and show that SMTP is not configured. They do not pretend the message was sent. After changing `.env`, run `sudo docker compose up -d` again so the container sees the new values.

## 4. Publish DNS

Create an A or AAAA record for `sbce.example.com` that points at this host's public address. Wait until it answers:

```bash
getent hosts sbce.example.com
```

Let's Encrypt will not issue a certificate until that name reaches this host from the internet.

## 5. Open the firewall, then start Docker again

Docker publishes 80, 443, and 8443 on the host. Apply the firewall before the first start so those are the only inbound ports.

firewalld:

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=8443/tcp
sudo firewall-cmd --reload
sudo systemctl restart docker
sudo firewall-cmd --list-all
```

ufw:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8443/tcp
sudo ufw deny 8080/tcp
sudo ufw deny 8000/tcp
sudo ufw enable
sudo ufw status verbose
sudo systemctl restart docker
```

Outbound, this host also needs tcp/443 to each EMS or SBCE management address, tcp/443 to Let's Encrypt, and DNS to your resolvers. No other inbound port is required.

## 6. Build and start

```bash
cd /opt/avaya-sbce-manager
sudo docker compose build
sudo docker compose up -d
sudo docker compose ps
```

`ps` should show `caddy` and `web`. It should not show `app`. The Python service is not part of this start. Ports 8080 and 8000 should not be listed as `0.0.0.0`.

Watch Caddy until it obtains a certificate. Ctrl-C leaves the containers running.

```bash
sudo docker compose logs -f caddy
```

You want a line that the certificate was obtained for `sbce.example.com`. If it says the name did not resolve or port 80 timed out, fix DNS or the firewall, then:

```bash
sudo docker compose restart caddy
```

## 7. Check both listeners

From this host:

```bash
curl -fsSI https://sbce.example.com
curl -fsSI https://sbce.example.com:8443
```

Both use the Let's Encrypt certificate for `SITE_ADDRESS`. Port 8443 is the same host, not a second network. Device access tests call `/api/probe` on port 8443 only. That request is not served on port 443.

## 8. First sign-in

Open `https://sbce.example.com:8443`. Sign in as `admin` / `harbor-admin`. Open **Users**, set a new admin password, and remove the user `harbor`. **Reset demo** puts both sample passwords back.

An administrator with no customers selected sees every customer. An operator must be assigned at least one.

## 9. Update later

```bash
cd /opt/avaya-sbce-manager
git pull --ff-only
sudo docker compose up -d --build
```

`sudo docker compose down` stops the site and keeps the certificate. `sudo docker compose down -v` deletes the certificate, and the next start asks Let's Encrypt again.

## SBCE firewall

On the 10.2 management interface, allow this host to tcp/443 and leave the default drop. Do not open tcp/222 for this console.

An HA pair is one configuration. This host still needs tcp/443 to both management addresses. The active is written first, then the standby after the health check.

If the management address is private, use the customer VPN or SAL. The customer does not need that path to return a certificate. The upload link is on port 443 of this console.

For a managed trunk, publish `_acme-challenge.<fqdn>` as a CNAME to `<certificate id>.acme.gagetech.net`. Do not put an HTTP challenge on the SBCE.
