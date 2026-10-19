# Avaya SBCE Manager

Console for Avaya Session Border Controller for Enterprise 10.2. The site you sign in to is [`web/`](web/). Caddy terminates TLS in front of it.

Replace `sbce.example.com` and `10.40.8.10` below with the console's public name and the address of this host on the management network.

## Install Docker

Rocky, RHEL, or Alma:

```bash
sudo dnf -y install wget tar
wget -qO /tmp/get-docker.sh https://get.docker.com
sudo sh /tmp/get-docker.sh
sudo systemctl enable --now docker
docker version
docker compose version
```

Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get -y install wget tar ca-certificates
wget -qO /tmp/get-docker.sh https://get.docker.com
sudo sh /tmp/get-docker.sh
sudo systemctl enable --now docker
docker version
docker compose version
```

## Fetch the app

```bash
cd /opt
sudo wget -O avaya-sbce-manager.tar.gz https://github.com/bmiles-git/avaya-sbce-manager/archive/refs/heads/main.tar.gz
sudo tar -xzf avaya-sbce-manager.tar.gz
sudo mv avaya-sbce-manager-main avaya-sbce-manager
cd /opt/avaya-sbce-manager
sudo sed -i 's/example.com/sbce.example.com/' Caddyfile
```

Point a DNS A or AAAA record for `sbce.example.com` at this host before the next step. Let's Encrypt will not issue a certificate without it.

## Docker

```bash
cd /opt/avaya-sbce-manager
sudo docker compose build
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs -f caddy
```

Leave the log with Ctrl-C. The containers keep running.

```bash
sudo docker compose restart
sudo docker compose pull
sudo docker compose up -d --build
sudo docker compose down
```

`down` stops the site. It does not delete the Caddy certificate volume. `sudo docker compose down -v` does, and the next start asks Let's Encrypt again.

Check the public listener:

```bash
wget -S -O /dev/null https://sbce.example.com
wget -S -O /dev/null https://sbce.example.com:8443
```

- `https://sbce.example.com` is the public console (port 443).
- `https://sbce.example.com:8443` is the local-account listener.

Caddy obtains and renews the certificate on port 443. Port 8443 uses Caddy's internal certificate so it can stay off the public internet. The browser will warn on 8443 until you trust that certificate or replace `tls internal` in the Caddyfile.

Do not publish port 8080 or 8000. `docker compose ps` should show them as exposed, not as `0.0.0.0:8080`.

## Firewall on this host

Docker publishes 80, 443, and 8443 in its own iptables chain. A firewall rule does not close a port that Docker has published on `0.0.0.0`. Bind 8443 to the management address first.

In `docker-compose.yml`, change the 8443 mapping to:

```yaml
- "10.40.8.10:8443:8443"
```

Then recreate:

```bash
cd /opt/avaya-sbce-manager
sudo docker compose up -d
```

firewalld (Rocky, RHEL, Alma):

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.40.0.0/16" port port="8443" protocol="tcp" accept'
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

Change `10.40.0.0/16` to the Gage management network. Do not add 8443 as a public service.

ufw (Ubuntu):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from 10.40.0.0/16 to any port 8443 proto tcp
sudo ufw deny 8080/tcp
sudo ufw deny 8000/tcp
sudo ufw enable
sudo ufw status verbose
```

If 8443 is still reachable from the internet after this, Docker published it on every interface. The compose bind above is what closes it.

Outbound from this host, allow:

- tcp/443 to each EMS or SBCE management address
- tcp/443 to Let's Encrypt and, if you use one, the DNS provider
- udp/tcp 53 to your resolvers

No other inbound port is required.

## Firewall on the SBCE

On the 10.2 management interface, allow this host to tcp/443 and leave the default drop in place. Do not open tcp/222 for this console. Do not write certificates through a data interface.

An HA pair is one configuration. This host still needs tcp/443 to both management addresses, because the active is installed first and the standby after the health check.

If a management address is private, use the customer VPN or SAL. The customer does not need that path to return a certificate. The upload link is on port 443 of this console.

For a managed trunk, publish:

`_acme-challenge.<fqdn>` CNAME `<certificate id>.acme.gagetech.net`

Do not put an HTTP challenge on the SBCE.

## First account

Sign in on port 8443 as `admin`. The starting password is `harbor-admin`. Open **Users** and set a new password before anyone else uses the host.

The sample user `harbor` / `lookout` can see only Harbor Health. Remove that account before go-live. **Reset demo** restores both sample passwords and the sample customers.

An administrator with no customers selected can see every customer. An operator must be assigned at least one. Entra ID on port 443 is still a full administrator. Local accounts are the ones you scope to a customer.

Accounts are kept in the console data on this build. The password is stored as a SHA-256 of the username and the password, not as plain text. This is not yet a shared server directory.
