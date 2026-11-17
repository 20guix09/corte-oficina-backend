import {
  materialKey,
  whiteRotationRule,
  DEFAULT_SHEET,
} from "../../public/domain.js";
import { material } from "../validation.js";
const dimension = (value, fallback) => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 30 && n <= 100000 ? n : fallback;
};
// Deve ser chamado dentro da transação da importação/preparação.
export function ensureCatalog(store, company, lines) {
  const catalog = store.list(company, "material"),
    mapping = new Map();
  let created = 0,
    reused = 0;
  for (const p of lines) {
    const key = materialKey(p);
    if (mapping.has(key)) continue;
    let stock = catalog.find((m) => materialKey(m) === key);
    if (stock) {
      const additions = {};
      for (const k of [
        "fornecedor",
        "linha",
        "descricaoMaterial",
        "codigoMaterial",
      ])
        if (!stock[k] && p[k]) additions[k] = p[k];
      if (stock.giroPadrao === undefined)
        additions.giroPadrao = whiteRotationRule(p);
      if (Object.keys(additions).length)
        stock = store.update(
          company,
          "material",
          stock.id,
          { ...stock, ...additions },
          stock.versao,
        );
      reused++;
    } else {
      stock = store.create(company, "material", {
        ...material({
          material: p.material,
          acabamento: p.acabamento,
          espessura: p.espessura,
          fornecedor: p.fornecedor,
          linha: p.linha,
          descricaoMaterial: p.descricaoMaterial,
          codigoMaterial: p.codigoMaterial,
          comprimento: dimension(
            p.chapaXml?.comprimento,
            DEFAULT_SHEET.comprimento,
          ),
          largura: dimension(p.chapaXml?.largura, DEFAULT_SHEET.largura),
          custo: 0,
          refilos: { ...DEFAULT_SHEET.refilos },
          giroPadrao: whiteRotationRule(p),
        }),
        origemCadastro: "xml",
        dimensoesOrigem:
          p.chapaXml?.comprimento && p.chapaXml?.largura
            ? "xml"
            : "padrao-oficina",
      });
      catalog.push(stock);
      created++;
    }
    mapping.set(key, stock);
  }
  return { mapping, created, reused, materials: [...mapping.values()] };
}
