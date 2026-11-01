
const { getValidSession } = require("../lib/session");

const DISCORD_API = "https://discord.com/api/v10";

function sendError(res, status, error) {
    return res.status(status).json({
        success: false,
        error
    });
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        return sendError(res, 405, "Método no permitido");
    }

    try {
        const session = await getValidSession(req, res);

        if (!session?.accessToken) {
            return sendError(res, 401, "Sesión no válida");
        }

        const { guildId, channelId } = req.body || {};

        if (
            typeof guildId !== "string" ||
            typeof channelId !== "string" ||
            !/^\d{17,20}$/.test(guildId) ||
            !/^\d{17,20}$/.test(channelId)
        ) {
            return sendError(res, 400, "Servidor o canal no válido");
        }

        // Verificar acceso del usuario al servidor
        const discordResponse = await fetch(
            `${DISCORD_API}/users/@me/guilds`,
            {
                headers: {
                    Authorization: `Bearer ${session.accessToken}`
                }
            }
        );

        if (!discordResponse.ok) {
            return sendError(
                res,
                502,
                "No se pudo verificar tu acceso a Discord"
            );
        }

        const guilds = await discordResponse.json();
        const guild = guilds.find(item => item.id === guildId);

        if (!guild) {
            return sendError(res, 403, "No tienes acceso a este servidor");
        }

        const permissions = BigInt(guild.permissions || "0");

        const canManage =
            guild.owner ||
            (permissions & 0x8n) === 0x8n ||
            (permissions & 0x20n) === 0x20n;

        if (!canManage) {
            return sendError(
                res,
                403,
                "No tienes permisos para administrar este servidor"
            );
        }

        // Guardar la solicitud en Supabase
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return sendError(res, 500, "Supabase no está configurado");
        }

        const response = await fetch(
            `${supabaseUrl}/rest/v1/ticket_publish_requests`,
            {
                method: "POST",
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal"
                },
                body: JSON.stringify({
                    guild_id: guildId,
                    channel_id: channelId
                })
            }
        );

        if (!response.ok) {
            const details = await response.text();
            console.error("[Ticket Publish Error]", details);

            return sendError(
                res,
                500,
                "No se pudo guardar la solicitud"
            );
        }

        return res.status(200).json({
            success: true,
            message: "Solicitud enviada a Zerox"
        });

    } catch (error) {
        console.error("[Ticket Publish API]", error);

        return sendError(
            error.status || 500,
            error.message || "Error interno"
        );
    }
};
