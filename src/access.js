// Tokens de recuperação persistem como hashes. Autorizações Google são transitórias.
import { randomBytes, createHash } from "node:crypto";
import { tokenHash, email, hashPassword } from "./auth.js";
import { ensure } from "./errors.js";

const minute = 60_000;
const nonce = () => randomBytes(32).toString("base64url");
function cookie(req, name) {
  return req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="))?.slice(name.length + 1);
}

export function accessRoutes(app, store, { secureCookie, appOrigin, providers = {}, loginSession }) {
  const { googleId, googleSecret, mailKey, mailFrom, request = fetch } = providers;
  const google = Boolean(appOrigin && googleId && googleSecret);
  const mail = Boolean(appOrigin && mailKey && mailFrom);
  const redirect = appOrigin + "/api/auth/google/callback";
  const db = store.db;
  const temporary = new Map();
  function issue(value) {
    for (const [key, row] of temporary) if (row.until <= Date.now()) temporary.delete(key);
    ensure(temporary.size < 5000, "Tente novamente em alguns minutos.", 429);
    const key = nonce();
    temporary.set(key, { ...value, until: Date.now() + 10 * minute });
    return key;
  }
  function read(key, purpose) {
    const row = temporary.get(key);
    return row?.until > Date.now() && row.purpose === purpose ? row : null;
  }
  function setFlowCookie(res, name, value) {
    res.append("Set-Cookie", name + "=" + value + "; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=" + (value ? 600 : 0) + (secureCookie ? "; Secure" : ""));
  }
  const pending = req => read(cookie(req, "google_setup"), "setup");
  app.get("/api/auth/options", (req,res) => {
    const identity = pending(req);
    res.json({ google, mail, pending: identity ? { email: identity.email, existing: !!store.accounts.findByEmail(identity.email) } : null });
  });
  app.get("/api/auth/google/start", (req,res) => {
    ensure(google, "Acesso Google indisponível.", 503);
    const verifier = nonce();
    const state = issue({ purpose:"state", verifier, remember: req.query.remember === "1" });
    setFlowCookie(res, "google_state", state);
    const params = new URLSearchParams({ client_id: googleId, redirect_uri:redirect, response_type:"code",
      scope:"openid email", state, code_challenge_method:"S256",
      code_challenge:createHash("sha256").update(verifier).digest("base64url"), prompt:"select_account" });
    res.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params);
  });
  app.get("/api/auth/google/callback", async (req,res) => {
    const key = cookie(req, "google_state");
    const flow = read(key, "state");
    setFlowCookie(res, "google_state", "");
    if (!google || !flow || key !== req.query.state) return res.redirect("/#google-erro");
    temporary.delete(key);
    if (typeof req.query.code !== "string") return res.redirect("/#google-erro");
    try {
      const exchange = await request("https://oauth2.googleapis.com/token", { method:"POST", signal:AbortSignal.timeout(10000),
        body:new URLSearchParams({ client_id:googleId, client_secret:googleSecret, code:req.query.code, grant_type:"authorization_code", redirect_uri:redirect, code_verifier:flow.verifier }) });
      ensure(exchange.ok, "Google indisponível.");
      const { access_token } = await exchange.json();
      ensure(typeof access_token === "string" && access_token.length, "Autorização inválida.");
      const response = await request("https://openidconnect.googleapis.com/v1/userinfo", { headers:{Authorization:"Bearer " + access_token}, signal:AbortSignal.timeout(10000) });
      ensure(response.ok, "Conta indisponível.");
      const info = await response.json();
      ensure(info.email_verified === true && typeof info.sub === "string" && info.sub.length, "Conta não verificada.");
      const address = email(info.email);
      const linked = db.prepare("SELECT user_id FROM google_accounts WHERE subject=?").get(info.sub);
      if (linked) {
        loginSession(res, linked.user_id, flow.remember);
        return res.redirect("/");
      }
      const ticket = issue({ purpose:"setup", email:address, subject:info.sub });
      setFlowCookie(res, "google_setup", ticket);
      res.redirect("/#google");
    } catch { res.redirect("/#google-erro"); }
  });
  function link(req, user, address) {
    if (req.body.vincularGoogle !== true) return;
    const identity = pending(req);
    ensure(identity && identity.email === address, "Autorização Google expirada. Comece novamente.", 400);
    const existing = db.prepare("SELECT user_id FROM google_accounts WHERE subject=? OR user_id=?").all(identity.subject, user);
    ensure(!existing.length, "Conta Google já vinculada.", 409);
    db.prepare("INSERT INTO google_accounts(subject,user_id) VALUES (?,?)").run(identity.subject,user);
    temporary.delete(cookie(req,"google_setup"));
  }
  function recoveryLink(userId) {
    const token = nonce();
    db.prepare("INSERT OR REPLACE INTO recovery(user_id,hash,expires) VALUES(?,?,?)").run(userId, tokenHash(token), Date.now()+30*minute);
    return "/#redefinir=" + token;
  }
  app.post("/api/auth/forgot", async (req,res) => {
    const address = email(req.body.email);
    ensure(mail, "Peça um link de recuperação ao administrador da oficina.", 503);
    const user = store.accounts.findByEmail(address);
    const recent = user && db.prepare("SELECT expires FROM recovery WHERE user_id=?").get(user.id);
    if (user && !(recent?.expires > Date.now()+29*minute)) {
      const path = recoveryLink(user.id);
      // Retorno idêntico para todos os e-mails; entrega fora da resposta pública.
      Promise.resolve().then(async () => {
        const sent = await request("https://api.resend.com/emails", { method:"POST", signal:AbortSignal.timeout(10000),
          headers:{Authorization:"Bearer " + mailKey, "Content-Type":"application/json"},
          body:JSON.stringify({from:mailFrom,to:[address],subject:"Redefinir sua senha do Corte Oficina",text:"Abra este link em até 30 minutos para escolher sua nova senha.\n\n"+appOrigin+path+"\n\nSe você não solicitou a troca, ignore esta mensagem."}) });
        if (!sent.ok) throw new Error();
      }).catch(() => console.error("Falha na entrega de recuperação. Confira a configuração de e-mail."));
    }
    res.json({mensagem:"Se houver uma conta com esse e-mail, você receberá um link. Confira também o spam."});
  });
  app.post("/api/auth/reset", async (req,res) => {
    ensure(typeof req.body.token === "string" && /^[\w-]{43}$/.test(req.body.token), "Link inválido ou expirado.");
    const hash = tokenHash(req.body.token);
    const get = () => db.prepare("SELECT user_id FROM recovery WHERE hash=? AND expires>?").get(hash,Date.now());
    ensure(get(), "Link inválido ou expirado.");
    const password = await hashPassword(req.body.senha);
    store.transaction(() => {
      const row = get();
      ensure(row, "Link inválido ou expirado.");
      store.accounts.updatePassword(row.user_id,password);
      store.accounts.removeUserSessions(row.user_id);
    });
    res.json({mensagem:"Senha atualizada. Entre com a nova senha."});
  });
  return {link, recoveryLink};
}
