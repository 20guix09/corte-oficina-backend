import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

let server;
let base;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

function request(path, method = 'GET', body) {
  return fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('Servidor responde e começa com lista vazia', async () => {
  assert.equal((await request('/')).status, 200);
  assert.deepEqual(await (await request('/health')).json(), { status: 'ok' });
  assert.deepEqual(await (await request('/api/projetos')).json(), { dados: [], total: 0 });
});

test('CRUD completo preserva identificação e limpa opcionais omitidos no PUT', async () => {
  let response = await request('/api/projetos', 'POST', { nome: ' Armário ', cliente: 'Exemplo', pedido: 'P-1' });
  assert.equal(response.status, 201);
  const original = (await response.json()).dados;
  assert.equal(original.nome, 'Armário');
  assert.equal(original.status, 'rascunho');
  assert.equal(response.headers.get('location'), `/api/projetos/${original.id}`);
  const path = `/api/projetos/${original.id}`;
  assert.deepEqual((await (await request(path)).json()).dados, original);
  assert.equal((await (await request('/api/projetos')).json()).total, 1);
  response = await request(path, 'PUT', { nome: 'Balcão' });
  const updated = (await response.json()).dados;
  assert.equal(response.status, 200);
  assert.equal(updated.id, original.id);
  assert.equal(updated.criadoEm, original.criadoEm);
  assert.equal(updated.nome, 'Balcão');
  assert.equal(updated.cliente, '');
  assert.equal(updated.pedido, '');
  response = await request(path, 'DELETE');
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal((await request(path)).status, 404);
});

test('Entradas inválidas são rejeitadas sem criar projetos', async () => {
  for (const body of [{}, { nome: ' ' }, { nome: 20 }, null, [], { nome: 'X', cliente: 42 }, { nome: 'X', status: 'aprovado' }, { nome: 'x'.repeat(201) }]) {
    assert.equal((await request('/api/projetos', 'POST', body)).status, 400);
  }
  assert.equal((await (await request('/api/projetos')).json()).total, 0);
});

test('PUT inválido preserva projeto existente', async () => {
  const created = (await (await request('/api/projetos', 'POST', { nome: 'Original' })).json()).dados;
  const path = `/api/projetos/${created.id}`;
  assert.equal((await request(path, 'PUT', { nome: '' })).status, 400);
  assert.deepEqual((await (await request(path)).json()).dados, created);
  await request(path, 'DELETE');
});

test('JSON malformado retorna 400 e tipo de conteúdo incorreto retorna 415', async () => {
  const malformed = await fetch(base + '/api/projetos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const wrongType = await fetch(base + '/api/projetos', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'texto' });
  assert.equal(wrongType.status, 415);
});

test('Corpo excessivo retorna 413', async () => {
  assert.equal((await request('/api/projetos', 'POST', { nome: 'X', observacoes: 'a'.repeat(110000) })).status, 413);
});

test('Projetos inexistentes e rotas desconhecidas retornam 404', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await request('/api/projetos/inexistente', method)).status, 404);
  assert.equal((await request('/inexistente')).status, 404);
});
