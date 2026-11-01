
const crypto = require("crypto");
const { cookie } = require("../lib/session");

module.exports = (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (
    !clientId ||
    !redirectUri ||
    !process.env.SESSION_SECRET
  ) {
    return res.status(500).send(
      "Faltan variables de entorno en Vercel"
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  res.setHeader(
    "Set-Cookie",
    cookie("zerox_oauth_state", state, {
      path: "/api/auth/callback",
      maxAge: 600
    })
  );

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify guilds",
    state
  });

  return res.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`
  );
};
