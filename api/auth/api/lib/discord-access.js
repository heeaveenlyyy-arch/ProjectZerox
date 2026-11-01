const { getValidSession } = require("./session");

const DISCORD_API = "https://discord.com/api/v10";
const CACHE_TTL = 30_000;

const guildCache = new Map();

async function verifyGuildAccess(req, res, guildId) {
    const session = await getValidSession(req, res);

    if (!session?.accessToken) {
        throw Object.assign(
            new Error("Sesión no válida. Inicia sesión nuevamente."),
            { status: 401 }
        );
    }

    const token = session.accessToken;
    let cached = guildCache.get(token);

    if (!cached || cached.expiresAt <= Date.now()) {
        const response = await fetch(
            `${DISCORD_API}/users/@me/guilds`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            const details = await response.text();

            console.error("[Discord Guilds Error]", {
                status: response.status,
                response: details
            });

            throw Object.assign(
                new Error(
                    response.status === 429
                        ? "Discord está limitando las solicitudes. Espera unos segundos."
                        : "No se pudieron consultar tus servidores de Discord."
                ),
                {
                    status: response.status === 429 ? 429 : 502,
                    discordStatus: response.status
                }
            );
        }

        const guilds = await response.json();

        cached = {
            guilds,
            expiresAt: Date.now() + CACHE_TTL
        };

        guildCache.set(token, cached);
    }

    const guild = cached.guilds.find(
        item => item.id === guildId
    );

    if (!guild) {
        throw Object.assign(
            new Error("No tienes acceso a este servidor."),
            { status: 403 }
        );
    }

    const permissions = BigInt(guild.permissions || "0");

    const canManage =
        guild.owner ||
        (permissions & 0x8n) === 0x8n ||
        (permissions & 0x20n) === 0x20n;

    if (!canManage) {
        throw Object.assign(
            new Error("No tienes permisos para administrar este servidor."),
            { status: 403 }
        );
    }

    return session;
}

module.exports = { verifyGuildAccess };
