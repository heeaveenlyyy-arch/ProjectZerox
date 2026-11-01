const { getValidSession } = require("./lib/session");

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

    const session = await getValidSession(req, res);

    if (!session?.accessToken) {
      return res.status(401).json({ error: "Sesión no válida. Inicia sesión nuevamente." });
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({
        error: "Falta configurar DISCORD_BOT_TOKEN en Vercel"
      });
    }

    const userGuildsResponse = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`
      }
    });

    if (!userGuildsResponse.ok) {
      return res.status(401).json({
        error: "Discord no pudo verificar tu cuenta. Vuelve a iniciar sesión."
      });
    }

    const userGuilds = await userGuildsResponse.json();
    const userGuild = userGuilds.find(guild => guild.id === id);

    if (!userGuild) {
      return res.status(403).json({ error: "No tienes acceso a este servidor" });
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

    const headers = { Authorization: `Bot ${botToken}` };

    const [guildResponse, channelsResponse, rolesResponse, emojisResponse] =
      await Promise.all([
        fetch(`${DISCORD_API}/guilds/${id}?with_counts=true`, { headers }),
        fetch(`${DISCORD_API}/guilds/${id}/channels`, { headers }),
        fetch(`${DISCORD_API}/guilds/${id}/roles`, { headers }),
        fetch(`${DISCORD_API}/guilds/${id}/emojis`, { headers })
      ]);

    if (!guildResponse.ok) {
      return res.status(guildResponse.status).json({
        error: "El bot no puede acceder a este servidor. Comprueba que esté dentro."
      });
    }

    if (!channelsResponse.ok || !rolesResponse.ok || !emojisResponse.ok) {
      return res.status(502).json({
        error: "No se pudieron obtener los canales, roles o emojis del servidor"
      });
    }

    const [guild, channels, roles, emojis] = await Promise.all([
      guildResponse.json(),
      channelsResponse.json(),
      rolesResponse.json(),
      emojisResponse.json()
    ]);

    return res.status(200).json({
      success: true,
      server: {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        memberCount: guild.approximate_member_count ?? null,
        channelCount: channels.length,
        roleCount: roles.length
      },
      channels: channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parent_id ?? null
      })),
      roles: roles.map(role => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        managed: role.managed
      })),
      emojis: emojis.map(emoji => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated
      }))
    });
  } catch (error) {
    console.error("Error en /api/server-info:", error);
    return res.status(500).json({
      error: "Error interno al obtener la información del servidor"
    });
  }
};
