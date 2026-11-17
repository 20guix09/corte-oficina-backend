# Corte Oficina — Backend, etapa 1

Servidor Node.js + Express com cadastro de projetos e dados temporários em memória. Projeto didático para iniciar o sistema de planos de corte da Pontual e acompanhar a sequência de estudos.

## O que está pronto

- Servidor HTTP com Express 5 e JavaScript moderno.
- Rotas para criar, listar, consultar, substituir e excluir projetos.
- Identificação com UUID, datas e status inicial rascunho.
- Validação dos campos e respostas JSON para erros.
- Coleção do Postman com oito requisições e verificações de status.
- Testes de integração HTTP.
- Configuração do GitHub Codespaces com Node 24.

Os dados são apagados ao reiniciar o servidor. No modo `npm run dev`, salvar um arquivo do servidor também provoca reinício. Login, separação de empresas, banco, XML, otimizador e exportação .lote entram nas próximas etapas. Esta API usa apenas dados fictícios e não deve receber dados reais em uma porta pública enquanto não houver autenticação.

## Subir no GitHub

1. Extraia o ZIP no computador.
2. Crie um repositório chamado `corte-oficina-backend`. Para esta etapa, prefira um repositório privado.
3. No repositório vazio, escolha o link de upload de arquivos, ou use **Add file → Upload files** se o repositório já tiver arquivos.
4. Envie o conteúdo da pasta `corte-oficina-etapa-1`, incluindo `.devcontainer`, `.gitignore` e `.nvmrc`. O `package.json` deve aparecer diretamente na raiz do repositório.
5. Confirme o envio em **Commit changes**.

O GitHub guarda o código. Para executar, abra um Codespace ou use seu computador. Contas e organizações podem aplicar cobrança ou limites ao Codespaces; confira a disponibilidade da sua conta antes de criar o ambiente.

## Executar no GitHub Codespaces

1. No repositório, clique em **Code → Codespaces → Create codespace on main**. Se a opção estiver indisponível, use a execução local abaixo.
2. Aguarde a criação. A configuração tenta instalar as dependências com `npm ci`.
3. No terminal, confirme a pasta com `ls`. Você deve ver `package.json`.
4. Execute, mesmo se a instalação automática já tiver ocorrido:

```bash
npm ci
npm test
npm run dev
```

Execute os comandos um por vez. O último mantém o servidor aberto. Para parar, pressione `Ctrl+C`.

5. Abra a aba **Ports/Portas**, procure a porta **3000** e clique no link para abrir no navegador. Se não aparecer, adicione a porta 3000 nessa aba.
6. Na raiz você verá um JSON com o nome da API. Acrescente `/health` ao endereço para verificar a resposta `{"status":"ok"}`.

A porta pode permanecer privada quando testada dentro do ambiente autenticado. O Postman Desktop precisa conseguir alcançar o endereço remoto. Se receber uma página de login do GitHub, use a porta pública apenas temporariamente e com dados fictícios, ou faça o teste local. Depois retorne a porta para privada e pare o Codespace quando terminar.

## Executar no computador

Instale Node.js 24, abra a pasta no VS Code e rode no terminal:

```bash
npm ci
npm test
npm run dev
```

Acesse `http://localhost:3000/health`.

Para iniciar sem reinício automático:

```bash
npm start
```

A porta padrão é 3000. Para alterá-la no Codespaces/Linux:

```bash
PORT=3001 npm start
```

No PowerShell do Windows:

```powershell
$env:PORT=3001
npm start
```

## Testar no Postman

1. Abra **Import** e selecione `postman/Corte-Oficina-Etapa-1.postman_collection.json`.
2. Abra a coleção e a aba **Variables**. Configure `baseUrl`:
   - Computador local: `http://localhost:3000`.
   - Codespaces: o endereço completo da porta 3000, copiado da aba Ports, sem barra no final.
3. Verifique se nenhum Environment sobrescreve `baseUrl` ou `projectId`.
4. Execute as requisições de 01 a 08 em ordem, clicando em **Send**. Também pode usar o Collection Runner.
5. A requisição 03 guarda o ID automaticamente em `projectId` para os próximos testes.
6. Confira os resultados em **Test Results**.

A sequência exclui o projeto fictício ao final. Para continuar usando um projeto de exemplo, repita a requisição 03. Reiniciar o servidor apaga os IDs anteriores, então repita a criação após reiniciar.

## Rotas

| Método | Caminho | Resultado |
|---|---|---|
| GET | `/` | Identificação da API, HTTP 200 |
| GET | `/health` | Servidor respondendo, HTTP 200 |
| GET | `/api/projetos` | Lista e total, HTTP 200 |
| POST | `/api/projetos` | Cria projeto, HTTP 201 |
| GET | `/api/projetos/:id` | Consulta projeto, HTTP 200 |
| PUT | `/api/projetos/:id` | Substitui os campos editáveis, HTTP 200 |
| DELETE | `/api/projetos/:id` | Exclui projeto, HTTP 204 sem corpo |

Use `Content-Type: application/json` no POST e no PUT. Corpo de exemplo:

```json
{
  "nome": "Armário de teste",
  "cliente": "Cliente exemplo",
  "pedido": "PED-001",
  "observacoes": "Teste da etapa 1"
}
```

`nome` é obrigatório, com até 200 caracteres após remover espaços externos. `cliente` e `pedido` são opcionais com até 200 caracteres. `observacoes` é opcional com até 2000 caracteres. Todos são textos. Campos desconhecidos são rejeitados.

O status é `rascunho`, definido pelo servidor. Aprovação de plano pertence a outra etapa. O PUT preserva ID e data de criação, mas limpa os campos opcionais omitidos. Para preservá-los, envie todos os campos editáveis novamente. A versão atual não possui PATCH.

Respostas de cadastro e consulta usam `{ "dados": { ... } }`. Listagens usam `{ "dados": [], "total": 0 }`. Erros usam `{ "erro": "..." }`, com `detalhes` quando houver erro de validação.

| Código | Significado |
|---|---|
| 400 | JSON malformado ou campos inválidos |
| 404 | Projeto ou rota inexistente |
| 413 | Corpo maior que 100 KB |
| 415 | Tipo/codificação do corpo incompatível |
| 500 | Erro interno inesperado |

## Estrutura

- `src/server.js` inicia a API e define a porta.
- `src/app.js` contém as rotas e o armazenamento temporário.
- `test/projects.test.js` verifica o comportamento via HTTP real.
- `postman/` contém a coleção de testes manuais.
- `.devcontainer/` configura o Codespaces.
- `package-lock.json` fixa as dependências para instalar com `npm ci`.

Nunca envie `node_modules` ou `.env` ao GitHub. O `.gitignore` já cobre esses arquivos.

## Conclusão da etapa

A etapa está concluída quando os testes passam e você consegue criar, consultar, atualizar e excluir um projeto pelo Postman. Depois modelaremos o banco e vincularemos os dados às empresas, antes de disponibilizar o produto para clientes.

Referência oficial do Express consultada na preparação: https://expressjs.com/en/starter/installing/
