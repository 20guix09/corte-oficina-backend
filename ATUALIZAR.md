# Atualizar para a versão 1.4.0 sem perder a conta

1. Pare o servidor com **Ctrl+C** e faça uma cópia privada da pasta `data`.
2. Extraia o pacote e copie os arquivos atualizados para a mesma pasta do repositório. `package.json` precisa ficar na raiz. Enviar somente o ZIP ao GitHub não atualiza o código executado.
3. **Preserve `data`, `.env` e `.git`.** Não é necessário cadastrar a empresa novamente. O pacote não traz banco vazio para substituir o seu.
4. No terminal, usando Node.js 24:

```bash
npm ci
npm test
npm run dev
```

5. Abra a porta 3000 e atualize o navegador com **Ctrl+Shift+R**.

O servidor acrescenta tabelas de acesso ao SQLite ao iniciar. Para habilitar Google e recuperação por e-mail, consulte [Acesso da oficina](docs/ACESSO.md).

## Melhorias da busca por faixas

A versão 1.3.2 testa também faixas horizontais e verticais, preservando grandes regiões livres. As alternativas respeitam giro, serra, refilos, alcance e fases e passam pela validação independente da árvore de cortes. Só substituem o resultado anterior se o objetivo do grupo melhorar. Não une Rosa e Branco nem altera dimensões para tentar reduzir o número de chapas.

Para aplicar em um plano já salvo, abra-o e use **Melhorar este plano**. A alternativa anterior fica no histórico. A busca por faixas não garante menos chapas em todo pedido; uma melhoria pode ser uma sobra maior inteira, com a mesma quantidade de chapas.

## Convenção dos nomes da Pontual

Depois de atualizar, entre como administrador, abra **Regras de corte**, selecione **Pontual** em **Convenção dos nomes dos materiais desta empresa** e salve. Rosa será identificado como branco de uma face, e ISOPOR como cadastro de formato especial. As dimensões reais e os nomes originais são preservados. Outras empresas não recebem essa interpretação automaticamente.

Na conferência do `.lote`, os nomes conhecidos aparecem explicados e o formato da chapa é comparado ao XML quando disponível. Isso não cadastra o formato no estoque: ajuste o tipo de chapa correto em **Chapas** antes de otimizar. Não altere um cadastro de outra chapa para reaproveitar o nome.

A alteração do perfil de regras exige nova revisão antes de aprovar planos pendentes. Planos históricos mantêm seus dados originais.

## Novidades desta versão

- No projeto, **Conferir arquivo .lote** lê um lote Titanium do mesmo pedido e compara medidas, quantidades e materiais identificáveis. Não modifica o projeto. A análise fica nesta sessão e precisa ser refeita depois de sair do projeto ou mudar suas peças.
- No editor, **Baixar etiquetas PDF** gera uma página de 100 × 60 mm por unidade. Imprima a 100%, usando a etiqueta correta. Planos históricos com ficha preservada mantêm os dados originais; planos antigos sem essa ficha exigem outra revisão.
- Não foi liberada a exportação de comandos da máquina. As divergências de material continuam exigindo confirmação da oficina.
- Teste com `exemplos/projeto-conferencia.xml` e `exemplos/lote-demonstracao.lote`, que contêm diferenças intencionais de material. O PDF fictício de etiquetas está em `exemplos/etiquetas-demonstracao.pdf`.

Não há migração de banco nesta atualização. Atualize os módulos de servidor e frontend juntos.

## Se o Codespaces mostrar npm: command not found

A configuração anterior indicava uma tag inexistente de imagem. O Codespaces falhava ao baixar a imagem e abria o ambiente de recuperação sem Node/npm.

1. Atualize `.devcontainer/devcontainer.json`, usando `mcr.microsoft.com/devcontainers/javascript-node:24-bookworm` no campo `image`.
2. Salve o arquivo. Abra Ctrl+Shift+P, procure **Codespaces: Rebuild Container** (Recompilar Contêiner) e confirme a reconstrução. Repetir a reconstrução com o arquivo antigo não resolve.
3. Aguarde concluir. Abra um terminal novo e execute `node -v` e `npm -v`. A versão do Node precisa começar com v24.
4. Execute `npm ci`, `npm test` e `npm run dev`.

Os arquivos em `/workspaces`, incluindo o projeto e o banco na pasta `data`, persistem na reconstrução do mesmo Codespace. Não exclua o Codespace nem recrie o projeto.

A disponibilidade de `24-bookworm` foi conferida no registro Microsoft; a execução do contêiner no seu Codespaces ainda precisa terminar.

## Correção do erro ao gerar plano

A versão 1.2.1 corrige `Cannot read properties of undefined (reading 'boards')` ao otimizar usando `npm run dev`. O Node envia avisos de arquivos monitorados pelo canal do worker; eles eram tratados como se fossem o resultado do cálculo. Agora apenas mensagens identificadas do otimizador concluem a operação, e falhas/saídas sem resultado são tratadas explicitamente.

Substitua **os dois arquivos** `src/routes/api.js` e `src/optimizer-worker.js` juntos, ou atualize o pacote completo. Não misture o protocolo antigo com o novo. Não é necessário recriar conta, projeto ou importar o XML novamente.

O teste novo inicia um servidor com `--watch`, importa um XML, calcula, refina uma revisão, rejeita uma peça impossível e depois calcula novamente. A suíte tem 50 testes.

Se você deixou um terminal da versão anterior executando, pare-o com Ctrl+C antes de iniciar a versão nova.

## Conferir a correção

1. Entre com sua conta e abra o projeto que já tem peças importadas.
2. Abra um plano salvo e clique **Melhorar este plano**. Ele será considerado como base, se ainda estiver válido, e outra revisão será criada. Planos antigos não mudam de posição silenciosamente.
3. Acompanhe **Materiais e espessuras deste plano**. Marrom Claro de **12 mm** e de **18 mm** são tipos separados. A tabela mostra unidades, chapas, mínimo pela área e maior sobra útil de cada grupo.
4. No editor, use **+ / −**, **Ajustar à tela** e **Tela cheia**. Ctrl + roda amplia; arrastar o fundo navega. Arrastar uma peça altera a posição, mantendo suas medidas. Depois de editar, clique **Validar e salvar**.
5. Junto a **Plano de corte · Chapa 1 de ...**, use **Anterior**, **Próxima** ou **Ver chapa** para consultar qualquer folha. O seletor do editor acompanha a escolha.
6. Baixe o PDF para conferir todas as chapas. Só confirme a produção depois que os cortes físicos ocorrerem.

## O que mudou

- Busca por material/espessura, com divisões em X e Y, várias ordenações e tentativa de eliminar chapas pouco ocupadas do mesmo grupo.
- Comparação de sobras por material, evitando que uma sobra grande de uma cor esconda uma distribuição ruim em outra.
- Validação independente da árvore de cortes; busca uma sequência que preserve áreas livres inteiras.
- Refinamento de uma revisão existente, inclusive com sobras reservadas pelo próprio pedido. Sobras de outros pedidos continuam bloqueadas.
- Zoom até 500%, tela cheia e navegação em ambas as áreas do plano.
- Indicadores recalculados depois de editar; ficha das peças preservada nos relatórios novos.
- Controle de alterações de chapa, estoque e regras durante o cálculo.

No XML conferido, o mínimo por área é **13 chapas novas**, considerando 2750 × 1830 mm, refilos de 15 mm, kerf de 5 mm e nenhuma sobra prévia disponível. A melhoria desta revisão concentrou sobras maiores e reduziu os cortes internos de 187 para 173; não reduziu as chapas desse pedido. Veja o comparativo e a revisão completa em **docs/REVISAO-PONTUAL.md**.

O PDF e o JSON são arquivos de conferência. A saída de comando Titanium `.lote` permanece pendente da interpretação completa do formato e da homologação no controlador. Os exemplos reais já são reconhecidos pelo leitor de conferência.
