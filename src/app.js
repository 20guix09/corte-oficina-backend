import express from 'express';
import { randomUUID } from 'node:crypto';

const projectFields = ['nome', 'cliente', 'pedido', 'observacoes'];
const optionalFields = ['cliente', 'pedido', 'observacoes'];

function validateProject(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['O corpo deve ser um objeto JSON.'];
  }
  for (const field of Object.keys(body)) {
    if (!projectFields.includes(field)) errors.push(`Campo desconhecido: ${field}.`);
  }
  if (typeof body.nome !== 'string' || body.nome.trim().length === 0) {
    errors.push('Informe nome como um texto não vazio.');
  }
  for (const field of projectFields) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      if (field !== 'nome') errors.push(`${field} deve ser um texto.`);
      continue;
    }
    const maxLength = field === 'observacoes' ? 2000 : 200;
    if (value.trim().length > maxLength) errors.push(`${field} deve ter até ${maxLength} caracteres.`);
  }
  return errors;
}

function projectInput(body) {
  const input = { nome: body.nome.trim() };
  for (const field of optionalFields) input[field] = body[field]?.trim() ?? '';
  return input;
}

// Cada instância possui seu próprio armazenamento temporário.
export function createApp() {
  const app = express();
  const projects = new Map();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb', strict: false }));

  app.get('/', (req, res) => {
    res.json({
      nome: 'Corte Oficina API',
      versao: '0.1.0',
      etapa: 1,
      armazenamento: 'memoria',
      mensagem: 'Os projetos são apagados quando o servidor reinicia.',
      rotas: ['/health', '/api/projetos'],
    });
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/api/projetos', (req, res) => {
    res.json({ dados: [...projects.values()], total: projects.size });
  });

  app.post('/api/projetos', (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ erro: 'Envie Content-Type: application/json.' });
    }
    const errors = validateProject(req.body);
    if (errors.length) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors });
    const now = new Date().toISOString();
    const project = {
      id: randomUUID(),
      ...projectInput(req.body),
      status: 'rascunho',
      criadoEm: now,
      atualizadoEm: now,
    };
    projects.set(project.id, project);
    res.location(`/api/projetos/${project.id}`).status(201).json({ dados: project });
  });

  app.use('/api/projetos/:id', (req, res, next) => {
    const project = projects.get(req.params.id);
    if (!project) return res.status(404).json({ erro: 'Projeto não encontrado.' });
    res.locals.project = project;
    next();
  });

  app.get('/api/projetos/:id', (req, res) => res.json({ dados: res.locals.project }));

  // PUT substitui todos os campos editáveis; campos opcionais omitidos são limpos.
  app.put('/api/projetos/:id', (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ erro: 'Envie Content-Type: application/json.' });
    }
    const errors = validateProject(req.body);
    if (errors.length) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors });
    const project = {
      ...res.locals.project,
      ...projectInput(req.body),
      atualizadoEm: new Date().toISOString(),
    };
    projects.set(project.id, project);
    res.json({ dados: project });
  });

  app.delete('/api/projetos/:id', (req, res) => {
    projects.delete(res.locals.project.id);
    res.status(204).end();
  });

  app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ erro: 'O JSON deve ter até 100 KB.' });
    if (error.status === 415) return res.status(415).json({ erro: 'Codificação do corpo não suportada.' });
    console.error(error);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  });
  return app;
}
