import { getUser } from "@netlify/identity";
import { and, eq } from "drizzle-orm";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { db } from "../../db/index.js";
import { vpnDevices, vpnServerStatus } from "../../db/schema.js";
import {
  MAX_DEVICES, parseServers, validPublicKey, nextAddress, hasVpnAccess, meshGroup,
  withStatus, recommend, protectedBy, publicServer, DEMO_SERVERS,
} from "../../lib/vpn-lib.mjs";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
const ID = /^[A-Za-z0-9-]{8,64}$/;
const cleanName = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "Dispositivo").replace(/[\r\n\t]+/g, " ").slice(0, 40);
const digest = (s: string) => createHash("sha256").update(s).digest();
const tokenOk = (req: Request) => {
  const expected = process.env.GG_VPN_SYNC_TOKEN || "";
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return expected.length >= 24 && timingSafeEqual(digest(given), digest(expected));
};

// Called every minute by each GG VPN server: GET returns its authorized peers, POST reports its status.
async function sync(req: Request, url: URL, servers: ReturnType<typeof parseServers>) {
  if (!tokenOk(req)) return reply({ error: "Unauthorized" }, 401);
  const server = servers.find(s => s.id === url.searchParams.get("server"));
  if (!server) return reply({ error: "Unknown server" }, 404);
  if (req.method === "GET") {
    const rows = await db.select().from(vpnDevices).where(eq(vpnDevices.serverId, server.id));
    return reply({
      server: server.id,
      subnet: server.subnet,
      peers: rows.map(d => ({ publicKey: d.publicKey, address: d.address, mesh: d.meshnet ? meshGroup(d.userId) : null })),
    });
  }
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    const activePeers = Number(body?.activePeers);
    if (!Number.isInteger(activePeers) || activePeers < 0 || activePeers > 100000) return reply({ error: "Invalid report" }, 400);
    await db.insert(vpnServerStatus).values({ serverId: server.id, activePeers })
      .onConflictDoUpdate({ target: vpnServerStatus.serverId, set: { activePeers, reportedAt: new Date() } });
    return reply({ ok: true });
  }
  return reply({ error: "Method not allowed" }, 405);
}

export default async (req: Request, context: { ip?: string; geo?: { country?: { code?: string } } } = {}) => {
  const url = new URL(req.url);
  const servers = parseServers(process.env.GG_VPN_SERVERS);
  try {
    if (url.pathname.endsWith("/sync")) return await sync(req, url, servers);
    if (req.headers.get("origin") && req.headers.get("origin") !== url.origin) return reply({ error: "Invalid origin" }, 403);
    const user = await getUser();
    if (!user) return reply({ error: "Accedi con il tuo account GG per usare la VPN." }, 401);
    if (!hasVpnAccess(user)) return reply({ error: "Il tuo account non ha ancora l’accesso alla VPN GG. Chiedi all’amministratore di abilitarlo." }, 403);
    const id = url.searchParams.get("id");
    if (id !== null && !ID.test(id)) return reply({ error: "Dispositivo non valido." }, 400);
    const mine = (deviceId: string) => and(eq(vpnDevices.id, deviceId), eq(vpnDevices.userId, user.id));

    // Demo mode: no real servers configured yet.
    if (!servers.length) {
      if (req.method === "GET") return reply({ demo: true, servers: DEMO_SERVERS, devices: [], maxDevices: MAX_DEVICES, recommendedId: recommend(DEMO_SERVERS, context.geo?.country?.code), protectedBy: null });
      return reply({ error: "Modalità dimostrativa: i server GG non sono ancora configurati, quindi non è possibile collegarsi." }, 503);
    }

    if (req.method === "GET") {
      const [devices, statuses] = await Promise.all([
        db.select().from(vpnDevices).where(eq(vpnDevices.userId, user.id)),
        db.select().from(vpnServerStatus),
      ]);
      const list = withStatus(servers, statuses);
      return reply({
        servers: list.map(publicServer),
        devices: devices.map(({ userId, publicKey, ...d }) => d),
        maxDevices: MAX_DEVICES,
        recommendedId: recommend(list, context.geo?.country?.code),
        protectedBy: protectedBy(servers, context.ip || req.headers.get("x-nf-client-connection-ip") || ""),
      });
    }

    const body = req.method === "DELETE" ? {} : await req.json().catch(() => null);
    if (!body || typeof body !== "object") return reply({ error: "Richiesta non valida." }, 400);

    if (req.method === "POST") {
      const server = servers.find(s => s.id === body.serverId);
      if (!server) return reply({ error: "Server GG non disponibile." }, 400);
      if (!validPublicKey(body.publicKey)) return reply({ error: "Chiave pubblica WireGuard non valida." }, 400);
      const owned = await db.select({ id: vpnDevices.id }).from(vpnDevices).where(eq(vpnDevices.userId, user.id));
      if (owned.length >= MAX_DEVICES) return reply({ error: `Hai raggiunto il limite di ${MAX_DEVICES} dispositivi: rimuovine uno.` }, 409);
      // Retry on the rare race where two devices pick the same address at once.
      for (let attempt = 0; attempt < 3; attempt++) {
        const used = await db.select({ address: vpnDevices.address }).from(vpnDevices).where(eq(vpnDevices.serverId, server.id));
        const address = nextAddress(server.subnet, used.map(u => u.address));
        if (!address) return reply({ error: "Il server GG è pieno. Scegli un altro server." }, 409);
        const device = { id: randomUUID(), userId: user.id, serverId: server.id, name: cleanName(body.name), publicKey: body.publicKey, address, meshnet: body.meshnet === true };
        try {
          await db.insert(vpnDevices).values(device);
          return reply({ id: device.id, name: device.name, address, meshnet: device.meshnet, server: publicServer(server) }, 201);
        } catch (err) {
          const dup = await db.select({ id: vpnDevices.id }).from(vpnDevices).where(eq(vpnDevices.publicKey, body.publicKey));
          if (dup.length) return reply({ error: "Questa chiave è già registrata." }, 409);
          if (attempt === 2) throw err;
        }
      }
    }

    if (!id) return reply({ error: "Dispositivo mancante." }, 400);
    if (req.method === "PATCH") {
      const set: { meshnet?: boolean; name?: string } = {};
      if (typeof body.meshnet === "boolean") set.meshnet = body.meshnet;
      if (typeof body.name === "string") set.name = cleanName(body.name);
      if (!Object.keys(set).length) return reply({ error: "Nessuna modifica." }, 400);
      const updated = await db.update(vpnDevices).set(set).where(mine(id)).returning({ id: vpnDevices.id, name: vpnDevices.name, meshnet: vpnDevices.meshnet });
      return updated.length ? reply(updated[0]) : reply({ error: "Dispositivo non trovato." }, 404);
    }
    if (req.method === "DELETE") {
      await db.delete(vpnDevices).where(mine(id));
      return reply({ ok: true });
    }
    return reply({ error: "Method not allowed" }, 405);
  } catch {
    return reply({ error: "La VPN GG non è disponibile in questo momento. Riprova." }, 503);
  }
};

export const config = { path: ["/gg-vpn", "/gg-vpn/sync"] };
