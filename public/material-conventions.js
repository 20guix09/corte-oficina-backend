// Convenções operacionais são opt-in por empresa. Não modificam a identidade do material.
const normalized = value => String(value || "").normalize("NFC").trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR");
export const CADASTRO_PROFILES = [
  ["literal", "Usar os nomes literais dos arquivos"],
  ["pontual", "Pontual: Rosa = branco de uma face; ISOPOR = formato especial"],
];
export function materialConvention(material, profile = "literal") {
  if (profile !== "pontual") return null;
  const names = [material.material, material.acabamento, material.descricao, material.descricaoMaterial].map(normalized);
  if (names.includes("isopor")) return {
    codigo: "formato-especial", faces: null,
    texto: "ISOPOR: nome interno da chapa de formato especial; usar as dimensões deste cadastro.",
    resumo: "Formato especial [ISOPOR]",
  };
  const finish = normalized(material.acabamento);
  if (["rosa", "cores.rosa"].includes(finish)) return {
    codigo: "branco-uma-face", faces: 1,
    texto: "Rosa: código interno para branco de uma face.",
    resumo: "Branco de uma face [Rosa]",
  };
  return null;
}
