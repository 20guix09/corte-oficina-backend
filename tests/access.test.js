import test from "node:test";
import assert from "node:assert/strict";
import { createSystem } from "../src/app.js";

const baseUser = { nome:"Pessoa", empresa:"Oficina", email:"contato@example.test", senha:"original-12345" };
async function setup(t, providers = {}) {
  const system = createSystem({ appOrigin:"http://localhost", providers });
  const server = system.app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening",resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await system.close(); });
  function client() {
    const cookies = new Map();
    return async (path, body) => {
      const response = await fetch("http://127.0.0.1:" + server.address().port + path, {
        redirect:"manual", method:body ? "POST" : "GET",
        headers:{ "Content-Type":"application/json", Cookie:[...cookies].map(([k,v]) => k+"="+v).join("; ") },
        body:body ? JSON.stringify(body) : undefined
      });
      for (const line of response.headers.getSetCookie()) {
        const [k,v] = line.split(";")[0].split("="); cookies.set(k,v);
      }
      return response;
    };
  }
  return { ...system, client };
}

test("cadastro preserva telefone e aceite; manter conectado sincroniza cookie e banco", async t => {
  const {client,store} = await setup(t);
  const c = client();
  assert.equal((await c("/api/auth/register",{...baseUser,termos:false})).status,400);
  assert.equal((await c("/api/auth/register",{...baseUser,telefone:"(11) 98765-1234",termos:true})).status,201);
  assert.equal(store.db.prepare("SELECT phone FROM onboarding").get().phone,"11987651234");
  assert.ok(store.db.prepare("SELECT accepted_at FROM onboarding").get().accepted_at);
  const opts = await (await c("/api/auth/options")).json();
  assert.equal(opts.mail,false); assert.equal(opts.google,false);
  for (const [remember,seconds] of [[true,2592000],[false,28800]]) {
    const before = Date.now();
    const res = await c("/api/auth/login",{...baseUser,lembrar:remember});
    assert.match(res.headers.get("set-cookie"),new RegExp("Max-Age="+seconds));
    assert.ok(store.db.prepare("SELECT 1 FROM sessions WHERE expires BETWEEN ? AND ?").get(before+seconds*1000,Date.now()+seconds*1000));
  }
});

test("recuperação por e-mail é neutra, expira, revoga sessões e permite um único consumo",async t => {
  const sent = [];
  const {client,store} = await setup(t,{
    mailKey:"teste",mailFrom:"teste@example.test",request:async (_url,req) => {
      sent.push(JSON.parse(req.body)); return Response.json({id:"ok"});
    }
  });
  const c = client();
  await c("/api/auth/register",baseUser);
  const start = address => c("/api/auth/forgot",{email:address}).then(r=>r.json());
  assert.deepEqual(await start("ausente@example.test"),await start(baseUser.email));
  assert.equal(sent.length,1);
  const token = () => sent.at(-1).text.match(/#redefinir=([\w-]+)/)[1];
  const reset = token => c("/api/auth/reset",{senha:"senha-segunda-123",token});
  store.db.prepare("UPDATE recovery SET expires=0").run();
  assert.equal((await reset(token())).status,400);
  await start(baseUser.email);
  const results = await Promise.all([reset(token()),reset(token())]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
  assert.equal((await c("/api/auth/me")).status,401);
  assert.equal((await c("/api/auth/login",baseUser)).status,401);
  assert.equal((await c("/api/auth/login",{...baseUser,senha:"senha-segunda-123"})).status,200);
});

test("link da equipe exige administrador da mesma empresa e substitui o link anterior", async t => {
  const {client} = await setup(t), admin=client(), person=client(), other=client();
  await admin("/api/auth/register",baseUser);
  await other("/api/auth/register",{...baseUser,email:"outra@example.test"});
  const worker={...baseUser,email:"pessoa@example.test",perfil:"operador"};
  await admin("/api/equipe",worker); await person("/api/auth/login",worker);
  const id=(await (await person("/api/auth/me")).json()).dados.id;
  const url="/api/equipe/"+id+"/recuperar";
  assert.equal((await other(url,{})).status,404); assert.equal((await person(url,{})).status,403);
  const first=(await (await admin(url,{})).json()).caminho.split("=")[1];
  const second=(await (await admin(url,{})).json()).caminho.split("=")[1];
  assert.equal((await person("/api/auth/reset",{token:first,senha:"atualizada-1234"})).status,400);
  assert.equal((await person("/api/auth/reset",{token:second,senha:"atualizada-1234"})).status,200);
});

test("Google verifica o estado e a identidade; vincular conta existente exige senha",async t => {
  let verified=true;
  const {client} = await setup(t,{googleId:"id",googleSecret:"segredo",request:async (url,opts) => {
    if(url.endsWith("/token")) {
      assert.ok(opts.body.get("code_verifier")); return Response.json({access_token:"acesso"});
    }
    assert.equal(opts.headers.Authorization,"Bearer acesso");
    return Response.json({sub:"conta-estavel",email:baseUser.email,email_verified:verified});
  }});
  const owner=client(), candidate=client(), outsider=client();
  await owner("/api/auth/register",baseUser);
  async function start() {
    const authUrl=new URL((await candidate("/api/auth/google/start")).headers.get("location"));
    assert.equal(authUrl.searchParams.get("code_challenge_method"),"S256");
    return "/api/auth/google/callback?code=amostra&state="+authUrl.searchParams.get("state");
  }
  const callback=await start();
  assert.equal((await outsider(callback)).headers.get("location"),"/#google-erro");
  verified=false;
  assert.equal((await candidate(callback)).headers.get("location"),"/#google-erro");
  verified=true;
  assert.equal((await candidate(await start())).headers.get("location"),"/#google");
  assert.equal((await candidate("/api/auth/me")).status,401);
  assert.equal((await candidate("/api/auth/login",{...baseUser,senha:"errada",vincularGoogle:true})).status,401);
  assert.equal((await candidate("/api/auth/login",{...baseUser,vincularGoogle:true})).status,200);
  await candidate("/api/auth/logout",{});
  assert.equal((await candidate(await start())).headers.get("location"),"/");
  assert.equal((await (await candidate("/api/auth/me")).json()).dados.email,baseUser.email);
});
