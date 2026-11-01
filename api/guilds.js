
const { unseal, getCookie } = require("./lib/session");

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

    const guilds = data
      .filter(guild => {
        const permissions = BigInt(guild.permissions);

        return guild.owner ||
          (permissions & 0x8n) !== 0n ||
          (permissions & 0x20n) !== 0n;
      })
      .map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon
          ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
          : null,
        owner: guild.owner
      }));

    return res.status(200).json({ guilds });

  } catch (error) {
    console.error("Guilds error:", error);

    return res.status(500).json({
      error: "Error al consultar los servidores"
    });
  }
};

