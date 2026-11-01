const { unseal, getCookie } = require("./lib/session");

const BOT_ID = "1534310875962540212";

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  const sessionCookie = getCookie(req, "zerox_session");

  if (!sessionCookie) {
    return res.status(401).json({ error: "No has iniciado sesión" });
  }

  const session = unseal(sessionCookie);

  if (!session || !session.accessToken) {
    return res.status(401).json({ error: "Sesión inválida" });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    return res.status(500).json({
      error: "Falta configurar DISCORD_BOT_TOKEN en Vercel"
    });
  }

  try {
    const response = await fetch(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "No se pudieron obtener tus servidores"
      });
    }

    const manageableGuilds = data.filter(guild => {
      const permissions = BigInt(guild.permissions);

      return guild.owner ||
        (permissions & 0x8n) !== 0n ||
        (permissions & 0x20n) !== 0n;
    });

    const guilds = await Promise.all(
      manageableGuilds.map(async guild => {
        let botInstalled = false;

        try {
          const memberResponse = await fetch(
            `https://discord.com/api/v10/guilds/${guild.id}/members/${BOT_ID}`,
            {
              headers: {
                Authorization: `Bot ${botToken}`
              }
            }
          );

          botInstalled = memberResponse.ok;
        } catch (error) {
          console.error("Bot presence error:", error);
        }

        return {
          id: guild.id,
          name: guild.name,
          icon: guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
            : null,
          owner: guild.owner,
          botInstalled
        };
      })
    );

    return res.status(200).json({ guilds });

  } catch (error) {
    console.error("Guilds error:", error);

    return res.status(500).json({
      error: "Error al consultar los servidores"
    });
  }
};
