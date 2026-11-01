const { unseal, getCookie } = require("../lib/session");

module.exports = async (req, res) => {
  try {
    const sessionCookie = getCookie(req, "zerox_session");

    if (!sessionCookie) {
      return res.status(200).json({
        authenticated: false
      });
    }

    const session = unseal(sessionCookie);

    if (!session || !session.user) {
      return res.status(200).json({
        authenticated: false
      });
    }

    const user = session.user;

    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        global_name: user.global_name,
        avatar
      }
    });

  } catch (error) {
    console.error("Error en /api/auth/me:", error);

    return res.status(500).json({
      error: "Error al obtener la sesión"
    });
  }
};
