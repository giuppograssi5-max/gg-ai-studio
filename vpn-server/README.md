# GG VPN server

Netlify hosts the GG website and the VPN control panel, but it can't carry VPN traffic. Each GG VPN
location is a small Linux server (any VPS with a public IPv4 address, Ubuntu 24.04 or Debian 12)
running WireGuard. GG authorizes devices; this server applies them every minute.

What the server provides for the features in the VPN section:

| Feature | Where it runs |
| --- | --- |
| Encrypted tunnel, new public IP | WireGuard + NAT on this server |
| Quick connect, server load, online status | `gg-vpn-sync.py` reports connected devices every minute |
| Meshnet | `gg-vpn-sync.py` builds the `GG-MESH` firewall chain: only devices of the same user with Meshnet on can reach each other |
| Threat protection | DNS chosen in the browser (Quad9 / AdGuard DNS), or the server's own resolver for "DNS del server GG" |
| Kill switch, split tunneling, IPv6 leak protection | Written into each device's configuration file by the browser |

## 1. Install WireGuard and a DNS resolver

```bash
sudo apt update && sudo apt install -y wireguard iptables unbound python3
wg genkey | sudo tee /etc/wireguard/server.key | wg pubkey | sudo tee /etc/wireguard/server.pub
sudo chmod 600 /etc/wireguard/server.key
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-gg-vpn.conf && sudo sysctl --system
```

Make unbound answer only VPN clients by creating `/etc/unbound/unbound.conf.d/gg-vpn.conf`:

```
server:
  interface: 10.66.0.1
  access-control: 10.66.0.0/24 allow
```

## 2. Configure the tunnel

Create `/etc/wireguard/wg0.conf`. Replace `eth0` with the server's internet interface (`ip route get 1.1.1.1`).

```ini
[Interface]
Address = 10.66.0.1/24
ListenPort = 51820
PostUp = wg set %i private-key /etc/wireguard/server.key
PostUp = iptables -N GG-MESH 2>/dev/null; iptables -A FORWARD -i %i -o %i -j GG-MESH; iptables -A FORWARD -i %i -o eth0 -j ACCEPT; iptables -A FORWARD -i eth0 -o %i -m state --state RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.66.0.0/24 -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -o %i -j GG-MESH; iptables -D FORWARD -i %i -o eth0 -j ACCEPT; iptables -D FORWARD -i eth0 -o %i -m state --state RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.66.0.0/24 -o eth0 -j MASQUERADE
```

Peers are not listed here: the sync script adds and removes them. Then:

```bash
sudo systemctl enable --now wg-quick@wg0
sudo systemctl restart unbound
```

Open UDP port 51820 in the provider's firewall.

## 3. Register the server in Netlify

Add the server to the `GG_VPN_SERVERS` environment variable of the Netlify project. It is a JSON array,
one object per location:

```json
[{"id":"it-mil","country":"Italia","countryCode":"IT","city":"Milano",
  "endpoint":"203.0.113.10:51820","publicKey":"<contents of /etc/wireguard/server.pub>",
  "subnet":"10.66.0.0/24","dns":["10.66.0.1"],"exitIp":"203.0.113.10",
  "capacity":100,"features":["p2p"]}]
```

- `id`: lowercase letters, digits and `-`. Must match `GG_SERVER_ID` on the server.
- `endpoint`: public IP or hostname and port.
- `exitIp`: the public IP websites see. Used to show "Protetto" and to avoid routing loops with split tunneling. Defaults to the endpoint when it is an IP.
- `subnet`: a private range from /16 to /29. Use a different one on each server.
- `capacity`: devices at which the server counts as 100% loaded (default 100).
- `features`: optional labels shown as filters: `p2p`, `double`, `obfuscated`, `dedicated`, `streaming`. Only add a label if the server is actually set up for it.

Also set `GG_VPN_SYNC_TOKEN` to a long random secret (at least 24 characters, for example `openssl rand -hex 32`).

## 4. Install the sync script

```bash
sudo mkdir -p /etc/gg-vpn /opt/gg-vpn
sudo cp gg-vpn-sync.py /opt/gg-vpn/ && sudo chmod 755 /opt/gg-vpn/gg-vpn-sync.py
sudo tee /etc/gg-vpn/sync.env >/dev/null <<'ENV'
GG_SITE_URL=https://gg-ai-studio.netlify.app
GG_SERVER_ID=it-mil
GG_VPN_SYNC_TOKEN=<same secret as in Netlify>
WG_IFACE=wg0
ENV
sudo chmod 600 /etc/gg-vpn/sync.env
sudo cp gg-vpn-sync.service gg-vpn-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now gg-vpn-sync.timer
journalctl -u gg-vpn-sync -n 20
```

## 5. Give users access

In the Netlify dashboard, open Identity, select the user and add the role `vpn` (or `admin`).
