# Atualizar para a versão 1.2 sem perder a conta

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

O PDF e o JSON são arquivos de conferência. A saída de comando Titanium `.lote` permanece pendente do arquivo real e da validação do controlador.
