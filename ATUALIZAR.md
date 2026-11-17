# Atualizar para a versão 1.1 sem perder a conta

1. Pare o servidor com **Ctrl+C** e faça uma cópia privada da pasta `data`.
2. Extraia o pacote. Copie o código atualizado para a mesma pasta do seu repositório, com `package.json` na raiz.
3. **Preserve `data`, `.env` e `.git`.** O pacote não traz banco vazio para substituir o seu. Não precisa criar conta novamente.
4. No Codespaces, com Node.js 24, execute:

```bash
npm ci
npm test
npm run dev
```

5. Abra a porta 3000 e atualize a página com **Ctrl+Shift+R**. Isso evita usar a tela antiga com o servidor novo.

## Teste nesta ordem

1. Entre com a conta que você já criou e abra um projeto existente.
2. Vá em **Chapas**, volte em **Projetos** e abra o mesmo projeto novamente.
3. Importe o XML. Os materiais aparecem automaticamente em **Chapas**, sem preencher manualmente.
4. Clique **Otimizar automaticamente** para o sistema distribuir as peças; ou **Montar manualmente** para escolher as posições.
5. O modo manual já abre uma chapa de cada material do projeto. Clique nas unidades sem posição para colocá-las, arraste ou altere X/Y. Adicione outra chapa do mesmo material se precisar.
6. Clique **Validar e salvar** depois de posicionar todas as unidades.
7. Veja o **Plano de corte** e use **Baixar plano de corte PDF**. O PDF tem cabeçalho, legenda, peças coloridas, sobras brancas, medidas, número de cortes e aproveitamento por chapa.

Há um PDF fictício em `exemplos/plano-demonstracao.pdf` para conferir o formato sem executar o programa.

## O que mudou

- Projetos abrem mesmo quando existe um plano antigo sem resumo. Quando o desenho está completo, o resumo é reconstruído. Um registro incompleto continua visível e permite gerar outro plano.
- Chapas são cadastradas automaticamente pelo XML e reutilizadas nos próximos pedidos. A identificação considera material, acabamento, espessura e fornecedor; maiúsculas e espaços não criam um novo tipo.
- As dimensões vêm de `MAXWIDTH` e `MAXDEPTH`. Na falta desses campos, o padrão da oficina é **2750 × 1830 mm**. A espessura é específica de cada material; não é sempre 15 mm.
- Um cadastro existente mantém seu custo, dimensões e refilos. Para corrigir um cadastro antigo de 1850 mm para 1830 mm, edite-o na tela Chapas. Não alteramos medidas que alguém já cadastrou silenciosamente.
- A regra informada da oficina permite giro para o acabamento **Branco liso** (modelo Branco, linha Cores ou sem linha). Outros acabamentos começam bloqueados. Isso pode ser alterado no material para próximas importações ou em uma peça específica.
- Projetos da versão anterior com o giro padrão bloqueado em peças importadas de Branco liso são preparados automaticamente ao abrir. Uma decisão manual identificada nesta versão é preservada. Planos não produzidos afetados por essa preparação ficam desatualizados e devem ser recalculados; suas peças não são apagadas.
- Cada chapa guarda quantidade, medidas e área das sobras previstas. Ao **Confirmar produção e registrar sobras**, as sobras úteis entram no estoque com projeto, pedido e chapa de origem. Os próximos cálculos tentam usá-las.

**Gerar uma alternativa não cria material físico no estoque.** As sobras ficam registradas no plano e entram no estoque disponível depois da confirmação do corte. Isso evita que alternativas diferentes cadastrem a mesma sobra várias vezes.

O PDF é o plano de corte para conferência e impressão. A saída de comando `.lote` continua pendente da integração com o controlador da máquina.
