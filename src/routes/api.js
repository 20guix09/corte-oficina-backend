import { randomUUID, randomBytes } from "node:crypto";
import { Worker } from "node:worker_threads";
import { ApiError, ensure } from "../errors.js";
import * as v from "../validation.js";
import {
  email,
  hashPassword,
  checkPassword,
  tokenHash,
  sessionCookie,
  authenticate,
} from "../auth.js";
import { parsePromob } from "../xml.js";
import { validatePlan } from "../engine.js";

export function registerApi(app, store, { secureCookie }) {
  function loginSession(res, userId) {
    const token = randomBytes(32).toString("hex");
    store.accounts.clearExpired(Date.now());
    store.accounts.addSession(tokenHash(token), userId, Date.now() + 28800000);
    res.set("Set-Cookie", sessionCookie(token, secureCookie));
    return token;
  }
  app.post("/api/auth/register", async (req, res) => {
    const body = v.object(req.body),
      address = email(body.email),
      name = v.text(body.nome, "Nome"),
      companyName = v.text(body.empresa, "Empresa");
    ensure(!store.accounts.findByEmail(address), "E-mail já cadastrado.", 409);
    const password = await hashPassword(body.senha),
      company = randomUUID(),
      userId = randomUUID();
    store.transaction(() => {
      ensure(
        !store.accounts.findByEmail(address),
        "E-mail já cadastrado.",
        409,
      );
      store.accounts.createCompany(company, companyName);
      store.accounts.createUser(
        userId,
        company,
        name,
        address,
        password,
        "admin",
      );
      store.create(company, "machine", {
        nome: "SCM Titanium — conferir parâmetros",
        serra: 5,
        corteMaximo: 2800,
        fases: 6,
        minimoRetalhoLargura: 200,
        minimoRetalhoComprimento: 400,
      });
    });
    loginSession(res, userId);
    res.status(201).json({ mensagem: "Empresa criada." });
  });
  app.post("/api/auth/login", async (req, res) => {
    const body = v.object(req.body),
      address = email(body.email);
    const user = store.accounts.findByEmail(address);
    ensure(
      user && (await checkPassword(body.senha, user.password)),
      "E-mail ou senha incorretos.",
      401,
    );
    loginSession(res, user.id);
    res.json({ mensagem: "Sessão iniciada." });
  });
  app.use("/api", (req, res, next) => {
    const auth = authenticate(store, req);
    req.user = auth.user;
    req.sessionToken = auth.token;
    next();
  });
  app.get("/api/auth/me", (req, res) => res.json({ dados: req.user }));
  app.post("/api/auth/logout", (req, res) => {
    store.accounts.removeSession(tokenHash(req.sessionToken));
    res.set("Set-Cookie", sessionCookie("", secureCookie)).status(204).end();
  });
  function edit(req, res, next) {
    ensure(
      ["admin", "planejador"].includes(req.user.role),
      "Seu perfil permite apenas consulta.",
      403,
    );
    next();
  }
  function admin(req, res, next) {
    ensure(
      req.user.role === "admin",
      "Apenas o administrador pode executar esta ação.",
      403,
    );
    next();
  }
  const company = (req) => req.user.company_id;
  function project(req) {
    return store.get(company(req), "project", req.params.id);
  }
  function lines(req) {
    return store.list(company(req), "piece", req.params.id);
  }
  function writable(req) {
    project(req);
    ensure(
      !store
        .list(company(req), "plan", req.params.id)
        .some((p) => p.retalhosRegistrados),
      "Produção já confirmada. Crie outro projeto para novas peças.",
      409,
    );
  }
  function plan(req) {
    project(req);
    const result = store.get(company(req), "plan", req.params.planId);
    ensure(
      result.projetoId === req.params.id,
      "Plano não encontrado neste projeto.",
      404,
    );
    return result;
  }
  function assertCurrent(req, record) {
    ensure(
      record.projectVersion === project(req).versao,
      "As peças do projeto mudaram. Gere um novo plano.",
      409,
    );
  }
  app.get("/api/projetos", (req, res) =>
    res.json({ dados: store.list(company(req), "project") }),
  );
  app.post("/api/projetos", edit, (req, res) =>
    res
      .status(201)
      .json({
        dados: store.create(company(req), "project", v.project(req.body)),
      }),
  );
  app.get("/api/projetos/:id", (req, res) => res.json({ dados: project(req) }));
  app.put("/api/projetos/:id", edit, (req, res) => {
    writable(req);
    res.json({
      dados: store.transaction(() => {
        const result = store.update(
          company(req),
          "project",
          req.params.id,
          v.project(req.body),
          req.body.versao,
        );
        for (const record of store.list(company(req), "plan", req.params.id))
          if (record.status === "aprovado" && !record.retalhosRegistrados) {
            releaseScraps(company(req), record);
            store.update(
              company(req),
              "plan",
              record.id,
              { ...record, status: "revisao" },
              record.versao,
            );
          }
        return result;
      }),
    });
  });
  function releaseScraps(companyId, record) {
    for (const scrap of store.list(companyId, "scrap"))
      if (scrap.reservadoPor === record.id && scrap.status === "reservado")
        store.update(
          companyId,
          "scrap",
          scrap.id,
          { ...scrap, status: "disponivel", reservadoPor: null },
          scrap.versao,
        );
  }
  function invalidateProject(req) {
    for (const record of store.list(company(req), "plan", req.params.id))
      if (record.status === "aprovado" && !record.retalhosRegistrados) {
        releaseScraps(company(req), record);
        store.update(
          company(req),
          "plan",
          record.id,
          { ...record, status: "revisao" },
          record.versao,
        );
      }
    return store.touchProject(company(req), req.params.id);
  }
  app.delete("/api/projetos/:id", edit, (req, res) => {
    project(req);
    store.transaction(() => {
      for (const record of store.list(company(req), "plan", req.params.id))
        releaseScraps(company(req), record);
      store.remove(
        company(req),
        "project",
        req.params.id,
        Number(req.query.versao),
      );
    });
    res.status(204).end();
  });
  app.get("/api/projetos/:id/pecas", (req, res) => {
    project(req);
    res.json({ dados: lines(req) });
  });
  app.post("/api/projetos/:id/pecas", edit, (req, res) => {
    writable(req);
    const input = v.piece(req.body);
    const result = store.transaction(() => {
      const current = lines(req);
      ensure(
        current.reduce((n, p) => n + p.quantidade, 0) + input.quantidade <= 500,
        "Projeto excede 500 unidades.",
      );
      const piece = store.create(
        company(req),
        "piece",
        { ...input, projetoId: req.params.id },
        req.params.id,
      );
      invalidateProject(req);
      return piece;
    });
    res.status(201).json({ dados: result });
  });
  app.put("/api/projetos/:id/pecas/:pieceId", edit, (req, res) => {
    writable(req);
    const existing = store.get(company(req), "piece", req.params.pieceId);
    ensure(
      existing.projetoId === req.params.id,
      "Peça não encontrada neste projeto.",
      404,
    );
    const input = v.piece(req.body);
    const result = store.transaction(() => {
      ensure(
        lines(req)
          .filter((p) => p.id !== existing.id)
          .reduce((n, p) => n + p.quantidade, 0) +
          input.quantidade <=
          500,
        "Projeto excede 500 unidades.",
      );
      const piece = store.update(
        company(req),
        "piece",
        existing.id,
        { ...input, projetoId: req.params.id },
        req.body.versao,
      );
      invalidateProject(req);
      return piece;
    });
    res.json({ dados: result });
  });
  app.delete("/api/projetos/:id/pecas/:pieceId", edit, (req, res) => {
    writable(req);
    const existing = store.get(company(req), "piece", req.params.pieceId);
    ensure(
      existing.projetoId === req.params.id,
      "Peça não encontrada neste projeto.",
      404,
    );
    store.transaction(() => {
      store.remove(
        company(req),
        "piece",
        existing.id,
        Number(req.query.versao),
      );
      invalidateProject(req);
    });
    res.status(204).end();
  });
  app.post("/api/projetos/:id/importar", edit, (req, res) => {
    writable(req);
    const current = project(req);
    ensure(
      current.versao === req.body.versao,
      "O projeto mudou. Recarregue.",
      409,
    );
    const parsed = parsePromob(req.body.xml);
    ensure(
      lines(req).length === 0 || req.body.substituir === true,
      "O projeto já tem peças. Confirme a substituição.",
      409,
    );
    store.transaction(() => {
      for (const old of lines(req))
        store.remove(company(req), "piece", old.id, old.versao);
      for (const p of parsed)
        store.create(
          company(req),
          "piece",
          { ...p, projetoId: req.params.id },
          req.params.id,
        );
      invalidateProject(req);
    });
    res.json({
      linhas: parsed.length,
      unidades: parsed.reduce((n, p) => n + p.quantidade, 0),
      aviso: "Giros bloqueados até conferência. Confira 1830/1850 mm e bordas.",
    });
  });
  const resources = [
    ["materiais", "material", v.material],
    ["retalhos", "scrap", v.scrap],
  ];
  for (const [path, kind, validate] of resources) {
    app.get(`/api/${path}`, (req, res) =>
      res.json({ dados: store.list(company(req), kind) }),
    );
    app.post(`/api/${path}`, edit, (req, res) =>
      res
        .status(201)
        .json({ dados: store.create(company(req), kind, validate(req.body)) }),
    );
    app.put(`/api/${path}/:resourceId`, edit, (req, res) => {
      const old = store.get(company(req), kind, req.params.resourceId);
      ensure(
        kind !== "scrap" || old.status === "disponivel",
        "Retalho reservado ou utilizado. Libere o plano antes.",
        409,
      );
      res.json({
        dados: store.update(
          company(req),
          kind,
          old.id,
          validate(req.body),
          req.body.versao,
        ),
      });
    });
    app.delete(`/api/${path}/:resourceId`, edit, (req, res) => {
      const old = store.get(company(req), kind, req.params.resourceId);
      ensure(
        kind !== "scrap" || old.status === "disponivel",
        "Retalho reservado ou utilizado.",
        409,
      );
      store.remove(company(req), kind, old.id, Number(req.query.versao));
      res.status(204).end();
    });
  }
  app.get("/api/maquina", (req, res) =>
    res.json({ dados: store.list(company(req), "machine")[0] }),
  );
  app.put("/api/maquina", admin, (req, res) => {
    const old = store.list(company(req), "machine")[0];
    res.json({
      dados: store.update(
        company(req),
        "machine",
        old.id,
        v.machine(req.body),
        req.body.versao,
      ),
    });
  });
  app.get("/api/equipe", admin, (req, res) =>
    res.json({ dados: store.accounts.listUsers(company(req)) }),
  );
  app.post("/api/equipe", admin, async (req, res) => {
    const body = v.object(req.body),
      address = email(body.email);
    ensure(
      ["planejador", "operador"].includes(body.perfil),
      "Perfil inválido.",
    );
    const password = await hashPassword(body.senha);
    const name = v.text(body.nome, "Nome");
    ensure(!store.accounts.findByEmail(address), "E-mail já cadastrado.", 409);
    store.accounts.createUser(
      randomUUID(),
      company(req),
      name,
      address,
      password,
      body.perfil,
    );
    res
      .status(201)
      .json({
        mensagem: "Usuário cadastrado. Entregue a senha diretamente a ele.",
      });
  });
  app.put("/api/auth/password", async (req, res) => {
    const body = v.object(req.body),
      user = { password: store.accounts.getPassword(req.user.id) };
    ensure(
      await checkPassword(body.atual, user.password),
      "Senha atual incorreta.",
      401,
    );
    const password = await hashPassword(body.nova);
    store.transaction(() => {
      store.accounts.updatePassword(req.user.id, password);
      store.accounts.removeUserSessions(req.user.id);
    });
    res
      .set("Set-Cookie", sessionCookie("", secureCookie))
      .json({ mensagem: "Senha alterada. Entre novamente." });
  });
  const busy = new Set(),
    workers = new Set();
  function calculate(input) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("../optimizer-worker.js", import.meta.url),
        { workerData: input },
      );
      workers.add(worker);
      const timer = setTimeout(() => {
        worker.terminate();
        reject(
          new ApiError(408, "Tempo de cálculo excedido. Reduza o projeto."),
        );
      }, 15000);
      function cleanup() {
        clearTimeout(timer);
        workers.delete(worker);
      }
      worker.once("message", (message) => {
        cleanup();
        if (message.error) reject(new ApiError(422, message.error));
        else resolve(message.result);
      });
      worker.once("error", (error) => {
        cleanup();
        reject(error);
      });
      worker.once("exit", (code) => {
        cleanup();
        if (code !== 0)
          reject(new ApiError(500, "O cálculo foi interrompido."));
      });
    });
  }
  app.get("/api/projetos/:id/planos", (req, res) => {
    project(req);
    res.json({ dados: store.list(company(req), "plan", req.params.id) });
  });
  app.post("/api/projetos/:id/otimizar", edit, async (req, res) => {
    writable(req);
    const current = project(req),
      companyId = company(req);
    ensure(
      !busy.has(companyId),
      "Há um cálculo em andamento nesta empresa.",
      409,
    );
    ensure(
      req.body.confirmado === true,
      "Confirme dimensões, refilos e orientação antes de calcular.",
    );
    const machine = store.list(companyId, "machine")[0];
    const input = {
      lines: lines(req),
      materials: store.list(companyId, "material"),
      scraps: store.list(companyId, "scrap"),
      machine,
      attempts: v.integer(req.body.tentativas ?? 40, "Tentativas", 1, 200),
    };
    busy.add(companyId);
    try {
      const result = await calculate(input);
      ensure(
        project(req).versao === current.versao,
        "Peças alteradas durante o cálculo. Tente novamente.",
        409,
      );
      const record = store.create(
        companyId,
        "plan",
        {
          ...result,
          projetoId: current.id,
          projectVersion: current.versao,
          status: "revisao",
          autor: req.user.name,
        },
        current.id,
      );
      res.status(201).json({ dados: record });
    } finally {
      busy.delete(companyId);
    }
  });
  app.post("/api/projetos/:id/planos/manual", edit, (req, res) => {
    writable(req);
    const current = project(req);
    ensure(
      current.versao === req.body.projectVersion,
      "O projeto mudou. Recarregue.",
      409,
    );
    ensure(
      Array.isArray(req.body.boards) && req.body.boards.length <= 500,
      "Informe até 500 chapas.",
    );
    const machine = store.list(company(req), "machine")[0];
    const boards = req.body.boards.map((b) => {
      v.object(b);
      ensure(
        Array.isArray(b.pieces) && b.pieces.length <= 500,
        "Informe até 500 posições por chapa.",
      );
      b.pieces.forEach(v.object);
      ensure(
        ["material", "scrap"].includes(b.source),
        "Origem de chapa inválida.",
      );
      const stock = store.get(company(req), b.source, b.sourceId);
      ensure(
        b.source !== "scrap" || stock.status === "disponivel",
        "Retalho indisponível.",
        409,
      );
      return {
        id: b.id,
        stock: { ...stock, source: b.source },
        pieces: b.pieces,
      };
    });
    const checked = validatePlan({ boards, machine }, lines(req));
    res
      .status(201)
      .json({
        dados: store.create(
          company(req),
          "plan",
          {
            ...checked,
            projetoId: current.id,
            projectVersion: current.versao,
            status: "revisao",
            autor: req.user.name,
          },
          current.id,
        ),
      });
  });
  app.put("/api/projetos/:id/planos/:planId", edit, (req, res) => {
    const original = plan(req);
    assertCurrent(req, original);
    ensure(
      !original.retalhosRegistrados,
      "Plano já produzido. Crie outro projeto para uma nova execução.",
      409,
    );
    ensure(
      Array.isArray(req.body.boards) && req.body.boards.length <= 500,
      "Informe até 500 chapas e posições.",
    );
    ensure(
      original.versao === req.body.versao,
      "Plano mudou. Recarregue.",
      409,
    );
    const materials = store.list(company(req), "material"),
      scraps = store.list(company(req), "scrap");
    const boards = req.body.boards.map((b) => {
      v.object(b);
      ensure(
        Array.isArray(b.pieces) && b.pieces.length <= 500,
        "Informe até 500 posições por chapa.",
      );
      b.pieces.forEach(v.object);
      const pool =
        b.source === "material"
          ? materials
          : b.source === "scrap"
            ? scraps
            : [];
      const stock = pool.find((s) => s.id === b.sourceId);
      ensure(stock, "Material ou retalho não encontrado.");
      ensure(
        b.source !== "scrap" ||
          stock.status === "disponivel" ||
          stock.reservadoPor === original.id,
        "Retalho reservado em outro plano.",
        409,
      );
      ensure(
        typeof b.id === "string" && b.id.length <= 100,
        "Identificação de chapa inválida.",
      );
      ensure(
        Array.isArray(b.pieces) && b.pieces.length <= 500,
        "Lista de posições inválida.",
      );
      return {
        id: b.id,
        stock: { ...stock, source: b.source },
        pieces: b.pieces.map((p) => ({
          unitId: p.unitId,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
        })),
      };
    });
    const checked = validatePlan({ ...original, boards }, lines(req));
    const result = store.transaction(() => {
      releaseScraps(company(req), original);
      if (original.status === "aprovado")
        store.update(
          company(req),
          "plan",
          original.id,
          { ...original, status: "revisao" },
          original.versao,
        );
      return store.create(
        company(req),
        "plan",
        {
          ...checked,
          status: "revisao",
          autor: req.user.name,
          origem: original.id,
        },
        req.params.id,
      );
    });
    res.status(201).json({ dados: result });
  });
  app.post("/api/projetos/:id/planos/:planId/aprovar", edit, (req, res) => {
    const record = plan(req);
    assertCurrent(req, record);
    ensure(record.versao === req.body.versao, "Plano mudou. Recarregue.", 409);
    ensure(
      !store
        .list(company(req), "plan", req.params.id)
        .some((p) => p.retalhosRegistrados),
      "Este projeto já teve a produção confirmada.",
      409,
    );
    const currentMachine = store.list(company(req), "machine")[0];
    ensure(
      currentMachine.versao === record.machine.versao,
      "Regras de corte alteradas. Gere um novo plano.",
      409,
    );
    for (const b of record.boards)
      if (b.stock.source === "material") {
        const m = store.get(company(req), "material", b.stock.id);
        ensure(
          m.versao === b.stock.versao,
          "Cadastro da chapa alterado. Recalcule ou salve outra revisão.",
          409,
        );
      }
    const checked = validatePlan(record, lines(req));
    const result = store.transaction(() => {
      for (const other of store.list(company(req), "plan", req.params.id))
        if (other.id !== record.id && other.status === "aprovado") {
          releaseScraps(company(req), other);
          store.update(
            company(req),
            "plan",
            other.id,
            { ...other, status: "revisao" },
            other.versao,
          );
        }
      for (const b of checked.boards)
        if (b.stock.source === "scrap") {
          const current = store.get(company(req), "scrap", b.stock.id);
          ensure(
            current.status === "disponivel" ||
              (current.status === "reservado" &&
                current.reservadoPor === record.id),
            "Retalho já reservado por outro trabalho.",
            409,
          );
          ensure(
            [
              "material",
              "acabamento",
              "espessura",
              "largura",
              "comprimento",
              "refilos",
            ].every(
              (k) => JSON.stringify(current[k]) === JSON.stringify(b.stock[k]),
            ),
            "O retalho foi alterado. Recalcule.",
            409,
          );
          store.update(
            company(req),
            "scrap",
            current.id,
            { ...current, status: "reservado", reservadoPor: record.id },
            current.versao,
          );
        }
      return store.update(
        company(req),
        "plan",
        record.id,
        {
          ...checked,
          status: "aprovado",
          aprovadoPor: req.user.name,
          aprovadoEm: new Date().toISOString(),
        },
        record.versao,
      );
    });
    res.json({ dados: result });
  });
  app.post("/api/projetos/:id/planos/:planId/liberar", edit, (req, res) => {
    const record = plan(req);
    ensure(!record.retalhosRegistrados, "Plano já produzido.", 409);
    const result = store.transaction(() => {
      releaseScraps(company(req), record);
      return store.update(
        company(req),
        "plan",
        record.id,
        { ...record, status: "revisao" },
        req.body.versao,
      );
    });
    res.json({ dados: result });
  });
  app.get("/api/projetos/:id/planos/:planId/exportar", (req, res) => {
    const record = plan(req);
    assertCurrent(req, record);
    ensure(
      record.status === "aprovado",
      "Aprove o plano antes de exportar.",
      409,
    );
    res
      .attachment(`plano-${record.id}.json`)
      .json({
        ...record,
        formato: "plano-interno-corte-oficina-v1",
        aviso:
          "Arquivo de revisão. Exportação Titanium .lote pendente de validação.",
      });
  });
  app.post("/api/projetos/:id/planos/:planId/retalhos", edit, (req, res) => {
    const record = plan(req);
    assertCurrent(req, record);
    ensure(record.versao === req.body.versao, "Plano mudou. Recarregue.", 409);
    ensure(record.status === "aprovado", "Aprove o plano primeiro.", 409);
    ensure(
      req.body.produzidos === true,
      "Confirme que os retalhos já existem fisicamente.",
    );
    ensure(
      !record.retalhosRegistrados,
      "Retalhos deste plano já registrados.",
      409,
    );
    v.text(req.body.local, "Local");
    const result = store.transaction(() => {
      const generated = [];
      for (const b of record.boards) {
        if (b.stock.source === "scrap") {
          const old = store.get(company(req), "scrap", b.stock.id);
          ensure(
            old.reservadoPor === record.id && old.status === "reservado",
            "Reserva do retalho foi alterada.",
            409,
          );
          store.update(
            company(req),
            "scrap",
            old.id,
            { ...old, status: "utilizado" },
            old.versao,
          );
        }
        for (const r of b.retalhos)
          if (
            Math.min(r.w, r.h) >= record.machine.minimoRetalhoLargura &&
            Math.max(r.w, r.h) >= record.machine.minimoRetalhoComprimento
          ) {
            generated.push(
              store.create(company(req), "scrap", {
                material: b.stock.material,
                acabamento: b.stock.acabamento,
                espessura: b.stock.espessura,
                comprimento: r.w,
                largura: r.h,
                refilos: { esquerda: 0, direita: 0, superior: 0, inferior: 0 },
                custo: 0,
                codigo: "R-" + randomUUID().slice(0, 8),
                local: v.text(req.body.local, "Local"),
                status: "disponivel",
                origem: record.id,
              }),
            );
          }
      }
      store.update(
        company(req),
        "plan",
        record.id,
        { ...record, retalhosRegistrados: true },
        req.body.versao,
      );
      return generated;
    });
    res.status(201).json({ dados: result });
  });
  return { close: () => Promise.all([...workers].map((w) => w.terminate())) };
}
