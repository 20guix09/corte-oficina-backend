# Colocar no GitHub e abrir o sistema

Este pacote contém a versão piloto completa do Corte Oficina, com site e servidor. Não é preciso criar o frontend separado.

## 1. Atualizar seu repositório

1. Extraia `corte-oficina-completo.zip` no seu computador.
2. Abra a pasta extraída. O arquivo `package.json` deve ficar na raiz do repositório, junto das pastas `src` e `public`.
3. Se estiver usando a etapa 1 ou 2, faça uma cópia antes. Substitua o código antigo pelo conteúdo deste pacote. Remova as antigas pastas de código e testes que não pertencem mais a esta versão para não misturar implementações. Preserve a pasta `.git`, seu histórico e qualquer dado particular.
4. No GitHub, use **Add file → Upload files**, arraste o conteúdo extraído e faça o commit. Enviar apenas o ZIP não instala o sistema.
5. Inclua também `.github`, `.devcontainer`, `.gitignore`, `.gitattributes`, `.nvmrc` e `.env.example`, presentes no pacote. Elas configuram testes e ambiente. Se seu explorador ocultar arquivos iniciados por ponto, habilite a exibição deles.
6. Nunca envie `.env`, `node_modules` ou `data`. O pacote não contém senhas, banco preenchido nem o XML particular da empresa.

O pacote é independente das etapas anteriores. Você não precisa copiar arquivo por arquivo de versões antigas.

## 2. Abrir no Codespaces

No repositório do GitHub, clique **Code → Codespaces → Create codespace**.

No terminal, dentro da pasta que contém `package.json`, execute:

```bash
nvm install 24
nvm use 24
npm ci
cp .env.example .env
npm test
npm run dev
```

Se `.env` já existir, preserve suas configurações em vez de sobrescrevê-lo. Se o Codespaces já instalou as dependências automaticamente, executar `npm ci` novamente apenas reinstala as versões do pacote.

Abra a aba **Ports**, encontre a porta **3000** e clique **Open in Browser**. Mantenha essa porta privada para seus testes. Use a URL fornecida pelo Codespaces; não coloque `localhost:3000` no navegador do celular.

Se aparecer "Origem da requisição não autorizada", configure `APP_ORIGIN` no `.env` com a URL exata que você abriu na porta 3000 (sem caminho depois do host), pare e inicie novamente o servidor. Não use `*`.

O GitHub armazena o código. Quem executa o sistema é o computador, Codespaces ou servidor. GitHub Pages não executa este backend. Quando o Codespace estiver parado, o sistema ficará indisponível.

## 3. Primeiro teste pelas telas

1. Clique **Criar uma empresa** e cadastre sua conta, com senha de pelo menos 10 caracteres.
2. Crie um projeto chamado **Teste de corte**.
3. Clique **Importar XML** e selecione `exemplos/projeto-demonstracao.xml`. São 9 unidades fictícias.
4. Clique **Cadastrar chapas das peças**. Confira 2750 × 1850 mm, refilo de 15 mm em cada lado e informe o custo que quiser testar, por exemplo R$ 500.
5. Em **Regras de corte**, confira serra, alcance e fases. Os valores iniciais são provisórios para teste.
6. Volte ao projeto, clique **Otimizar chapas**, confira os cadastros e calcule.
7. No editor, clique em uma peça, arraste ou altere X/Y. Use **Desfazer** se precisar. As medidas da peça são preservadas.
8. Clique **Validar e salvar**. Um ajuste inválido mostra o motivo e mantém o desenho para corrigir.
9. Confira a sequência de cortes. Só depois use **Aprovar revisão**.
10. Use **Imprimir plano / PDF** ou **Baixar JSON do plano**. A impressão usa a janela do navegador; escolha salvar como PDF se desejar.

**O JSON não vai para a máquina. Não o renomeie para `.lote` ou `.gcode`.** A integração Titanium ainda não foi implementada nem homologada.

Só use **Confirmar produção e registrar sobras** depois de conferir o corte físico. Para testes, use um projeto fictício e sobras fictícias. Essa ação encerra a edição do projeto e transforma as sobras úteis calculadas em estoque disponível.

## 4. Usar o XML real da Pontual

Crie outro projeto e importe o arquivo real. Confira as peças e permita giro somente onde o responsável confirmar.

No XML analisado há 43 linhas, 104 unidades e 9 combinações de material/acabamento/espessura. A peça código 232 tem 827 × 2470 mm. Ela não cabe na orientação inicial de uma chapa configurada com X=2750 e Y=1850 mm. O sistema deve bloquear o cálculo enquanto isso não for resolvido. Confirme o eixo do desenho e se o giro dessa peça é permitido; não altere sua dimensão para fazê-la caber.

O XML registra algumas chapas como 2750 × 1830 mm, enquanto a medida física relatada foi 2750 × 1850 mm. Confira o cadastro físico antes de aprovar. O sistema não resolve essa divergência sozinho.

## 5. Salvar e continuar outro dia

Os dados ficam em `data/corte.sqlite`. Eles sobrevivem ao reinício do servidor, enquanto esse disco existir. Não apague o Codespace sem antes fazer backup do banco. O GitHub não guarda esses dados automaticamente.

Para parar, pressione **Ctrl+C**. Para abrir novamente:

```bash
nvm use 24
npm start
```

Para backup, pare o servidor e copie a pasta `data` inteira para um local privado. Para restaurar, pare o servidor, preserve uma cópia do banco atual e restaure a pasta do backup. Evite copiar só o arquivo `.sqlite` enquanto o servidor está em uso.

## 6. Postman

Importe `postman/Corte-Oficina.postman_collection.json`. Execute as 21 requisições na ordem com cookies habilitados. A coleção cria uma empresa de teste com e-mail diferente a cada execução. Para Codespaces, altere `baseUrl` para a URL da porta 3000 e use um agente do Postman com acesso a essa URL privada.

## Antes de usar na produção

Leia `docs/LIMITES-E-HOMOLOGACAO.md`. O piloto serve para testar o processo e comparar planos. Ainda falta receber um `.lote` real e validar os parâmetros físicos da serra com o operador.
