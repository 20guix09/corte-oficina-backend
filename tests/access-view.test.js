import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountAccess } from "../public/access-view.js";

async function view(t, path = "", options = {}) {
  const dom = new JSDOM("<main id='root'></main>", {url:"https://example.test/" + path});
  const saved = [globalThis.window,globalThis.FormData];
  globalThis.window = dom.window; globalThis.FormData = dom.window.FormData;
  t.after(() => { [globalThis.window,globalThis.FormData] = saved; dom.window.close(); });
  const root=dom.window.document.querySelector("#root"), calls=[];
  let boots=0;
  await mountAccess(root,async (route,method,body) => {
    if (route.endsWith("/options")) return options;
    calls.push({route,body}); return {mensagem:"Operação concluída."};
  },async () => {boots++;});
  const el=selector=>root.querySelector(selector);
  const fill=(name,value) => {
    const field=el("[name="+name+"]"); field.value=value;
    field.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  };
  const submit=() => el("form").onsubmit({preventDefault(){}});
  return {el,fill,submit,calls,boots:()=>boots};
}

test("formulário valida campos, confirma senha, formata telefone e envia o aceite",async t => {
  const v=await view(t);
  assert.equal(v.el("#length-rule"),null);
  assert.ok(v.el("a.demo-link"));
  v.el("#toggle-auth").click();
  v.fill("nome","Teste"); v.fill("empresa","Oficina"); v.fill("email","incorreto");
  v.fill("telefone","11911112222"); v.fill("senha","senha-exemplo"); v.fill("confirmar","diferente");
  assert.equal(v.el("[name=telefone]").value,"(11) 91111-2222");
  v.el("[data-eye=senha]").click();
  assert.equal(v.el("[name=senha]").type,"text");
  assert.ok(v.el("#length-rule").classList.contains("met"));
  await v.submit(); assert.equal(v.calls.length,0);
  assert.match(v.el("#msg-email").textContent,/válido/);
  assert.match(v.el("#msg-confirmar").textContent,/iguais/);
  v.fill("email","teste@example.test"); v.fill("confirmar","senha-exemplo"); v.el("[name=termos]").checked=true;
  await v.submit();
  assert.equal(v.calls[0].body.termos,true);
  assert.equal(v.calls[0].body.confirmar,undefined);
  assert.equal(v.boots(),1);
});

test("recuperação mostra alternativa administrativa e usa o token do fragmento uma vez",async t => {
  const v=await view(t,"#redefinir="+"a".repeat(43));
  assert.equal(window.location.hash,"");
  v.fill("senha","senha-redefinida"); v.fill("confirmar","senha-redefinida");
  await v.submit();
  assert.equal(v.calls[0].body.token,"a".repeat(43));
  assert.equal(v.calls[0].route,"/api/auth/reset");
  v.el("[data-mode=forgot]").click();
  assert.equal(v.el("button[type=submit]"),null);
  assert.match(v.el(".access-notice").textContent,/administrador/);
});

test("cadastro Google mantém a identidade verificada; login distingue computador lembrado",async t => {
  const v=await view(t,"#google",{google:true,pending:{email:"admin@example.test",existing:false}});
  assert.equal(v.el("[name=email]").readOnly,true);
  assert.equal(v.el("[name=email]").value,"admin@example.test");
  v.el("[data-mode=login]").click();
  v.el("[name=lembrar]").click();
  assert.match(v.el(".google-entry").href,/remember=1/);
});
