const {
  seal,
  getCookie,
  cookie,
  SESSION_MAX_AGE
} = require("../lib/session");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).send("Method not allowed");
  }

  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send("Discord canceló el inicio de sesión");
  }

  const savedState = getCookie(req, "zerox_oauth_state");

  if (!code || !state || !savedState || state !== savedState) {
    return res.status(400).send("Estado OAuth inválido. Intenta nuevamente.");
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).send("Faltan variables de entorno");
  }

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    });

    const tokens = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
      console.error("[Auth] Discord token error:", tokenResponse.status);
      return res.status(401).send("No se pudo autenticar con Discord");
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });

    const user = await userResponse.json().catch(() => ({}));

    if (!userResponse.ok || !user.id) {
      return res.status(401).send("No se pudo obtener tu cuenta de Discord");
    }

    const session = seal({
      user: {
        id: user.id,
        username: user.username,
        global_name: user.global_name,
        avatar: user.avatar
      },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000
    });

    res.setHeader("Set-Cookie", [
      cookie("zerox_session", session, {
        path: "/",
        maxAge: SESSION_MAX_AGE
      }),
      cookie("zerox_oauth_state", "", {
        path: "/api/auth/callback",
        maxAge: 0
      })
    ]);

    return res.redirect("/?login=success");
  } catch (err) {
    console.error("[Auth] OAuth callback error:", err);
    return res.status(500).send("Error interno durante el inicio de sesión");
  }
};
