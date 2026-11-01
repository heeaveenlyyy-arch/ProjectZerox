
const { cookie } = require("../lib/session");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  res.setHeader("Set-Cookie", [
    cookie("zerox_session", "", { maxAge: 0 }),
    cookie("zerox_oauth_state", "", { maxAge: 0 })
  ]);

  return res.status(200).json({
    success: true
  });
};

