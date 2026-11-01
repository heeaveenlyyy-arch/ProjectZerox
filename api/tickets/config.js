const { getValidSession } = require("../lib/session");

const DISCORD_API = "https://discord.com/api/v10";

function sendError(res, status, error) {
  return res.status(status).json({ success: false, error });
}

async function verifyAccess(req, res, guildId) {
  const session = await getValidSession(req, res);

  if (!session?.accessToken) {
    throw Object.assign(
      new Error("Sesión no válida. Inicia sesión nuevamente."),
      { status: 401 }
    );
  }

  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });

  if (!response.ok) {
    throw Object.assign(
      new Error("Discord no pudo verificar tu cuenta. Vuelve a iniciar sesión."),
      { status: 401 }
    );
  }

  const guilds = await response.json();
  const guild = guilds.find(item => item.id === guildId);

  if (!guild) {
    throw Object.assign(new Error("No tienes acceso a este servidor"), { status: 403 });
  }

  const permissions = BigInt(guild.permissions || "0");
  const canManage =
    guild.owner ||
    (permissions & 0x8n) === 0x8n ||
    (permissions & 0x20n) === 0x20n;

  if (!canManage) {
    throw Object.assign(
      new Error("No tienes permisos para administrar este servidor"),
      { status: 403 }
    );
  }
}

function getSupabaseSettings() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw Object.assign(
      new Error("Faltan las variables de Supabase en Vercel"),
      { status: 500 }
    );
  }

  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseSettings();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("[Tickets API] Supabase:", response.status, details);
    throw Object.assign(
      new Error("No se pudo acceder a la configuración de tickets"),
      { status: 502 }
    );
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
  if (!["GET", "PUT"].includes(req.method)) {
    res.setHeader("Allow", ["GET", "PUT"]);
    return sendError(res, 405, "Método no permitido");
  }

  const guildId = req.method === "GET" ? req.query.guildId : req.body?.guildId;

  if (!guildId || !/^\d{17,20}$/.test(guildId)) {
    return sendError(res, 400, "ID de servidor inválido");
  }

  try {
    await verifyAccess(req, res, guildId);

    if (req.method === "GET") {
      const rows = await supabaseRequest(
        `ticket_configs?guild_id=eq.${encodeURIComponent(guildId)}&select=config`
      );

      return res.status(200).json({
        success: true,
        config: rows?.[0]?.config ?? null
      });
    }

    const config = req.body?.config;

    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return sendError(res, 400, "Configuración inválida");
    }

    if (Buffer.byteLength(JSON.stringify(config), "utf8") > 20000) {
      return sendError(res, 413, "La configuración es demasiado grande");
    }

    const rows = await supabaseRequest("ticket_configs?on_conflict=guild_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        guild_id: guildId,
        config
      })
    });

    return res.status(200).json({
      success: true,
      config: rows?.[0]?.config ?? config
    });
  } catch (error) {
    console.error("[Tickets API] Error:", error);
    return sendError(
      res,
      error.status || 500,
      error.status ? error.message : "Error interno al guardar tickets"
    );
  }
};
