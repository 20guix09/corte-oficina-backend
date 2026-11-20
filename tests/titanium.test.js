import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseTitanium, compareTitanium} from "../src/services/titanium.js";
import {parsePromobDocument} from "../src/xml.js";
import {labelData, renderLabelsPdf} from "../src/services/labels.js";
import {createSystem} from "../src/app.js";
import {titaniumView} from "../public/titanium-view.js";
import {JSDOM} from "jsdom";

const sample = readFileSync(new URL("../exemplos/lote-demonstracao.lote", import.meta.url), "utf8"),
  xml = readFileSync(new URL("../exemplos/projeto-conferencia.xml", import.meta.url), "utf8"),
  pieces = parsePromobDocument(xml).pieces;

test("leitor Titanium: agrupa unidades, preserva material desconhecido e comandos sem executar", () => {
  const lote = parseTitanium(sample);
  assert.equal(lote.resumo.unidadesEtiquetadas, 3);
  assert.equal(lote.resumo.programas, 2);
  assert.equal(lote.resumo.comandos, 7);
  assert.equal(lote.tiposComando["U*"], 2);
  assert.equal(lote.materiais[1].tipo, "");
  assert.equal(lote.materiais[1].comprimento, 2440);
  assert.deepEqual(lote.pecas[0].dimensoes, {w:600,h:400,espessura:15});
  assert.equal(lote.execucaoValidada, false);
  assert.match(lote.pecas[0].imagem, /100.jpg$/);
  const repeated = parseTitanium(sample.replace('number="1" quantity="1"', 'number="1" quantity="2"'));
  assert.equal(repeated.resumo.unidadesEtiquetadas, 5);
  assert.equal(repeated.resumo.chapasProgramadas, 3);
});
test("leitor rejeita arquivo incorreto, entidades, medidas e quantidades inválidas", () => {
  for (const bad of [xml, "<xml>", "<!DOCTYPE a><a/>",
    sample.replace('width="1830"','width="0"'), sample.replace('Version1','Version2'),
    sample.replace('quantity="1"','quantity="1.5"'),
    sample.replace('id="99"','id="0"'),
    " ".repeat(2*1024*1024+1)]) {
    assert.throws(() => parseTitanium(bad));
  }
  assert.throws(() => parseTitanium(sample,"m"));
  assert.equal(parseTitanium(sample,"mm").pecas[0].dimensoes.w,60);
  assert.equal(parseTitanium(sample.replace('60 x 40 x 1.5','600 x 400 x 15 mm')).pecas[0].dimensoes.w,600);
});
test("conferência não confunde IDs individuais com peças faltantes nem aprova troca de material", () => {
  const result = compareTitanium(parseTitanium(sample),pieces);
  assert.equal(result.comparacao.medidasEQuantidadesConferem,true);
  assert.equal(result.comparacao.etiquetasSemCodigoCorrespondente,1);
  assert.equal(result.comparacao.divergenciasMaterial,2);
  assert.equal(result.comparacao.materiaisIntegralmenteConferidos,false);
  const wrong = compareTitanium(parseTitanium(sample),pieces.map(p=>({...p,espessura:12})));
  assert.equal(wrong.comparacao.medidasEQuantidadesConferem,false);
  assert.ok(wrong.comparacao.diferencasMedidas.length);
  const duplicates = compareTitanium(parseTitanium(sample),[...pieces,{...pieces[0]}]);
  assert.ok(!duplicates.comparacao.correspondenciasPorCodigo.some(p=>p.codigo==="100"));
  const missingSize = compareTitanium(parseTitanium(sample.replace('Dimensão: 60 x 40 x 1.5','Sem medidas')),pieces);
  assert.equal(missingSize.comparacao.medidasEQuantidadesConferem,false);
});
test("resultado visual escapa conteúdo do lote e informa o limite da conferência", () => {
  const result = compareTitanium(parseTitanium(sample),pieces);
  result.nome = '<img src=x onerror="alert(1)">';
  const dom = new JSDOM(titaniumView(result));
  assert.equal(dom.window.document.querySelectorAll("img,script").length,0);
  assert.match(dom.window.document.body.textContent,/não libera o giro/);
  assert.match(dom.window.document.body.textContent,/não equivalem à quantidade de cortes/);
  dom.window.close();
});

async function setup(t) {
  const system = createSystem(), server = system.app.listen(0,"127.0.0.1");
  await new Promise(r=>server.once("listening",r));
  t.after(async()=>{await new Promise(r=>server.close(r));await system.close();});
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = "";
    return async(url,method="GET",body)=>{
      const response=await fetch(base+url,{method,headers:{cookie,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
      if(response.headers.has("set-cookie")) cookie=response.headers.get("set-cookie").split(";")[0];
      const bytes=response.headers.get("content-type")?.startsWith("application/pdf") ? Buffer.from(await response.arrayBuffer()):null;
      return {status:response.status,headers:response.headers,bytes,body:bytes||response.status===204?null:await response.json()};
    };
  }
  const c=client();
  async function register(c,email) {return c("/api/auth/register","POST",{nome:"Teste",empresa:"Oficina exemplo",email,senha:"teste-conferencia-1234"});}
  await register(c,"admin@example.test");
  const p=(await c("/api/projetos","POST",{nome:"Pedido de exemplo",cliente:"Cliente exemplo",pedido:"DEMO"})).body.dados;
  const url=`/api/projetos/${p.id}`;
  await c(url+"/importar","POST",{xml,versao:p.versao,substituir:true});
  return {c,client,register,url,base,system};
}
test("API: análise é isolada por empresa, exige perfil e não modifica projeto, planos ou estoque", async t=>{
  const {c,client,register,url}=await setup(t),before={};
  for(const route of [url,url+"/pecas",url+"/planos","/api/materiais","/api/retalhos"]) before[route]=(await c(route)).body;
  const r=await c(url+"/titanium/analisar","POST",{xml:sample});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.dados.comparacao.divergenciasMaterial,2);
  assert.equal(r.body.dados.projectVersion,before[url].dados.versao);
  for(const route of Object.keys(before)) assert.deepEqual((await c(route)).body,before[route]);
  assert.equal((await c(url+"/titanium/analisar","POST",{xml})).status,400);
  const b=client();await register(b,"other@example.test");
  assert.equal((await b(url+"/titanium/analisar","POST",{xml:sample})).status,404);
  await c("/api/equipe","POST",{nome:"Operador",email:"op@example.test",senha:"teste-conferencia-1234",perfil:"operador"});
  const op=client();await op("/api/auth/login","POST",{email:"op@example.test",senha:"teste-conferencia-1234"});
  assert.equal((await op(url+"/titanium/analisar","POST",{xml:sample})).status,403);
});
test("PDF das etiquetas: uma página por unidade, dimensões originais, giro e histórico preservados", async t=>{
  const {c,url,client,register,system}=await setup(t);
  const plan=(await c(url+"/otimizar","POST",{tentativas:2})).body.dados;
  const report=(await c(url+`/planos/${plan.id}/relatorio`)).body.dados;
  const labels=labelData(report);
  assert.equal(labels.length,3);
  assert.equal(new Set(labels.map(p=>p.unidadeId)).size,3);
  const download=await c(url+`/planos/${plan.id}/etiquetas.pdf`);
  assert.equal(download.status,200);
  assert.equal(download.bytes.subarray(0,4).toString(),"%PDF");
  const contents=download.bytes.toString("latin1");
  assert.equal((contents.match(/\/Type \/Page\b/g)||[]).length,3);
  assert.match(contents,/\/MediaBox \[0 0 283\.464567 170\.07874\]/);
  const part=(await c(url+"/pecas")).body.dados[0];
  await c(url+`/pecas/${part.id}`,"PUT",{...part,descricao:"Novo nome",largura:100,bordas:"Nova borda"});
  const old=(await c(url+`/planos/${plan.id}/relatorio`)).body.dados;
  assert.deepEqual(labelData(old),labels);
  assert.equal((await c(url+`/planos/${plan.id}/etiquetas.pdf`)).status,200);
  const rotated=structuredClone(report),p=rotated.boards[0].pieces[0];
  p.larguraOriginal=p.h;p.comprimentoOriginal=p.w;p.bordas="Borda original E1";
  const label=labelData(rotated)[0];
  assert.equal(label.giro,true);assert.equal(label.largura,p.h);assert.equal(label.bordas,"Borda original E1");
  assert.ok((await renderLabelsPdf(rotated)).length>1000);
  const b=client();await register(b,"pdf-other@example.test");
  assert.equal((await b(url+`/planos/${plan.id}/etiquetas.pdf`)).status,404);
  const company = system.store.accounts.findByEmail("admin@example.test").company_id;
  const legacy = {...plan};delete legacy.pecasSnapshot;
  const oldPlan = system.store.create(company,"plan",legacy,url.split("/").at(-1));
  assert.equal((await c(url+`/planos/${oldPlan.id}/etiquetas.pdf`)).status,409);
  await c("/api/equipe","POST",{nome:"Operador",email:"print@example.test",senha:"teste-conferencia-1234",perfil:"operador"});
  const op = client();await op("/api/auth/login","POST",{email:"print@example.test",senha:"teste-conferencia-1234"});
  assert.equal((await op(url+`/planos/${plan.id}/etiquetas.pdf`)).status,200);
});
