#!/usr/bin/env python3
"""GG VPN server sync. Runs every minute (systemd timer):
1. downloads the devices GG has authorized for this server and applies them to WireGuard,
2. rebuilds the Meshnet firewall chain (only devices of the same user with Meshnet on can talk),
3. reports how many devices are connected, so GG can show load and pick the best server.
Configuration comes from /etc/gg-vpn/sync.env (see README.md)."""
import json, os, subprocess, sys, time, urllib.request, urllib.parse

SITE = os.environ["GG_SITE_URL"].rstrip("/")
TOKEN = os.environ["GG_VPN_SYNC_TOKEN"]
SERVER = os.environ["GG_SERVER_ID"]
IFACE = os.environ.get("WG_IFACE", "wg0")
CHAIN = "GG-MESH"


def api(method, body=None):
    url = f"{SITE}/gg-vpn/sync?server={urllib.parse.quote(SERVER)}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "gg-vpn-sync"})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.load(res)


def run(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True).stdout


def apply_peers(peers):
    wanted = {p["publicKey"]: p["address"] for p in peers}
    current = {}
    for line in run("wg", "show", IFACE, "allowed-ips").splitlines():
        key, _, ips = line.partition("\t")
        current[key] = ips.strip()
    for key in current:
        if key not in wanted:
            run("wg", "set", IFACE, "peer", key, "remove")
    for key, address in wanted.items():
        if current.get(key) != f"{address}/32":
            run("wg", "set", IFACE, "peer", key, "allowed-ips", f"{address}/32")


def apply_meshnet(peers):
    groups = {}
    for p in peers:
        if p.get("mesh"):
            groups.setdefault(p["mesh"], []).append(p["address"])
    if subprocess.run(["iptables", "-L", CHAIN, "-n"], capture_output=True).returncode != 0:
        run("iptables", "-N", CHAIN)
    run("iptables", "-F", CHAIN)
    for addresses in groups.values():
        for src in addresses:
            for dst in addresses:
                if src != dst:
                    run("iptables", "-A", CHAIN, "-s", src, "-d", dst, "-j", "ACCEPT")
    run("iptables", "-A", CHAIN, "-j", "DROP")  # everyone else stays isolated


def active_peers(window=180):
    now = time.time()
    count = 0
    for line in run("wg", "show", IFACE, "latest-handshakes").splitlines():
        parts = line.split("\t")
        if len(parts) == 2 and parts[1].isdigit() and now - int(parts[1]) < window:
            count += 1
    return count


def main():
    data = api("GET")
    peers = data.get("peers", [])
    apply_peers(peers)
    apply_meshnet(peers)
    api("POST", {"activePeers": active_peers()})
    print(f"gg-vpn-sync: {len(peers)} devices authorized, Meshnet groups applied")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # keep the timer running; log for journalctl
        print(f"gg-vpn-sync failed: {exc}", file=sys.stderr)
        sys.exit(1)
