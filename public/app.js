import { drawBoard, setupDrag } from "./editor.js";
import { materialKey, DEFAULT_SHEET } from "./domain.js";
import { buildReport, reportSections } from "./report.js";
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#modal");
const state = {
  user: null,
  view: "projetos",
  projects: [],
  materials: [],
  scraps: [],
  machine: null,
  project: null,
  pieces: [],
  plans: [],
  draft: null,
  board: 0,
  selected: null,
  dirty: false,
  undo: [],
  redo: [],
  cut: null,
};
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (n, d = 1) =>
  Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });
const money = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const editable = () => state.user?.role !== "operador";
const key = materialKey;
const units = () =>
  state.pieces.flatMap((p) =>
    Array.from({ length: p.quantidade }, (_, i) => ({
      ...p,
      unitId: `${p.id}:${i + 1}`,
    })),
  );
const path = () => `/api/projetos/${state.project.id}`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => ($("#toast").hidden = true), 5500);
}
async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      state.user = null;
      renderAuth();
    }
    throw new Error(result.erro || "Não foi possível concluir.");
  }
  return result;
}
function click(id, action) {
  const el = document.getElementById(id);
  if (el)
    el.onclick = async (event) => {
      try {
        await action(event);
      } catch (e) {
        toast(e.message);
      }
    };
}
function field(name, label, value = "", type = "text", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function select(name, label, options, value) {
  return `<label>${label}<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
}
const num = (data, name) => Number(data.get(name));
function dialog(title, body, onSubmit, submit = "Salvar") {
  modal.innerHTML = `<div class="dialog-top"><h2>${esc(title)}</h2><button type="button" id="close-modal" aria-label="Fechar">×</button></div><form id="modal-form">${body}<div class="error" id="modal-error" hidden></div><div class="actions"><button class="primary" type="submit">${submit}</button><button id="cancel-modal" type="button">Cancelar</button></div></form>`;
  click("close-modal", () => modal.close());
  click("cancel-modal", () => modal.close());
  modal.showModal();
  $("#modal-form").onsubmit = async (event) => {
    event.preventDefault();
    const button =
      event.submitter || event.target.querySelector("button[type=submit]");
    button.disabled = true;
    $("#modal-error").hidden = true;
    try {
      await onSubmit(new FormData(event.target));
      modal.close();
    } catch (e) {
      $("#modal-error").textContent = e.message;
      $("#modal-error").hidden = false;
    } finally {
      button.disabled = false;
    }
  };
}
function allowLeave() {
  return (
    !state.dirty ||
    confirm("Há posições não salvas. Descartar essas alterações?")
  );
}
function renderAuth(register = false) {
  app.innerHTML = `<div class="auth"><section class="auth-hero"><div class="logo"><span class="mark"></span>Corte Oficina</div><span class="eyebrow" style="color:#69c3c5">Planejamento de corte</span><h1>Mais peça.<br>Mais sobra útil.</h1><p>Do XML ao plano visual: compare alternativas, ajuste as posições e confira a sequência de corte.</p><p><span class="tag">Versão piloto</span></p></section><section class="auth-box"><form id="auth-form"><h2>${register ? "Crie sua empresa" : "Bom te ver por aqui"}</h2><p class="muted">${register ? "Cada empresa tem seus próprios projetos e estoque." : "Entre para continuar o planejamento."}</p>${register ? field("nome", "Seu nome") + field("empresa", "Empresa") : ""}${field("email", "E-mail", "", "email", 'required autocomplete="username"')}${field("senha", "Senha", "", "password", `required minlength="10" maxlength="128" autocomplete="${register ? "new-password" : "current-password"}"`)}<small>Mínimo de 10 caracteres.</small><div class="error" id="auth-error" hidden></div><div class="actions"><button type="submit" class="primary">${register ? "Criar empresa" : "Entrar"}</button></div><button type="button" class="link" id="toggle-auth">${register ? "Já tenho conta" : "Criar uma empresa"}</button></form></section></div>`;
  click("toggle-auth", () => renderAuth(!register));
  $("#auth-form").onsubmit = async (event) => {
    event.preventDefault();
    const button =
      event.submitter || event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api(
        "/api/auth/" + (register ? "register" : "login"),
        "POST",
        Object.fromEntries(new FormData(event.target)),
      );
      await boot();
    } catch (e) {
      $("#auth-error").textContent = e.message;
      $("#auth-error").hidden = false;
    } finally {
      button.disabled = false;
    }
  };
}
function shell(content, title, subtitle = "") {
  const links = [
    ["projetos", "Projetos"],
    ["materiais", "Chapas"],
    ["retalhos", "Sobras em estoque"],
    ["maquina", "Regras de corte"],
    ...(state.user.role === "admin" ? [["equipe", "Equipe"]] : []),
    ["conta", "Minha conta"],
  ];
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="logo"><span class="mark"></span>Corte Oficina</div><small>${esc(state.user.company)}<br>Versão piloto · mm</small><nav>${links.map(([id, label]) => `<button data-nav="${id}" class="${state.view === id ? "active" : ""}">${label}</button>`).join("")}</nav><div class="bottom"><small>${esc(state.user.name)}<br>${esc(state.user.role)}</small><p><button id="logout">Sair da conta</button></p></div></aside><main class="main"><header class="topbar"><div><div class="eyebrow">${esc(state.user.company)}</div><h1>${esc(title)}</h1>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ""}</div><span class="tag">Piloto</span></header>${content}</main></div>`;
  document
    .querySelectorAll("[data-nav]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          navigate(el.dataset.nav).catch((e) => toast(e.message))),
    );
  click("logout", async () => {
    if (!allowLeave()) return;
    await api("/api/auth/logout", "POST");
    state.user = null;
    state.dirty = false;
    renderAuth();
  });
}
async function boot() {
  state.user = (await api("/api/auth/me")).dados;
  await refreshStock();
  state.dirty = false;
  await navigate("projetos");
}
async function refreshStock() {
  [state.materials, state.scraps, state.machine] = await Promise.all(
    ["/api/materiais", "/api/retalhos", "/api/maquina"].map((url) =>
      api(url).then((r) => r.dados),
    ),
  );
}
async function navigate(view) {
  if (!allowLeave()) return;
  state.view = view;
  state.dirty = false;
  state.draft = null;
  if (view === "projetos") {
    state.projects = (await api("/api/projetos")).dados;
    renderProjects();
  }
  if (view === "materiais" || view === "retalhos") {
    await refreshStock();
    renderStock(view);
  }
  if (view === "maquina") {
    await refreshStock();
    renderMachine();
  }
  if (view === "equipe") await renderTeam();
  if (view === "conta") renderAccount();
}
function renderProjects() {
  shell(
    `<div class="stats"><div class="stat"><span class="muted">Projetos</span><strong>${state.projects.length}</strong></div><div class="stat"><span class="muted">Materiais cadastrados</span><strong>${state.materials.length}</strong></div><div class="stat"><span class="muted">Sobras disponíveis</span><strong>${state.scraps.filter((s) => s.status === "disponivel").length}</strong></div></div><section class="card"><div class="row between"><h2>Seus projetos</h2>${editable() ? '<button class="primary" id="new-project">+ Novo projeto</button>' : ""}</div><label>Buscar projeto<input id="search-project" placeholder="Nome, cliente ou pedido"></label><div class="table-wrap"><table><thead><tr><th>Projeto</th><th>Cliente / pedido</th><th>Atualizado</th><th></th></tr></thead><tbody id="project-rows"></tbody></table></div></section><div class="notice">O arquivo para a máquina Titanium ainda depende de integração e validação com um .lote real. Aqui você prepara e revisa o plano.</div>`,
    "Projetos",
    "Importe as peças, planeje as chapas e acompanhe as versões.",
  );
  function rows(query = "") {
    const values = state.projects.filter((p) =>
      `${p.nome} ${p.cliente} ${p.pedido}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    $("#project-rows").innerHTML =
      values
        .map(
          (p) =>
            `<tr><td><strong>${esc(p.nome)}</strong></td><td>${esc(p.cliente)}<br><small>${esc(p.pedido)}</small></td><td>${new Date(p.atualizadoEm).toLocaleDateString("pt-BR")}</td><td><button data-open="${p.id}">Abrir projeto →</button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="4" class="empty">Nenhum projeto. Comece criando um.</td></tr>';
    document
      .querySelectorAll("[data-open]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            openProject(b.dataset.open).catch((e) => toast(e.message))),
      );
  }
  rows();
  $("#search-project").oninput = (e) => rows(e.target.value);
  click("new-project", () => projectDialog());
}
function projectDialog(existing) {
  dialog(
    existing ? "Editar projeto" : "Novo projeto",
    `<div class="grid">${field("nome", "Nome do projeto", existing?.nome || "", "", "required")}${field("cliente", "Cliente", existing?.cliente || "")}${field("pedido", "Pedido", existing?.pedido || "")}</div><label>Observações<textarea name="observacoes">${esc(existing?.observacoes || "")}</textarea></label>`,
    async (data) => {
      const result = (
        await api(
          existing ? path() : "/api/projetos",
          existing ? "PUT" : "POST",
          {
            ...Object.fromEntries(data),
            ...(existing ? { versao: existing.versao } : {}),
          },
        )
      ).dados;
      await openProject(result.id);
    },
  );
}
async function loadProject() {
  const base = path(),
    [projectResponse, pieceResponse] = await Promise.all([
      api(base),
      api(base + "/pecas"),
    ]);
  if (!projectResponse.dados?.id || !Array.isArray(pieceResponse.dados))
    throw new Error(
      "Resposta do projeto incompatível. Atualize o servidor e a página juntos.",
    );
  state.project = projectResponse.dados;
  state.pieces = pieceResponse.dados;
  state.historyError = "";
  state.plans = [];
  try {
    const history = await api(base + "/planos");
    if (!Array.isArray(history.dados))
      throw new Error("Histórico com formato antigo.");
    state.plans = history.dados
      .filter((p) => p && typeof p === "object")
      .map((p) => {
        const report = buildReport(
          p,
          p.projetoSnapshot || state.project,
          state.pieces,
          state.user.company,
        );
        return report
          ? {
              ...p,
              boards: report.boards,
              metrics: report.metrics,
              relatorioDisponivel: true,
            }
          : { ...p, relatorioDisponivel: false };
      });
  } catch (error) {
    if (!state.user) throw error;
    state.historyError =
      "Não foi possível carregar o histórico. As peças continuam disponíveis. " +
      error.message;
  }
  if (editable() && state.pieces.length) {
    const prepared = await api(base + "/preparar-chapas", "POST", {});
    if (prepared.pecasAtualizadas) return loadProject();
  }
  await refreshStock();
}
async function openProject(id) {
  if (!allowLeave()) return;
  state.project = { id };
  state.pieces = [];
  state.plans = [];
  state.view = "projetos";
  state.dirty = false;
  state.draft = null;
  await loadProject();
  renderProject();
}
function historyRows() {
  return (
    state.plans
      .map((p, i) => {
        const m = p.metrics;
        return `<tr><td>${state.plans.length - i} · ${esc(p.status || "antigo")}${p.retalhosRegistrados ? " · produzido" : ""}${p.projectVersion !== state.project.versao ? " · desatualizado" : ""}<br><small>${esc(p.autor || "")}</small>${!m ? '<br><span class="tag warn">Sem resumo salvo</span>' : ""}</td><td>${m?.chapasNovas ?? "—"}</td><td>${m?.retalhosUsados ?? "—"}</td><td>${m ? fmt(m.aproveitamento) + "%" : "—"}</td><td>${m ? fmt(m.maiorRetalho / 1e6, 3) + " m²" : "—"}</td><td>${m ? money(m.custoChapas) : "—"}</td><td>${p.relatorioDisponivel ? `<button data-plan="${esc(p.id)}">Ver plano</button>` : '<span class="muted">Gere um novo plano</span>'}</td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="7" class="empty">Nenhum plano gerado ainda.</td></tr>'
  );
}
function renderProject() {
  const produced = state.plans.some((p) => p.retalhosRegistrados);
  const can = editable() && !produced;
  const quantity = state.pieces.reduce((n, p) => n + p.quantidade, 0);
  shell(
    `<div class="row between"><button id="back-projects">← Projetos</button><div class="row">${can ? '<button id="edit-project">Editar dados</button><button class="danger" id="delete-project">Excluir</button>' : ""}</div></div>${produced ? '<div class="notice">Produção confirmada. Este projeto está disponível para consulta; crie outro para uma nova execução.</div>' : ""}<div class="stats" style="margin-top:16px"><div class="stat"><span>Unidades</span><strong>${quantity}</strong></div><div class="stat"><span>Materiais e espessuras</span><strong>${new Set(state.pieces.map(key)).size}</strong></div><div class="stat"><span>Planos salvos</span><strong>${state.plans.length}</strong></div><div class="stat"><span>Revisão das peças</span><strong>${state.project.versao}</strong></div></div><section class="card"><div class="row between"><h2>Peças do projeto</h2>${can ? '<div class="row"><button id="import-xml">Importar XML</button><button id="add-piece">+ Peça</button><button id="setup-materials">Ver chapas do XML</button></div>' : ""}</div><p class="muted">Medidas em mm, já no tamanho de corte. Giro de 90° só com permissão explícita.</p><div class="table-wrap"><table><thead><tr><th>Peça</th><th>Medidas</th><th>Qtde</th><th>Material</th><th>Giro</th><th></th></tr></thead><tbody>${state.pieces.map((p) => `<tr><td><strong>${esc(p.codigo)}</strong><br>${esc(p.descricao)}</td><td>${fmt(p.largura)} × ${fmt(p.comprimento)}<br><small>${fmt(p.espessura)} mm de espessura</small></td><td>${p.quantidade}</td><td>${esc(p.material)}<br><small>${esc(p.acabamento)}</small></td><td>${p.giroPermitido ? "Permitido" : "Bloqueado"}</td><td>${can ? `<button data-edit-piece="${p.id}">Editar</button> <button data-delete-piece="${p.id}" class="danger">Excluir</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Importe o XML ou cadastre as peças.</td></tr>'}</tbody></table></div><div class="actions">${can ? `<button id="optimize" class="primary" ${quantity ? "" : "disabled"}>Otimizar automaticamente</button><button id="manual" ${quantity ? "" : "disabled"}>Montar manualmente</button>` : ""}</div></section>${state.historyError ? `<div class="notice">${esc(state.historyError)}</div>` : ""}<section class="card"><h2>Histórico de planos</h2><p class="muted">Os números abaixo comparam as alternativas deste projeto. Custo de chapa é uma estimativa de compra, sem mão de obra.</p><div class="table-wrap"><table><thead><tr><th>Versão</th><th>Chapas novas</th><th>Sobras usadas</th><th>Aproveitamento</th><th>Maior sobra útil</th><th>Custo de chapas</th><th></th></tr></thead><tbody>${historyRows()}</tbody></table></div></section>`,
    state.project.nome,
    `${state.project.cliente} ${state.project.pedido ? `· Pedido ${state.project.pedido}` : ""}`,
  );
  click("back-projects", () => navigate("projetos"));
  click("edit-project", () => projectDialog(state.project));
  click("delete-project", async () => {
    if (confirm("Excluir este projeto, suas peças e seus planos?")) {
      await api(path() + `?versao=${state.project.versao}`, "DELETE");
      await navigate("projetos");
    }
  });
  click("add-piece", () => pieceDialog());
  click("import-xml", importDialog);
  click("setup-materials", setupMaterials);
  click("optimize", optimizeDialog);
  click("manual", startManual);
  document
    .querySelectorAll("[data-edit-piece]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          pieceDialog(state.pieces.find((p) => p.id === b.dataset.editPiece))),
    );
  document.querySelectorAll("[data-delete-piece]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          const p = state.pieces.find((p) => p.id === b.dataset.deletePiece);
          if (confirm(`Excluir ${p.codigo} e suas ${p.quantidade} unidades?`)) {
            await api(path() + `/pecas/${p.id}?versao=${p.versao}`, "DELETE");
            await loadProject();
            renderProject();
          }
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  document
    .querySelectorAll("[data-plan]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          openPlan(state.plans.find((p) => p.id === b.dataset.plan))),
    );
}
function pieceDialog(p) {
  dialog(
    p ? "Editar peça" : "Nova peça",
    `<div class="grid">${field("codigo", "Código", p?.codigo || "", "", "required")}${field("descricao", "Descrição", p?.descricao || "", "", "required")}${field("largura", "Dimensão X / largura (mm)", p?.largura || 600, "number", 'required min="0.001" step="0.001"')}${field("comprimento", "Dimensão Y / comprimento (mm)", p?.comprimento || 400, "number", 'required min="0.001" step="0.001"')}${field("espessura", "Espessura (mm)", p?.espessura || 15, "number", 'required min="0.001" step="0.001"')}${field("quantidade", "Quantidade", p?.quantidade || 1, "number", 'required min="1" max="500" step="1"')}${field("material", "Material / nome no XML", p?.material || "MDF", "", "required")}${field("acabamento", "Acabamento / cor", p?.acabamento || "Branco", "", "required")}${field("fornecedor", "Fornecedor", p?.fornecedor || "")}${field("linha", "Linha", p?.linha || "")}</div><label class="check"><input name="giroPermitido" type="checkbox" ${p?.giroPermitido ? "checked" : ""}>Permitir giro de 90° desta peça</label><p class="muted">Confirme o sentido do desenho antes de liberar o giro. A importação usa a regra do material. Branco liso permite giro pela regra informada pela oficina; você pode alterar esta peça aqui.</p><label>Informação de bordas<textarea name="bordas">${esc(p?.bordas || "Não informadas")}</textarea></label>${p ? `<p class="muted">Orientação recebida no XML: ${esc(p.orientacaoXml || "não informada")}. Dimensão de chapa no XML: ${esc(JSON.stringify(p.chapaXml || {}))}.</p>` : ""}`,
    async (data) => {
      const body = {
        ...p,
        ...Object.fromEntries(data),
        giroPermitido: data.has("giroPermitido"),
        giroOrigem: "manual",
      };
      for (const n of ["largura", "comprimento", "espessura", "quantidade"])
        body[n] = num(data, n);
      await api(
        path() + "/pecas" + (p ? `/${p.id}` : ""),
        p ? "PUT" : "POST",
        body,
      );
      await loadProject();
      renderProject();
    },
  );
}
function importDialog() {
  dialog(
    "Importar listagem do Promob",
    `<p>Selecione o XML de listagem de chapas, em milímetros. A importação substitui as peças deste projeto; os planos anteriores ficam desatualizados.</p><div class="filebox">${field("arquivo", "Arquivo XML", "", "file", 'required accept=".xml,text/xml,application/xml"')}</div><label class="check"><input type="checkbox" name="confirmar" required>Entendi que as peças atuais serão substituídas.</label>`,
    async (data) => {
      const file = data.get("arquivo");
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Arquivo acima de 2 MB.");
      const result = await api(path() + "/importar", "POST", {
        xml: await file.text(),
        versao: state.project.versao,
        substituir: true,
      });
      await loadProject();
      renderProject();
      toast(
        `${result.linhas} linhas e ${result.unidades} unidades importadas. ${result.chapasCriadas || 0} chapas cadastradas e ${result.chapasReutilizadas || 0} cadastros reutilizados.`,
      );
    },
    "Importar peças",
  );
}
function stockFields(s = {}, scrap = false) {
  const r = s.refilos || {
    esquerda: 15,
    direita: 15,
    superior: 15,
    inferior: 15,
  };
  return `${scrap ? `<div class="grid">${field("codigo", "Código da sobra", s.codigo || "", "", "required")}${field("local", "Local no estoque", s.local || "", "", "required")}</div>` : ""}<div class="grid">${field("material", "Material / nome no XML", s.material || "", "", "required")}${field("acabamento", "Acabamento / cor", s.acabamento || "", "", "required")}${field("fornecedor", "Fornecedor", s.fornecedor || "")}${field("linha", "Linha", s.linha || "")}${field("codigoMaterial", "Código do material", s.codigoMaterial || "")}${field("descricaoMaterial", "Descrição do material", s.descricaoMaterial || "")}${field("espessura", "Espessura (mm)", s.espessura || 15, "number", 'required min="0.001" step="0.001"')}${field("comprimento", "Comprimento horizontal X (mm)", s.comprimento || 2750, "number", 'required min="1" step="0.001"')}${field("largura", "Largura vertical Y (mm)", s.largura || DEFAULT_SHEET.largura, "number", 'required min="1" step="0.001"')}${field("custo", "Custo por chapa (R$)", s.custo ?? 0, "number", 'required min="0" step="0.01"')}</div><label class="check"><input type="checkbox" name="giroPadrao" ${s.giroPadrao ? "checked" : ""}>Permitir giro de 90° nas próximas importações deste material</label><h3 style="margin-top:18px">Refilo em cada lado (mm)</h3><div class="grid">${Object.entries(
    r,
  )
    .map(([k, v]) =>
      field(
        "refilo_" + k,
        k[0].toUpperCase() + k.slice(1),
        v,
        "number",
        'required min="0" step="0.001"',
      ),
    )
    .join(
      "",
    )}</div><p class="muted">O refilo informado já inclui toda a margem descartada nesse lado. Os cortes internos usam a espessura de serra cadastrada.</p>`;
}
function stockBody(data) {
  return {
    ...Object.fromEntries(data),
    giroPadrao: data.has("giroPadrao"),
    espessura: num(data, "espessura"),
    comprimento: num(data, "comprimento"),
    largura: num(data, "largura"),
    custo: num(data, "custo"),
    refilos: Object.fromEntries(
      ["esquerda", "direita", "superior", "inferior"].map((k) => [
        k,
        num(data, "refilo_" + k),
      ]),
    ),
  };
}
function renderStock(view) {
  const scrap = view === "retalhos",
    values = scrap ? state.scraps : state.materials;
  shell(
    `<section class="card"><div class="row between"><h2>${scrap ? "Sobras registradas" : "Tipos de chapa"}</h2>${editable() ? '<button class="primary" id="add-stock">+ Cadastrar</button>' : ""}</div><p class="muted">${scrap ? "Registre somente sobras que existem fisicamente. A otimização considera as disponíveis, preservando seu eixo original." : "Cada cadastro é um tipo de chapa que pode ser comprado. O piloto não controla saldo de chapas novas."}</p><div class="table-wrap"><table><thead><tr><th>${scrap ? "Código / local" : "Material"}</th><th>Acabamento / espessura</th><th>Dimensões X × Y</th><th>${scrap ? "Situação" : "Custo"}</th><th></th></tr></thead><tbody>${
      values
        .map(
          (s) =>
            `<tr><td>${esc(scrap ? s.codigo : s.material)}<br><small>${esc(scrap ? s.local : "")}</small>${scrap && s.origemProjeto ? `<br><small>Projeto: ${esc(s.origemProjeto)}<br>Pedido: ${esc(s.origemPedido || "—")} · Chapa ${esc(s.origemChapaNumero || s.origemChapa)}</small>` : ""}</td><td>${esc(s.acabamento)} · ${fmt(s.espessura)} mm${scrap ? `<br><small>${esc(s.material)}</small>` : ""}</td><td>${fmt(s.comprimento)} × ${fmt(s.largura)} mm<br><small>Refilo E/D/S/I: ${Object.values(
              s.refilos,
            )
              .map((v) => fmt(v))
              .join(
                " / ",
              )}</small></td><td>${scrap ? esc(s.status) : money(s.custo)}</td><td>${editable() && (!scrap || s.status === "disponivel") ? `<button data-edit-stock="${s.id}">Editar</button> <button class="danger" data-remove-stock="${s.id}">Excluir</button>` : ""}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5" class="empty">Nada cadastrado ainda.</td></tr>'
    }</tbody></table></div></section>`,
    scrap ? "Sobras em estoque" : "Chapas",
    scrap
      ? "Reaproveite material disponível nos próximos projetos."
      : "Dimensões, margens e custo por material e espessura.",
  );
  const url = "/api/" + view;
  function form(s) {
    dialog(
      scrap ? "Cadastrar / editar sobra" : "Cadastrar / editar chapa",
      stockFields(s, scrap),
      async (data) => {
        await api(url + (s ? "/" + s.id : ""), s ? "PUT" : "POST", {
          ...stockBody(data),
          ...(s ? { versao: s.versao } : {}),
        });
        await refreshStock();
        renderStock(view);
      },
    );
  }
  click("add-stock", () => form());
  document
    .querySelectorAll("[data-edit-stock]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          form(values.find((s) => s.id === b.dataset.editStock))),
    );
  document.querySelectorAll("[data-remove-stock]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          const s = values.find((s) => s.id === b.dataset.removeStock);
          if (confirm("Excluir este cadastro?")) {
            await api(url + `/${s.id}?versao=${s.versao}`, "DELETE");
            await refreshStock();
            renderStock(view);
          }
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}
async function setupMaterials() {
  await api(path() + "/preparar-chapas", "POST", {});
  await refreshStock();
  const stocks = state.materials.filter((m) =>
    state.pieces.some((p) => key(p) === key(m)),
  );
  dialog(
    "Chapas cadastradas a partir do XML",
    `<p>Estes cadastros ficam salvos para outros pedidos. Se o material já existe, o cadastro é reutilizado.</p><div class="table-wrap"><table><thead><tr><th>Material</th><th>Chapa (mm)</th><th>Giro nas importações</th></tr></thead><tbody>${stocks.map((m) => `<tr><td>${esc(m.material)} · ${esc(m.acabamento)} · ${m.espessura} mm<br><small>${esc(m.fornecedor || "Fornecedor não informado")}</small></td><td>${m.comprimento} × ${m.largura}</td><td>${m.giroPadrao ? "Permitido" : "Bloqueado"}</td></tr>`).join("")}</tbody></table></div><p>Para ajustar custo, refilos ou a regra do material, use a tela Chapas.</p>`,
    async () => {},
    "Fechar",
  );
}
function renderMachine() {
  const m = state.machine;
  shell(
    `<section class="card"><h2>Perfil de corte</h2><p class="muted">O valor das fases limita mudanças de direção ao longo de cada ramo da sequência. A interpretação do controlador ainda precisa ser conferida.</p><form id="machine-form"><div class="grid">${field("nome", "Nome do perfil", m.nome)}${field("serra", "Espaço consumido pela serra (mm)", m.serra, "number", 'min="0.01" step="0.01" required')}${field("corteMaximo", "Comprimento máximo de corte (mm)", m.corteMaximo, "number", 'min="1" required')}${field("fases", "Limite de fases", m.fases, "number", 'min="1" max="20" required')}${field("minimoRetalhoLargura", "Lado menor mínimo da sobra útil (mm)", m.minimoRetalhoLargura, "number", 'min="1" required')}${field("minimoRetalhoComprimento", "Lado maior mínimo da sobra útil (mm)", m.minimoRetalhoComprimento, "number", 'min="1" required')}</div><div class="actions">${state.user.role === "admin" ? '<button class="primary">Salvar regras</button>' : '<p class="muted">Somente o administrador altera o perfil.</p>'}</div></form></section><div class="notice">Parâmetros iniciais: serra de 5 mm, corte de 2800 mm e 6 fases, conforme a foto do plugin. Os limites de sobra de 200 × 400 mm são uma sugestão configurável. Refilo interno, resto de fase, pinças e acabamento manual ainda não são simulados. O plano exige conferência do operador.</div>`,
    "Regras de corte",
    "Uma sequência passante, com as peças e o sentido do veio preservados.",
  );
  $("#machine-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = new FormData(event.target),
        body = Object.fromEntries(data);
      for (const k of [
        "serra",
        "corteMaximo",
        "fases",
        "minimoRetalhoLargura",
        "minimoRetalhoComprimento",
      ])
        body[k] = num(data, k);
      await api("/api/maquina", "PUT", { ...body, versao: m.versao });
      await refreshStock();
      renderMachine();
      toast("Regras salvas para os próximos planos.");
    } catch (e) {
      toast(e.message);
    }
  };
}
async function renderTeam() {
  const users = (await api("/api/equipe")).dados;
  shell(
    `<section class="card"><div class="row between"><h2>Pessoas da empresa</h2><button class="primary" id="add-user">+ Cadastrar pessoa</button></div><div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td></tr>`).join("")}</tbody></table></div><p class="muted">Planejador pode editar e aprovar. Operador consulta planos, imprime e baixa o JSON aprovado. O administrador também gerencia pessoas e regras de corte.</p></section>`,
    "Equipe",
  );
  click("add-user", () =>
    dialog(
      "Cadastrar pessoa",
      `<div class="grid">${field("nome", "Nome", "", "text", "required")}${field("email", "E-mail", "", "email", "required")}${field("senha", "Senha inicial", "", "password", 'required minlength="10" maxlength="128"')}${select(
        "perfil",
        "Perfil",
        [
          ["planejador", "Planejador"],
          ["operador", "Operador"],
        ],
        "planejador",
      )}</div><p class="muted">Entregue a senha à pessoa diretamente. Ela poderá alterá-la na conta.</p>`,
      async (data) => {
        await api("/api/equipe", "POST", Object.fromEntries(data));
        await renderTeam();
      },
    ),
  );
}
function renderAccount() {
  shell(
    `<section class="card"><h2>${esc(state.user.name)}</h2><p>${esc(state.user.email)} · ${esc(state.user.company)}</p><form id="password-form"><div class="grid">${field("atual", "Senha atual", "", "password", 'required autocomplete="current-password"')}${field("nova", "Nova senha", "", "password", 'required minlength="10" maxlength="128" autocomplete="new-password"')}</div><div class="actions"><button class="primary">Alterar senha</button><button type="button" id="account-logout">Sair da conta</button></div></form></section>`,
    "Minha conta",
  );
  $("#password-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api(
        "/api/auth/password",
        "PUT",
        Object.fromEntries(new FormData(event.target)),
      );
      state.user = null;
      renderAuth();
      toast("Senha alterada. Entre novamente.");
    } catch (e) {
      toast(e.message);
    }
  };
  click("account-logout", async () => {
    await api("/api/auth/logout", "POST");
    state.user = null;
    renderAuth();
  });
}
function optimizeDialog() {
  const stocks = state.materials.filter((m) =>
    state.pieces.some((p) => key(p) === key(m)),
  );
  dialog(
    "Otimizar automaticamente",
    `<p>As chapas foram obtidas do XML e dos cadastros existentes. O cálculo usa primeiro as sobras disponíveis compatíveis e depois chapas novas.</p><ul>${stocks.map((m) => `<li>${esc(m.acabamento)} · ${m.espessura} mm · ${m.comprimento} × ${m.largura} mm</li>`).join("")}</ul>${field("tentativas", "Alternativas de busca", 80, "number", 'required min="1" max="200" step="1"')}<p class="muted">O sistema salva a melhor alternativa encontrada. Depois você pode ajustar manualmente e baixar o plano em PDF.</p>`,
    async (data) => {
      const result = (
        await api(path() + "/otimizar", "POST", {
          tentativas: num(data, "tentativas"),
          confirmado: true,
        })
      ).dados;
      await loadProject();
      openPlan(result);
    },
    "Gerar plano de corte",
  );
}
async function startManual() {
  await api(path() + "/preparar-chapas", "POST", {});
  await refreshStock();
  const groups = [...new Map(state.pieces.map((p) => [key(p), p])).values()];
  const boards = groups.map((p, i) => {
    const stock = state.materials.find((m) => key(m) === key(p));
    if (!stock)
      throw new Error("Não foi encontrada a chapa de " + p.acabamento);
    return {
      id: "chapa-" + (i + 1),
      stock: { ...structuredClone(stock), source: "material" },
      pieces: [],
    };
  });
  state.draft = {
    projectVersion: state.project.versao,
    machine: structuredClone(state.machine),
    boards,
    status: "revisao",
  };
  state.board = 0;
  state.selected = null;
  state.dirty = true;
  state.undo = [];
  state.redo = [];
  state.cut = null;
  renderEditor();
}
function openPlan(plan) {
  if (!allowLeave()) return;
  if (!Array.isArray(plan?.boards) || !plan.boards.length || !plan.machine) {
    toast("Este plano antigo não tem o desenho completo. Gere um novo plano.");
    return;
  }
  state.draft = structuredClone(plan);
  state.board = 0;
  state.selected = null;
  state.dirty = false;
  state.undo = [];
  state.redo = [];
  state.cut = null;
  renderEditor();
}
function checkpoint() {
  state.undo.push(structuredClone(state.draft.boards));
  if (state.undo.length > 30) state.undo.shift();
  state.redo = [];
  state.dirty = true;
  state.cut = null;
}
function annotate() {
  const report = buildReport(
    state.draft,
    state.draft.projetoSnapshot || state.project,
    state.pieces,
    state.user.company,
  );
  if (report) state.draft.boards = report.boards;
}
function canEditPlan() {
  return (
    editable() &&
    !state.draft.retalhosRegistrados &&
    state.draft.projectVersion === state.project.versao
  );
}
function renderEditor() {
  annotate();
  const p = state.draft,
    board = p.boards[state.board],
    metrics = p.metrics,
    can = canEditPlan(),
    used = new Set(p.boards.flatMap((b) => b.pieces.map((p) => p.unitId))),
    missing = units().filter((p) => !used.has(p.unitId)),
    selected = board?.pieces.find((p) => p.unitId === state.selected),
    original = units().find((p) => p.unitId === selected?.unitId);
  const report =
    !state.dirty && p.id
      ? buildReport(
          p,
          p.projetoSnapshot || state.project,
          state.pieces,
          state.user.company,
        )
      : null;
  shell(
    `<div class="row between no-print"><button id="back-detail">← Peças e histórico</button><div class="row">${can ? `<button id="undo" ${state.undo.length ? "" : "disabled"}>Desfazer</button><button id="redo" ${state.redo.length ? "" : "disabled"}>Refazer</button><button id="save-plan" class="primary">Validar e salvar</button>` : ""}<span class="tag ${state.dirty ? "warn" : ""}">${state.dirty ? "Alterações não validadas" : p.retalhosRegistrados ? "Produção confirmada" : p.status === "aprovado" ? "Revisão aprovada" : "Em revisão"}</span></div></div>${state.dirty ? '<div class="notice no-print">As posições foram alteradas. Valide e salve para reconstruir a sequência de cortes e atualizar os indicadores.</div>' : ""}${p.projectVersion !== state.project.versao ? '<div class="notice no-print">Este plano pertence a uma revisão anterior das peças. Ele serve para consulta. Gere um novo plano.</div>' : ""}${metrics ? `<div class="stats no-print" style="margin-top:15px"><div class="stat"><span>Chapas novas</span><strong>${metrics.chapasNovas}</strong></div><div class="stat"><span>Aproveitamento${state.dirty ? " salvo" : ""}</span><strong>${fmt(metrics.aproveitamento)}%</strong></div><div class="stat"><span>Maior sobra útil${state.dirty ? " salva" : ""}</span><strong>${fmt(metrics.maiorRetalho / 1e6, 3)} m²</strong></div><div class="stat"><span>Custo de chapas${state.dirty ? " salvo" : ""}</span><strong>${money(metrics.custoChapas)}</strong></div></div>` : ""}<section class="card no-print"><div class="row editor-controls"><label style="flex:1">Chapa<select id="board-select">${p.boards.map((b, i) => `<option value="${i}" ${state.board === i ? "selected" : ""}>${i + 1} · ${esc(b.stock.acabamento)} ${b.stock.espessura} mm · ${b.stock.source === "scrap" ? "Sobra " + esc(b.stock.codigo) : "Nova"}</option>`).join("")}</select></label>${can ? '<button id="add-board">+ Chapa / sobra</button><button id="remove-board">Remover chapa vazia</button>' : ""}</div><div class="editor-layout" style="margin-top:16px"><div>${board ? `<div class="row between"><h3>${fmt(board.stock.comprimento)} × ${fmt(board.stock.largura)} mm</h3><small>Desenho em cm · posição X/Y em mm · sobras brancas</small></div><div class="canvas">${drawBoard(board, state.selected, !state.dirty && state.cut?.chapa === board.id ? state.cut : null, esc, { showRemnants: !state.dirty })}</div>` : '<div class="empty canvas">Adicione uma chapa para começar.</div>'}${missing.length ? `<h3 style="margin-top:15px">Unidades sem posição (${missing.length})</h3><div class="tray">${missing.map((p) => `<button data-place="${esc(p.unitId)}" ${can && board && key(p) === key(board.stock) ? "" : "disabled"} title="${esc(p.descricao)}">${esc(p.codigo)} · ${fmt(p.largura)} × ${fmt(p.comprimento)}</button>`).join("")}</div>` : '<p class="muted" style="margin-top:12px">Todas as unidades estão posicionadas.</p>'}</div><aside class="inspector"><h3>Peça selecionada</h3>${
      selected
        ? `<p><strong>${esc(selected.codigo)}</strong><br>${esc(selected.descricao)}<br>${fmt(selected.w)} × ${fmt(selected.h)} mm</p>${
            can
              ? `<form id="position-form">${field("x", "X (mm)", selected.x, "number", 'step="0.001" required')}${field("y", "Y (mm)", selected.y, "number", 'step="0.001" required')}<button type="submit">Aplicar posição</button></form><div class="actions"><button id="rotate" ${original?.giroPermitido ? "" : "disabled"}>Girar 90°</button><button id="unplace">Retirar da chapa</button></div><div style="margin-top:12px">${select(
                  "destination",
                  "Mover para outra chapa",
                  p.boards
                    .filter(
                      (b) =>
                        b.id !== board.id && key(b.stock) === key(board.stock),
                    )
                    .map((b) => [b.id, b.id]),
                  "",
                )}<button id="transfer" style="margin-top:8px">Transferir</button></div>`
              : "<p>Consulta do plano.</p>"
          }`
        : '<p class="muted">Toque em uma peça. Para ajustar, arraste ou informe X e Y.</p>'
    }<hr><small>Dimensões das peças não são alteradas pelo editor. O giro segue a permissão da lista de peças.</small></aside></div></section>${!state.dirty && p.steps ? `<section class="card no-print"><div class="row between"><h2>Sequência de cortes internos</h2><button id="clear-cut">Limpar destaque</button></div><p class="muted">Cortes passantes no bloco indicado; as posições são coordenadas do desenho original. Refilos externos não estão incluídos nestes passos.</p><div class="steps">${p.steps.map((s, i) => `<button data-step="${i}">${i + 1}. ${esc(s.chapa)} · ${s.eixo === "x" ? "Vertical (X)" : "Horizontal (Y)"} em ${fmt(s.posicao)} mm · bloco ${fmt(s.bloco.w)} × ${fmt(s.bloco.h)} mm · fase ${s.fase}</button>`).join("")}</div></section>` : ""}<section class="card no-print"><h2>Revisão e saída</h2><p>Confira o plano com o operador. A aprovação registra sua revisão das regras implementadas; os parâmetros específicos da Titanium ainda precisam ser validados.</p><div class="actions">${can && !state.dirty && p.id ? `<button id="approve" class="primary">Aprovar revisão</button>${p.status === "aprovado" ? '<button id="release">Retornar à revisão</button>' : ""}` : ""}<button id="download-pdf" class="primary" ${state.dirty || !p.id ? "disabled" : ""}>Baixar plano de corte PDF</button><button id="print-plan" ${state.dirty || !p.id ? "disabled" : ""}>Imprimir plano</button><button id="export-plan" ${state.dirty || p.status !== "aprovado" ? "disabled" : ""}>Baixar JSON do plano</button>${editable() && !state.dirty && p.status === "aprovado" && !p.retalhosRegistrados ? '<button id="register-scraps">Confirmar produção e registrar sobras</button>' : ""}<button disabled title="Aguardando arquivo real e validação da integração">Exportar Titanium .lote · pendente</button></div><p class="muted">O JSON é o formato interno de revisão do sistema. Não é um programa de corte para a máquina.</p></section>${report ? `<details id="report-preview" class="report-preview no-print" open><summary>Plano de corte · Chapa ${state.board + 1} de ${report.boards.length}</summary>${reportSections({ ...report, boards: [report.boards[state.board]] }, "screen")}</details><div id="print-area" class="print-only">${reportSections(report, "print")}</div>` : ""}`,
    "Editor de chapas",
    state.project.nome,
  );
  click("back-detail", () => {
    if (!allowLeave()) return;
    state.dirty = false;
    renderProject();
  });
  if ($("#board-select"))
    $("#board-select").onchange = (e) => {
      state.board = Number(e.target.value);
      state.selected = null;
      state.cut = null;
      renderEditor();
    };
  click("add-board", addBoard);
  click("remove-board", () => {
    if (board?.pieces.length)
      throw new Error("Retire ou transfira as peças antes de remover a chapa.");
    if (board) {
      checkpoint();
      p.boards.splice(state.board, 1);
      state.board = Math.max(0, state.board - 1);
      renderEditor();
    }
  });
  click("undo", () => {
    state.redo.push(structuredClone(p.boards));
    p.boards = state.undo.pop();
    state.dirty = true;
    state.board = Math.max(0, Math.min(state.board, p.boards.length - 1));
    state.cut = null;
    renderEditor();
  });
  click("redo", () => {
    state.undo.push(structuredClone(p.boards));
    p.boards = state.redo.pop();
    state.dirty = true;
    state.board = Math.max(0, Math.min(state.board, p.boards.length - 1));
    state.cut = null;
    renderEditor();
  });
  if (board && can)
    setupDrag(
      $("#board-svg"),
      board,
      (id) => {
        state.selected = id;
        renderEditor();
      },
      (id, x, y) => {
        const piece = board.pieces.find((q) => q.unitId === id);
        if (piece.x !== x || piece.y !== y) {
          checkpoint();
          piece.x = x;
          piece.y = y;
        }
        state.selected = id;
      },
    );
  else
    document.querySelectorAll("[data-unit]").forEach(
      (el) =>
        (el.onclick = () => {
          state.selected = el.dataset.unit;
          renderEditor();
        }),
    );
  document.querySelectorAll("[data-place]").forEach(
    (el) =>
      (el.onclick = () => {
        const o = units().find((q) => q.unitId === el.dataset.place);
        const position = freePosition(board, o, p.machine);
        if (!position) {
          toast(
            "Essa peça não cabe em uma posição livre nesta chapa. Adicione outra chapa ou ajuste as posições.",
          );
          return;
        }
        checkpoint();
        board.pieces.push({ unitId: o.unitId, ...position });
        state.selected = o.unitId;
        renderEditor();
      }),
  );
  if ($("#position-form"))
    $("#position-form").onsubmit = (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      checkpoint();
      selected.x = num(data, "x");
      selected.y = num(data, "y");
      renderEditor();
    };
  click("rotate", () => {
    checkpoint();
    [selected.w, selected.h] = [selected.h, selected.w];
    renderEditor();
  });
  click("unplace", () => {
    checkpoint();
    board.pieces = board.pieces.filter((q) => q.unitId !== selected.unitId);
    state.selected = null;
    renderEditor();
  });
  click("transfer", () => {
    const target = p.boards.find((b) => b.id === $("[name=destination]").value);
    if (!target) throw new Error("Adicione outra chapa do mesmo material.");
    checkpoint();
    board.pieces = board.pieces.filter((q) => q.unitId !== selected.unitId);
    target.pieces.push({
      ...selected,
      x: target.stock.refilos.esquerda,
      y: target.stock.refilos.superior,
    });
    state.board = p.boards.indexOf(target);
    renderEditor();
  });
  click("save-plan", savePlan);
  click("approve", async () => {
    if (
      confirm(
        "Confirmar que você revisou as peças, dimensões e sequência com os critérios configurados?",
      )
    ) {
      const result = (
        await api(path() + `/planos/${p.id}/aprovar`, "POST", {
          versao: p.versao,
        })
      ).dados;
      await loadProject();
      openPlan(result);
      toast("Revisão aprovada.");
    }
  });
  click("release", async () => {
    const result = (
      await api(path() + `/planos/${p.id}/liberar`, "POST", {
        versao: p.versao,
      })
    ).dados;
    await loadProject();
    openPlan(result);
  });
  click("print-plan", () => window.print());
  click("download-pdf", async () => {
    const response = await fetch(path() + `/planos/${p.id}/relatorio.pdf`, {
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error(
        (await response.json()).erro || "Não foi possível gerar o PDF.",
      );
    const url = URL.createObjectURL(await response.blob()),
      a = document.createElement("a");
    a.href = url;
    a.download = `plano-de-corte-${state.project.pedido || p.id}.pdf`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  click("export-plan", async () => {
    const response = await fetch(path() + `/planos/${p.id}/exportar`);
    if (!response.ok) throw new Error((await response.json()).erro);
    const url = URL.createObjectURL(await response.blob()),
      a = document.createElement("a");
    a.href = url;
    a.download = `plano-${p.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  click("register-scraps", () =>
    dialog(
      "Confirmar produção",
      `<p>Use esta ação somente depois dos cortes físicos. Ela consome sobras reservadas, cadastra as sobras úteis calculadas e bloqueia a edição deste plano.</p>${field("local", "Local para guardar as novas sobras", "", "text", "required")}<label class="check"><input type="checkbox" required>O plano foi produzido e conferi as sobras na oficina.</label>`,
      async (data) => {
        await api(path() + `/planos/${p.id}/retalhos`, "POST", {
          versao: p.versao,
          produzidos: true,
          local: data.get("local"),
        });
        await loadProject();
        openPlan(state.plans.find((q) => q.id === p.id));
        toast("Produção confirmada e sobras registradas.");
      },
      "Confirmar produção",
    ),
  );
  document.querySelectorAll("[data-step]").forEach(
    (el) =>
      (el.onclick = () => {
        state.cut = p.steps[Number(el.dataset.step)];
        state.board = p.boards.findIndex((b) => b.id === state.cut.chapa);
        renderEditor();
      }),
  );
  click("clear-cut", () => {
    state.cut = null;
    renderEditor();
  });
}
function freePosition(board, original, machine) {
  const r = board.stock.refilos,
    k = machine.serra,
    maxX = board.stock.comprimento - r.direita,
    maxY = board.stock.largura - r.inferior;
  const xs = [r.esquerda, ...board.pieces.map((p) => p.x + p.w + k)].sort(
      (a, b) => a - b,
    ),
    ys = [r.superior, ...board.pieces.map((p) => p.y + p.h + k)].sort(
      (a, b) => a - b,
    ),
    shapes = [
      { w: original.largura, h: original.comprimento },
      ...(original.giroPermitido
        ? [{ w: original.comprimento, h: original.largura }]
        : []),
    ];
  for (const y of ys)
    for (const x of xs)
      for (const shape of shapes)
        if (
          x + shape.w <= maxX &&
          y + shape.h <= maxY &&
          board.pieces.every(
            (q) =>
              x + shape.w + k <= q.x ||
              q.x + q.w + k <= x ||
              y + shape.h + k <= q.y ||
              q.y + q.h + k <= y,
          )
        )
          return { x, y, ...shape };
  return null;
}
function addBoard() {
  const p = state.draft,
    used = new Set(
      p.boards.filter((b) => b.stock.source === "scrap").map((b) => b.stock.id),
    ),
    stocks = [
      ...state.materials.map((s) => ({ ...s, source: "material" })),
      ...state.scraps
        .filter(
          (s) =>
            (s.status === "disponivel" || s.reservadoPor === p.id) &&
            !used.has(s.id),
        )
        .map((s) => ({ ...s, source: "scrap" })),
    ].filter((s) => state.pieces.some((q) => key(q) === key(s)));
  if (!stocks.length) {
    toast(
      "Cadastre uma chapa compatível com o material, acabamento e espessura das peças.",
    );
    return;
  }
  dialog(
    "Adicionar chapa ou sobra",
    `${select(
      "stock",
      "Material disponível",
      stocks.map((s, i) => [
        i,
        `${s.source === "scrap" ? "Sobra " + s.codigo : "Chapa nova"} · ${s.acabamento} ${s.espessura} mm · ${s.comprimento} × ${s.largura}`,
      ]),
      0,
    )}<p class="muted">A orientação do eixo da sobra permanece igual à da chapa que a gerou.</p>`,
    async (data) => {
      checkpoint();
      p.boards.push({
        id: "chapa-" + crypto.randomUUID().slice(0, 8),
        stock: structuredClone(stocks[num(data, "stock")]),
        pieces: [],
      });
      state.board = p.boards.length - 1;
      state.selected = null;
      renderEditor();
    },
    "Adicionar",
  );
}
async function savePlan() {
  const p = state.draft,
    body = {
      projectVersion: p.projectVersion,
      versao: p.versao,
      boards: p.boards.map((b) => ({
        id: b.id,
        source: b.stock.source,
        sourceId: b.stock.id,
        pieces: b.pieces.map((q) => ({
          unitId: q.unitId,
          x: q.x,
          y: q.y,
          w: q.w,
          h: q.h,
        })),
      })),
    };
  const result = (
    await api(
      path() + (p.id ? `/planos/${p.id}` : "/planos/manual"),
      p.id ? "PUT" : "POST",
      body,
    )
  ).dados;
  state.dirty = false;
  await loadProject();
  openPlan(result);
  toast("Plano salvo com sequência de cortes reconstruída.");
}
window.addEventListener("beforeunload", (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
try {
  await boot();
} catch (e) {
  renderAuth();
}
