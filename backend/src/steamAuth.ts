import { Router } from "express";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { prisma } from "./db.js";
import {
  hashPassword,
  issueToken,
  requireAuth,
  type AuthRequest,
} from "./auth.js";
export const steamAuth = Router();
const states = new Map<string, number>();
const linkTargets = new Map<string, string>();
const linkTickets = new Map<string, { userId: string; expires: number }>();
steamAuth.post("/steam/link-ticket", requireAuth, (req: AuthRequest, res) => {
  for (const [k, v] of linkTickets)
    if (v.expires < Date.now()) linkTickets.delete(k);
  if (linkTickets.size >= 10000)
    return res.status(429).json({ error: "Please retry later." });
  const ticket = randomBytes(32).toString("hex");
  linkTickets.set(ticket, {
    userId: req.user!.id,
    expires: Date.now() + 60000,
  });
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    url: config.PUBLIC_API_ORIGIN + "/api/auth/steam?link_ticket=" + ticket,
  });
});
const tickets = new Map<string, { token: string; expires: number }>();
const endpoint = "https://steamcommunity.com/openid/login";
const callback = config.PUBLIC_API_ORIGIN + "/api/auth/steam/callback";
steamAuth.get("/steam", (req, res) => {
  let linkUser: string | undefined;
  if (req.query.link_ticket) {
    const key = String(req.query.link_ticket),
      t = linkTickets.get(key);
    linkTickets.delete(key);
    if (!t || t.expires < Date.now())
      return res
        .status(400)
        .json({ error: "Link request expired. Retry from your account." });
    linkUser = t.userId;
  }
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of states)
    if (v < Date.now()) {
      states.delete(k);
      linkTargets.delete(k);
    }
  if (states.size >= 10000)
    return res.status(429).json({ error: "Please retry later." });
  const state = randomBytes(32).toString("hex");
  states.set(state, Date.now() + 600000);
  if (linkUser) linkTargets.set(state, linkUser);
  res.cookie("steam_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: callback.startsWith("https:"),
    maxAge: 600000,
    path: "/api/auth/steam",
  });
  const q = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": callback + "?state=" + state,
    "openid.realm": config.PUBLIC_API_ORIGIN,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  res.redirect(endpoint + "?" + q);
});
steamAuth.get("/steam/callback", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const q = new URLSearchParams(req.originalUrl.split("?")[1]);
    const state = q.get("state") ?? "";
    const cookie = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("steam_state="))
      ?.slice(12);
    const expiry = states.get(state);
    states.delete(state);
    const linkUser = linkTargets.get(state);
    linkTargets.delete(state);
    res.clearCookie("steam_state", { path: "/api/auth/steam" });
    if (!expiry || expiry < Date.now() || cookie !== state)
      throw new Error("Invalid login state");
    const identity = q.get("openid.claimed_id") ?? "";
    if (
      q.get("openid.mode") !== "id_res" ||
      q.get("openid.ns") !== "http://specs.openid.net/auth/2.0" ||
      q.get("openid.op_endpoint") !== endpoint ||
      q.get("openid.return_to") !== callback + "?state=" + state ||
      q.get("openid.identity") !== identity ||
      !new RegExp(
        "^https://steamcommunity[.]com/openid/id/7656119[0-9]{10}$",
      ).test(identity)
    )
      throw new Error("Invalid identity");
    const signed = new Set((q.get("openid.signed") ?? "").split(","));
    for (const field of [
      "op_endpoint",
      "claimed_id",
      "identity",
      "return_to",
      "response_nonce",
      "assoc_handle",
    ])
      if (!signed.has(field)) throw new Error("Unsigned identity");
    q.delete("state");
    q.set("openid.mode", "check_authentication");
    const verification = await fetch(endpoint, {
      method: "POST",
      body: q,
      signal: AbortSignal.timeout(12000),
    });
    if (
      !verification.ok ||
      !(await verification.text())
        .split("\n")
        .some((line) => line.trim() === "is_valid:true")
    )
      throw new Error("Verification failed");
    const steamId = identity.split("/").pop()!;
    if (linkUser) {
      await prisma.$transaction(async (db) => {
        if (!(await db.user.findUnique({ where: { id: linkUser } })))
          throw new Error("Account unavailable");
        const old = await db.steamConnection.findUnique({ where: { steamId } });
        const current = await db.steamConnection.findUnique({
          where: { userId: linkUser },
        });
        if (current && current.steamId !== steamId)
          throw new Error("Disconnect the previous Steam account first");
        const synthetic = await db.user.findUnique({
          where: { email: "steam-" + steamId + "@steam.gamevault.invalid" },
          select: { id: true },
        });
        if (
          (old && old.userId !== linkUser) ||
          (synthetic && synthetic.id !== linkUser)
        )
          throw new Error("Steam already belongs to another account");
        await db.steamConnection.upsert({
          where: { userId: linkUser },
          create: { userId: linkUser, steamId },
          update: { steamId, status: "idle", lastSyncedAt: null, processed: 0 },
        });
      });
      return res.redirect(
        config.FRONTEND_ORIGIN + "/social/studio#steam_linked=1",
      );
    }
    const linked = await prisma.steamConnection.findUnique({
      where: { steamId },
      include: { user: true },
    });
    const email = "steam-" + steamId + "@steam.gamevault.invalid";
    const user =
      linked?.user ??
      (await prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash: await hashPassword(randomBytes(48).toString("hex")),
        },
        update: {},
      }));
    await prisma.steamConnection.upsert({
      where: { userId: user.id },
      create: { userId: user.id, steamId },
      update: {},
    });
    for (const [k, v] of tickets) if (v.expires < Date.now()) tickets.delete(k);
    const code = randomBytes(32).toString("hex");
    tickets.set(code, { token: issueToken(user), expires: Date.now() + 60000 });
    res.redirect(config.FRONTEND_ORIGIN + "/#steam_code=" + code);
  } catch {
    res.redirect(config.FRONTEND_ORIGIN + "/#steam_error=1");
  }
});
steamAuth.post("/steam/exchange", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const ticket = tickets.get(code);
  tickets.delete(code);
  if (!ticket || ticket.expires < Date.now())
    return res
      .status(401)
      .json({ error: "Steam login expired. Please retry." });
  return res.json({ data: { token: ticket.token } });
});
