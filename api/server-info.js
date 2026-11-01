
const { unseal, getCookie } = require("./lib/session");

const BOT_ID = "1534310875962540212";
const DISCORD_API = "https://discord.com/api/v10";

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const id = req.query.id;

    if (!id || !/^\d{17,20}$/.test(id)) {
      return res.status(400).json({ error: "ID de servidor inválido" });
    }

    const sessionCookie = getCookie(req, "zerox_session");

    if (!sessionCookie) {
      return res.status(401).json({ error: "Inicia sesión primero" });
    }

    const session = unseal(sessionCookie);

    if (!session || !session.accessToken) {
      return res.status(401).json({ error: "Sesión no válida" });
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({
        error: "Falta configurar DISCORD_BOT_TOKEN en Vercel"
      });
    }

    // Comprobar que el usuario puede administrar este servidor.
    const userGuildsResponse = await fetch(
      `${DISCORD_API}/users/@me/guilds`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`
        }
      }
    );

    if (!userGuildsResponse.ok) {
      return res.status(401).json({
        error: "No se pudo verificar tu cuenta de Discord"
      });
    }

    const userGuilds = await userGuildsResponse.json();
    const userGuild = userGuilds.find(guild => guild.id === id);

    if (!userGuild) {
      return res.status(403).json({
        error: "No tienes acceso a este servidor"
      });
    }

    const permissions = BigInt(userGuild.permissions || "0");
    const canManage =
      userGuild.owner ||
      (permissions & 0x8n) === 0x8n ||
      (permissions & 0x20n) === 0x20n;

    if (!canManage) {
      return res.status(403).json({
        error: "No tienes permisos para administrar este servidor"
      });
    }

    // Obtener información del servidor con el bot.
    const guildResponse = await fetch(
      `${DISCORD_API}/guilds/${id}?with_counts=true`,
      {
        headers: {
          Authorization: `Bot ${botToken}`
        }
      }
    );

    if (!guildResponse.ok) {
      return res.status(guildResponse.status).json({
        error: "El bot no puede acceder a este servidor. Comprueba que esté dentro."
      });
    }

    const guild = await guildResponse.json();

    // Obtener los canales del servidor.
    const channelsResponse = await fetch(
      `${DISCORD_API}/guilds/${id}/channels`,
      {
        headers: {
          Authorization: `Bot ${botToken}`
        }
      }
    );

    if (!channelsResponse.ok) {
      return res.status(channelsResponse.status).json({
        error: "No se pudieron obtener los canales del servidor"
      });
    }

    const channels = await channelsResponse.json();

    return res.status(200).json({
      success: true,
      server: {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        memberCount: guild.approximate_member_count ?? null,
        channelCount: channels.length,
        roleCount: Array.isArray(guild.roles) ? guild.roles.length : null
      }
    });

  } catch (error) {
    console.error("Error en /api/server-info:", error);

    return res.status(500).json({
      error: "Error interno al obtener la información del servidor"
    });
  }
};
