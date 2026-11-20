import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {materialConvention} from "../public/material-conventions.js";
import {materialKey} from "../public/domain.js";
import {parseTitanium, compareTitanium} from "../src/services/titanium.js";
import {parsePromobDocument} from "../src/xml.js";
import {optimize} from "../src/engine.js";
import {buildReport} from "../public/report.js";
import {labelData} from "../src/services/labels.js";
import {createSystem} from "../src/app.js";

const machine={serra:5,fases:6,corteMaximo:2800,minimoRetalhoLargura:200,minimoRetalhoComprimento:400,perfilCadastros:"pontual"},
  stock={id:"rosa",material:"MDF",acabamento:"Rosa",espessura:18,comprimento:2750,largura:1830,refilos:{esquerda:15,direita:15,superior:15,inferior:15}},
  line={id:"r",codigo:"R",descricao:"Peça",material:"MDF",acabamento:"Rosa",espessura:18,largura:400,comprimento:300,quantidade:1,giroPermitido:false};

test("nomes da Pontual exigem perfil explícito e não transformam branco sem indicação em duas faces",()=>{
  assert.equal(materialConvention(stock),null);
  assert.equal(materialConvention(stock,"pontual").faces,1);
  assert.equal(materialConvention({...stock,acabamento:"Branco"},"pontual"),null);
  assert.match(materialConvention({descricao:"ISOPOR"},"pontual").texto,/formato especial/);
  assert.notEqual(materialKey(stock),materialKey({...stock,acabamento:"Branco"}));
  assert.equal(materialConvention({...stock,acabamento:"Rosa Acetinado"},"pontual"),null);
});
test("conferência explica nomes operacionais, mantém formato e não certifica equivalência física",()=>{
  const source=readFileSync(new URL("../exemplos/lote-demonstracao.lote",import.meta.url),"utf8").replace('Material a confirmar','ISOPOR'),
    parts=parsePromobDocument(readFileSync(new URL("../exemplos/projeto-conferencia.xml",import.meta.url),"utf8")).pieces,
    raw=parseTitanium(source), plain=compareTitanium(raw,parts),
    result=compareTitanium(raw,parts,{perfilCadastros:"pontual"});
  assert.equal(plain.comparacao.divergenciasNaoExplicadas,2);
  assert.equal(result.comparacao.nomesOperacionaisExplicados,2);
  assert.equal(result.comparacao.divergenciasNaoExplicadas,0);
  assert.equal(result.comparacao.materiaisIntegralmenteConferidos,false);
  assert.equal(result.execucaoValidada,false);
  const special=result.comparacao.correspondenciasPorCodigo.find(p=>p.codigo==="200");
  assert.equal(special.formatoDiferente,true);
  assert.deepEqual(special.formatoLote,[2440,2150]);
  assert.equal(result.materiais[1].tipo,"");
  assert.equal(raw.materiais[1].interpretacao,undefined);
  const wrong=compareTitanium(raw,parts.map(p=>({...p,acabamento:"Carvalho"})),{perfilCadastros:"pontual"});
  assert.equal(wrong.comparacao.nomesOperacionaisExplicados,0);
  assert.equal(compareTitanium(raw,parts.map(p=>({...p,espessura:12})),{perfilCadastros:"pontual"}).comparacao.nomesOperacionaisExplicados,0);
});
test("otimizador mantém uma face separada e usa as dimensões do formato especial",()=>{
  const white={...stock,id:"branco",acabamento:"Branco"},
    lines=[line,{...line,id:"b",acabamento:"Branco"}],
    result=optimize({lines,materials:[stock,white],scraps:[],machine,attempts:2});
  assert.equal(result.boards.length,2);
  for(const b of result.boards) for(const p of b.pieces) {
    const original=lines.find(l=>p.unitId.startsWith(l.id+":"));
    assert.equal(materialKey(original),materialKey(b.stock));
  }
  const special={...stock,id:"especial",acabamento:"ISOPOR",comprimento:2440,largura:2150},
    large={...line,acabamento:"ISOPOR",largura:2400,comprimento:2000};
  const plan=optimize({lines:[large],materials:[special],scraps:[],machine,attempts:2});
  assert.equal(plan.boards[0].stock.comprimento,2440);
  assert.equal(plan.boards[0].stock.largura,2150);
});
test("relatórios e etiquetas identificam branco de uma face sem renomear material ou revisão antiga",()=>{
  const plan={...optimize({lines:[line],materials:[stock],scraps:[],machine,attempts:2}),pecasSnapshot:[line],projectVersion:1},
    report=buildReport(plan,{nome:"Exemplo"},[line],"Oficina"), labels=labelData(report);
  assert.equal(report.boards[0].stock.acabamento,"Rosa");
  assert.match(labels[0].material,/Branco de uma face \[Rosa\]/);
  assert.equal(plan.pecasSnapshot[0].acabamento,"Rosa");
  const literal=buildReport({...plan,machine:{...machine,perfilCadastros:"literal"}},{},[line]);
  assert.equal(literal.boards[0].nomeOperacional,"");
});
test("perfil de cadastros persiste por empresa e cliente antigo não apaga a configuração",async t=>{
  const system=createSystem(),server=system.app.listen(0,"127.0.0.1");
  await new Promise(r=>server.once("listening",r));
  t.after(async()=>{await new Promise(r=>server.close(r));await system.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  function client(){let cookie="";return async(url,method="GET",body)=>{
    const r=await fetch(base+url,{method,headers:{cookie,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    if(r.headers.has("set-cookie")) cookie=r.headers.get("set-cookie").split(";")[0];
    return {status:r.status,body:await r.json()};
  };}
  const a=client(),b=client();
  for(const [c,email] of [[a,"a@example.test"],[b,"b@example.test"]]) await c("/api/auth/register","POST",{nome:"Teste",empresa:"Exemplo",email,senha:"convenção-123456789"});
  let m=(await a("/api/maquina")).body.dados;
  assert.equal((await a("/api/maquina","PUT",{...m,perfilCadastros:"universal"})).status,400);
  m=(await a("/api/maquina","PUT",{...m,perfilCadastros:"pontual"})).body.dados;
  assert.equal(m.perfilCadastros,"pontual");
  assert.notEqual((await b("/api/maquina")).body.dados.perfilCadastros,"pontual");
  delete m.perfilCadastros;
  assert.equal((await a("/api/maquina","PUT",m)).body.dados.perfilCadastros,"pontual");
  const p=(await a("/api/projetos","POST",{nome:"Exemplo"})).body.dados,url=`/api/projetos/${p.id}`,
    xml=readFileSync(new URL("../exemplos/projeto-conferencia.xml",import.meta.url),"utf8"),
    lote=readFileSync(new URL("../exemplos/lote-demonstracao.lote",import.meta.url),"utf8");
  await a(url+"/importar","POST",{xml,versao:p.versao,substituir:true});
  const r=await a(url+"/titanium/analisar","POST",{xml:lote,perfilCadastros:"literal"});
  assert.equal(r.body.dados.perfilCadastros,"pontual");
  assert.equal(r.body.dados.comparacao.nomesOperacionaisExplicados,2);
});
