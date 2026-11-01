
const crypto = require("crypto");

// Genera la clave de cifrado usando SESSION_SECRET
function getKey() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("Falta SESSION_SECRET en las variables de Vercel");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

// Cifra los datos de la sesión
function seal(data) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([
    iv,
    tag,
    encrypted
  ]).toString("base64url");
}

// Descifra los datos de la sesión
function unseal(value) {
  try {
    const buffer = Buffer.from(value, "base64url");

    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      iv
    );

    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

// Obtiene una cookie
function getCookie(req, name) {
  const cookies = req.headers.cookie || "";

  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }

  return null;
}

// Crea una cookie segura
function cookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || "/"}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  return parts.join("; ");
}

module.exports = {
  seal,
  unseal,
  getCookie,
  cookie
};
