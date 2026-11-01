const { verifyGuildAccess } = require("../lib/discord-access");

function sendError(res, status, error) {
    return res.status(status).json({
        success: false,
        error
    });
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return sendError(res, 405, "Método no permitido");
    }

    try {
        const { guildId, channelId } = req.body || {};

        if (
            typeof guildId !== "string" ||
            typeof channelId !== "string" ||
            !/^\d{17,20}$/.test(guildId) ||
            !/^\d{17,20}$/.test(channelId)
        ) {
            return sendError(
                res,
                400,
                "Servidor o canal no válido"
            );
        }

        // Verificar acceso y permisos del usuario.
        await verifyGuildAccess(req, res, guildId);

        // Comprobar configuración de Supabase.
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return sendError(
                res,
                500,
                "Supabase no está configurado"
            );
        }

        // Registrar la solicitud para que Zerox la procese.
        const response = await fetch(
            `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/ticket_publish_requests`,
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

            console.error(
                "[Ticket Publish Error]",
                response.status,
                details
            );

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

        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "Error interno",
            discordStatus: error.discordStatus || null
        });
    }
};
