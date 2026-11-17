import { buildReport } from "../../public/report.js";
export function presentPlan(record, project, lines, company) {
  const report = buildReport(
    record,
    record.projetoSnapshot || project,
    lines,
    company,
  );
  return report
    ? {
        ...record,
        boards: report.boards,
        metrics: report.metrics,
        relatorioDisponivel: true,
      }
    : { ...record, relatorioDisponivel: false };
}
export function snapshotProject(project) {
  return Object.fromEntries(
    ["nome", "cliente", "pedido", "observacoes", "origemXml"].map((k) => [
      k,
      project[k] ?? "",
    ]),
  );
}
