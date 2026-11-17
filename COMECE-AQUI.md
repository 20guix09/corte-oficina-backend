# Primeira instalação

Se já tem conta e projetos, use **ATUALIZAR.md**. Não apague seu banco para atualizar.

## GitHub e Codespaces

1. Extraia o ZIP. Envie o conteúdo da pasta ao repositório, com `package.json` na raiz; enviar apenas o ZIP não executa o sistema.
2. Inclua `.github`, `.devcontainer`, `.gitignore`, `.gitattributes`, `.nvmrc` e `.env.example`. Ative a visualização de arquivos ocultos se precisar.
3. Não envie `.env`, `data`, `node_modules` ou XMLs reais de clientes.
4. Abra **Code → Codespaces → Create codespace**. No terminal:

```bash
nvm install 24
nvm use 24
npm ci
cp .env.example .env
npm test
npm run dev
```

Se `.env` já existir, preserve-o. Abra a porta **3000** em **Ports → Open in Browser** e mantenha o acesso privado para seus testes. Se houver erro de origem, configure `APP_ORIGIN` no `.env` com a URL exata da porta e reinicie. Não use `*`.

GitHub guarda o código. O sistema executa no Codespace, computador ou servidor. GitHub Pages não executa este backend.

## Primeiro uso

1. Crie sua empresa e conta, com senha de pelo menos 10 caracteres.
2. Crie um projeto e importe `exemplos/projeto-demonstracao.xml`.
3. As chapas são cadastradas automaticamente. Abra **Ver chapas do XML** para consultar. Medidas e configurações podem ser ajustadas na tela **Chapas**; preço desconhecido começa em zero.
4. Clique **Otimizar automaticamente** e **Gerar plano de corte**.
5. Confira a chapa com peças coloridas e sobras brancas. Pode ajustar manualmente e usar **Validar e salvar**.
6. Use **Baixar plano de corte PDF** ou **Imprimir plano**. O PDF inclui todas as chapas.

O exemplo tem dados fictícios. O arquivo `exemplos/plano-demonstracao.pdf` permite conferir a aparência do relatório antes de rodar o programa.

Para montar do zero, use **Montar manualmente**: já haverá uma chapa por material, e as unidades sem posição aparecem abaixo do desenho. Clique para inserir, arraste ou altere X/Y. Adicione mais chapas quando precisar. Posicione todas as unidades antes de validar.

A tela usa posições em mm. As medidas desenhadas e o relatório usam cm, como o plano impresso do Promob.

## XML real e sobras

A importação lê as dimensões físicas da chapa no XML; na ausência delas, usa 2750 × 1830 mm. A espessura vem de cada material. Cadastros existentes são reutilizados e mantêm configurações já salvas.

Branco liso permite giro pela regra da oficina. Outros acabamentos começam bloqueados. Você pode alterar a regra do material para próximas importações ou uma peça individualmente.

Ao salvar um plano, as sobras e quantidades por chapa ficam registradas como previstas. Após cortar fisicamente, use **Confirmar produção e registrar sobras**. As sobras úteis entram no estoque com pedido e chapa de origem e são consideradas nos próximos projetos. Não confirme uma produção fictícia como se o material existisse na oficina.

O PDF é um plano para conferência, não um arquivo de comando da máquina. Não renomeie PDF ou JSON para `.lote` ou `.gcode`.

## Continuar depois

Pare com **Ctrl+C**. Os dados estão em `data/corte.sqlite` e continuam depois do reinício enquanto o disco existir.

```bash
nvm use 24
npm start
```

Faça backup privado da pasta `data` inteira com o servidor parado. Não apague um Codespace sem antes copiar o banco.

## Testar a API

Importe `postman/Corte-Oficina.postman_collection.json` e execute na ordem, com cookies habilitados. A coleção cria uma empresa de teste diferente a cada execução. Para Codespaces, use a URL da porta 3000 como `baseUrl` e um agente Postman com acesso a ela.
