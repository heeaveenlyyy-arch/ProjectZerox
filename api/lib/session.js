const crypto = require("crypto");

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 días
const REFRESH_WINDOW_MS = 60 * 1000; // renovar 1 minuto antes de expirar

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Falta SESSION_SECRET en las variables de Vercel");
  return crypto.createHash("sha256").update(secret).digest();
}

function seal(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function unseal(value) {
  try {
    const buffer = Buffer.from(value, "base64url");
    if (buffer.length < 29) return null;
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function cookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || "/"}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

/**
 * Recupera la sesión y renueva el access token cuando está por caducar.
 * La cookie dura 30 días; Discord sigue controlando la validez del refresh token.
 */
async function getValidSession(req, res) {
  const rawCookie = getCookie(req, "zerox_session");
  if (!rawCookie) return null;

  const session = unseal(rawCookie);
  if (!session?.user || !session?.accessToken) return null;

  const expiresAt = Number(session.expiresAt || 0);
  if (expiresAt > Date.now() + REFRESH_WINDOW_MS) return session;

  if (!session.refreshToken) {
    res.setHeader("Set-Cookie", cookie("zerox_session", "", {
      path: "/",
      maxAge: 0
    }));
    return null;
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Faltan DISCORD_CLIENT_ID o DISCORD_CLIENT_SECRET en Vercel");
  }

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken
    })
  });

  const tokens = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
    console.error("[Auth] Discord rechazó la renovación del token:", tokenResponse.status);
    res.setHeader("Set-Cookie", cookie("zerox_session", "", {
      path: "/",
      maxAge: 0
    }));
    return null;
  }

  const renewedSession = {
    ...session,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000
  };

  res.setHeader("Set-Cookie", cookie("zerox_session", seal(renewedSession), {
    path: "/",
    maxAge: SESSION_MAX_AGE
  }));

  return renewedSession;
}

module.exports = {
  seal,
  unseal,
  getCookie,
  cookie,
  getValidSession,
  SESSION_MAX_AGE
};
