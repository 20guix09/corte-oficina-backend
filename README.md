# Corte Oficina 1.3.1 - piloto funcional

Sistema de planejamento de corte para a Pontual Móveis, com importação de listagem XML do Promob, otimização guilhotinada e edição manual. Servidor Node.js/Express, SQLite em disco e frontend HTML/CSS/JavaScript, sem necessidade de uma API de inteligência artificial.

**Se você já instalou a versão anterior, leia [ATUALIZAR.md](ATUALIZAR.md). Preserve `data`, `.env` e `.git`.** Para a primeira instalação, leia [COMECE-AQUI.md](COMECE-AQUI.md).

A correção 1.2.1 resolve a otimização em `npm run dev`: avisos internos do modo `--watch` não são confundidos com o resultado do cálculo. Há um teste de servidor real nesse modo, incluindo erro de encaixe e nova tentativa. Nenhuma alteração no banco é necessária.

A correção 1.2.2 troca a imagem inexistente `javascript-node:1-24-bookworm` por `javascript-node:24-bookworm`. A tag e o manifesto foram conferidos no registro oficial Microsoft (HTTP 200, Linux amd64/arm64). O pacote não foi iniciado dentro de Docker nesta conferência; o teste local usa Node 24.

A versão 1.3.0 acrescenta a conferência de lotes Titanium e etiquetas individuais em PDF. Não muda o banco nem ativa comandos da máquina.

## Executar

Node.js 24 e npm:

```bash
npm ci
npm test
npm run dev
```

`npm start` executa sem modo de desenvolvimento. A porta padrão é 3000. No Codespaces, abra a URL da porta encaminhada; no seu computador, abra `http://localhost:3000`.

## Fluxo principal

1. Crie o projeto e importe o XML.
2. O sistema cadastra os tipos de chapa automaticamente, ou reutiliza os cadastros compatíveis existentes.
3. Escolha **Otimizar automaticamente** ou **Montar manualmente**.
4. Revise as posições e salve a validação. A edição cria uma nova versão do plano.
5. Visualize o plano por chapa, baixe o PDF ou imprima.
6. Após o corte real, confirme a produção para disponibilizar as sobras úteis no estoque.

As peças importadas e as chapas ficam persistidas no banco. Sair para outra tela e voltar ao projeto não exige recriá-lo. Registros antigos incompletos no histórico não impedem a abertura das peças.

## Convenção dos cadastros da Pontual (1.3.1)

O administrador seleciona **Regras de corte → Convenção dos nomes dos materiais → Pontual** e salva. A configuração fica somente na empresa atual. Outras empresas continuam usando os nomes literais por padrão.

- **Rosa** é o código interno para **branco de uma face**. O sistema mostra esse significado junto ao nome original. Não renomeia para Branco nem mistura com um cadastro genérico de branco/duas faces.
- **ISOPOR** é o apelido do cadastro de chapa com formato especial, mais larga e mais curta. Não é uma declaração de que o material seja EPS. No lote real recebido, esse cadastro mede 2440 × 2150 × 18 mm; outros arquivos podem ter outra medida. As dimensões sempre vêm do arquivo/cadastro, sem uma medida fixa vinculada ao apelido.
- A conferência distingue nomes operacionais conhecidos de diferenças sem interpretação e mostra quando o formato da chapa no XML e no lote é diferente. O tipo vazio do lote permanece vazio; o perfil não presume composição ou número de faces para um Branco genérico.
- Os planos novos preservam esse perfil junto às regras. Relatórios e etiquetas podem mostrar o significado sem alterar os nomes originais. As revisões antigas conservam suas próprias regras. Salvar a configuração muda a revisão do perfil, exigindo nova revisão de plano para aprovar trabalhos ainda não produzidos.
- A interpretação não modifica os tamanhos do catálogo, não importa a chapa do lote nem libera giro automaticamente. O otimizador usa as dimensões físicas cadastradas em Chapas; confirme/cadastre o formato especial correto antes de calcular. Materiais e formatos não são substituídos silenciosamente.

## Conferir lote e imprimir etiquetas

No projeto, clique **Conferir arquivo .lote** e selecione o lote do mesmo pedido. O leitor aceita XML Titanium `Version1` no formato dos exemplos recebidos. Exibe materiais, programas, comandos e as medidas escritas nas etiquetas, comparadas às peças atuais. O campo de unidade das etiquetas usa cm por padrão; os comandos e dimensões de chapa usam mm.

A análise destaca divergências e não troca materiais. Um cadastro sem tipo não vira MDF por suposição. IDs diferentes podem ser repetições agrupadas no XML. Medidas iguais não comprovam material, veio ou compatibilidade com a máquina. Registros de comandos não equivalem à contagem de cortes físicos. A quantidade de unidades pelas etiquetas é calculada como quantidade de etiqueta × quantidade de programa; lotes repetidos precisam de conferência do operador.

A conferência não é salva no banco; ao sair do projeto ou mudar a revisão, selecione o lote novamente. Ela não importa o plano da Titanium para o editor e não permite executar seus comandos. Os caminhos de imagens são lidos como referência textual, sem abrir arquivos ou buscar imagens na rede.

No editor de um plano salvo, clique **Baixar etiquetas PDF**. É uma página de **100 × 60 mm por unidade**, com cliente, projeto, pedido, peça, material, medidas originais em cm, chapa e giro no plano. Imprima em tamanho real (100%), em uma impressora configurada para esse papel. Bordas são referências textuais do cadastro original, não um desenho de aplicação de fita após giro; textos longos podem aparecer abreviados e precisam ser consultados na ficha da peça. O PDF usa o status/revisão e a ficha preservada do plano; históricos antigos sem ficha não geram etiquetas.

Para experimentar sem dados de cliente, importe `exemplos/projeto-conferencia.xml` e confira `exemplos/lote-demonstracao.lote`. As medidas coincidem, mas há diferenças de material intencionais para demonstrar a revisão. `exemplos/etiquetas-demonstracao.pdf` contém nove etiquetas fictícias. A página `/exemplo-titanium.html` mostra um resultado fictício sem login.

## Chapas e regras de giro

A chave do tipo de chapa é **material + acabamento + espessura + fornecedor + linha**, com normalização de espaços e maiúsculas. A descrição e o código externo também são preservados no cadastro. As dimensões vêm do XML e, se ausentes, usam o padrão confirmado de 2750 × 1830 mm. Custo, dimensões e refilos de um cadastro já existente são mantidos.

A regra da oficina permite giro de 90° para **Branco liso**: modelo Branco, linha Cores ou sem linha. A regra é armazenada no material e aplicada às próximas importações. Outros acabamentos começam com giro bloqueado. Não inferimos permissão pela aparência da foto. A pessoa pode alterar uma peça específica; isso é registrado como decisão manual.

O campo `PLATECUTTINGROTATE=NONE` do XML não é tratado, sozinho, como autorização para girar. Uma peça com veio não pode mudar de orientação apenas para caber. Girar o bloco fisicamente na seccionadora não muda essa regra.

## Medidas e validação

Todos os dados da API e as posições X/Y são em **milímetros**. O desenho e o relatório usam **centímetros**, como os exemplos impressos da oficina. O cabeçalho também informa as dimensões em mm.

| Dado                            | Tratamento                                                           |
| ------------------------------- | -------------------------------------------------------------------- |
| XML `WIDTH`                     | Dimensão X inicial da peça                                           |
| XML `DEPTH`                     | Dimensão Y inicial da peça                                           |
| XML `HEIGHT` / `THICKNESS`      | Espessura                                                            |
| XML `REPETITION`                | Quantidade de unidades                                               |
| XML `MAXWIDTH` / `MAXDEPTH`     | Dimensões físicas da chapa                                           |
| Chapa `comprimento` / `largura` | Dimensões X / Y da chapa                                             |
| Refilos por lado                | Margens externas descartadas, incluindo a reserva total daquele lado |
| Serra                           | Largura consumida por cada corte interno, contada uma vez            |

As dimensões das peças já são de corte e não sofrem novo desconto de fita de borda. A validação do servidor confere todas as unidades, material, espessura, fornecedor, medidas, giro, área útil, espaço de serra, sobreposição e existência de uma sequência de cortes passantes dentro do alcance e das fases configuradas.

## Otimização

Busca heurística com múltiplas ordenações e divisões guilhotinadas. Tenta sobras disponíveis compatíveis antes de chapas novas. Cada material e espessura são calculados separadamente. Testa os dois sentidos de divisão, várias ordenações e consolidação: tenta recolocar as peças de uma chapa pouco ocupada nas sobras de outras compatíveis. Cada alternativa traz uma árvore de cortes conferida integralmente; a reconstrução pode encontrar uma sequência que preserve uma sobra maior.

A escolha entre resultados válidos prioriza:

1. Menos chapas novas.
2. Menos chapas físicas usadas, entre resultados com a mesma quantidade de chapas novas.
3. Maior sobra que atende aos mínimos de reaproveitamento, por material.
4. Maior área total de sobras que atendem aos mínimos.
5. Menos cortes internos.

O resultado é o **melhor encontrado**, sem prova de ótimo global. Há até 200 tentativas por material, aproximadamente 10 segundos de busca total e um timeout externo do worker. O cálculo não bloqueia a thread HTTP. A tela mostra o limite inferior de chapas pela área; atingir esse número comprova a quantidade mínima de chapas novas nas condições consideradas, mas não o melhor arranjo possível.

**Melhorar este plano** considera uma revisão válida como ponto de partida, preserva seu histórico e gera outra alternativa. Sobras reservadas pelo próprio pedido podem participar; reservas de outros pedidos ficam excluídas.

## Editor manual

O editor abre uma chapa compatível para cada material do projeto. Clique nas unidades sem posição para inseri-las em um espaço livre; arraste ou informe X/Y. É possível transferir entre chapas compatíveis, adicionar chapas/sobras, retirar posições e desfazer/refazer.

Zoom de 25% a 500%, ajuste à tela e tela cheia ampliam apenas a visualização. Ctrl + roda também amplia; arraste o fundo para navegar no desenho ampliado. O arraste de peças usa as coordenadas reais do SVG, incluindo o zoom.

Uma distribuição manual não ganha validade apenas por caber no desenho. O salvamento confere a sequência de cortes. Todas as unidades precisam estar posicionadas e chapas vazias devem ser removidas.

## Relatório e PDF

Anterior, Próxima e seleção direta trocam a chapa junto à prévia do relatório e ao editor. A espessura fica destacada para diferenciar chapas da mesma cor.

Uma folha por chapa, com cabeçalho, legenda, peças coloridas e sobras brancas. Inclui cliente, projeto, pedido, descrição, código do material quando disponível, dimensão, fornecedor, material, acabamento, configuração, peças, cortes internos, aproveitamento, sobras, data e hora.

O sistema não inventa informações ausentes do XML. Sem um código externo, o relatório usa o identificador interno da chapa. A geometria é vetorial, sem geração de imagens por IA. A mesma geometria alimenta a visualização e o PDF. Novas revisões guardam uma cópia da ficha das peças: editar o projeto depois não altera descrições e medidas do relatório histórico. Legendas extensas podem ganhar páginas adicionais no PDF.

O PDF pode ser baixado para conferir um plano salvo ainda em revisão. O JSON interno exige aprovação. **Nenhum desses arquivos é um programa `.lote` da Titanium.**

Exemplo fictício: `exemplos/plano-demonstracao.pdf`. A página `/exemplo-plano.html` mostra esse exemplo e não contém dados de clientes reais.

## Sobras e estoque

Cada plano mantém medidas e quantidade das sobras por chapa, inclusive as pequenas. Somente as que atendem aos mínimos configurados entram no estoque depois da confirmação de produção. Cada registro identifica projeto, pedido, plano e chapa de origem.

A aprovação reserva sobras físicas usadas pelo plano. Alterar peças, voltar à revisão ou aprovar outra alternativa libera reservas não produzidas. Confirmar produção consome a reserva, registra novas sobras uma única vez e bloqueia novas edições daquele projeto. Crie outro projeto para outra execução.

Chapas novas têm disponibilidade ilimitada por tipo; não há controle de compras e saldo físico de chapas novas. O estoque de sobras não é sincronizado com o Promob. O custo das chapas não significa prejuízo, lucro ou compra confirmada.

## Acesso e persistência

Empresas isoladas por escopo de dados. Administrador gerencia equipe e regras; administrador/planejador editam e aprovam; operador consulta, imprime e baixa o plano. Senhas usam scrypt e as sessões ficam em cookie HttpOnly com duração de 8 horas. Não há senha padrão nem conta preenchida no pacote.

Os dados ficam em `data/corte.sqlite`. Para backup, pare o servidor e copie a pasta `data` inteira para um local privado. Não envie dados, `.env` ou banco ao GitHub. Se o disco do Codespace for apagado, o código no GitHub não recupera o banco.

`PORT=3000`, `DB_PATH=./data/corte.sqlite`, `COOKIE_SECURE=false` para localhost. Em HTTPS, configure `COOKIE_SECURE=true`. Se um proxy mudar o Host, defina `APP_ORIGIN` com a URL pública exata. As chamadas usam a mesma origem, sem CORS aberto.

Codespaces é um ambiente de desenvolvimento. A operação contínua precisa de servidor Node, HTTPS, disco persistente e backup. Esta versão usa uma instância de servidor SQLite; não compartilhe o banco entre várias instâncias.

## Organização

| Arquivo                                                   | Responsabilidade                                   |
| --------------------------------------------------------- | -------------------------------------------------- |
| `src/app.js`, `src/server.js`                             | HTTP, ambiente, erros e ciclo de vida              |
| `src/routes/api.js`                                       | Rotas, autorização e transações                    |
| `src/db.js`, `src/repositories/accounts.js`               | Persistência e versões                             |
| `src/auth.js`, `src/validation.js`                        | Conta, sessão e validações                         |
| `src/xml.js`                                              | Leitura de peças e metadados necessários do XML    |
| `src/services/catalog.js`                                 | Cadastro/reuso automático de chapas                |
| `src/engine.js`, `src/cuts.js`, `src/optimizer-worker.js` | Cálculo e validação dos cortes                     |
| `src/services/reports.js`, `src/services/pdf.js`, `src/services/labels.js` | Resumos, plano PDF e etiquetas                                      |
| `src/services/titanium.js`, `public/titanium-view.js` | Leitura e conferência do lote, sem execução |
| `public/domain.js`, `public/report.js`                    | Identidade de materiais e relatório compartilhados |
| `public/app.js`, `public/editor.js`, `public/viewport.js` | Telas e edição visual                              |

Banco com transações e versões para evitar sobrescrever mudanças de outro usuário. O piloto usa registros JSON para reduzir código repetitivo; uma expansão comercial deve incluir migrações e modelagem específica para relatórios maiores.

## Verificação e limites

49 testes automáticos, incluindo fluxo das telas com servidor real, ida/volta ao projeto, histórico incompleto, catálogo, reaproveitamento de sobras, PDF e conservação da área. O XML particular foi conferido localmente: 43 linhas, 104 unidades e 9 materiais. Ele não acompanha o pacote.

Limites: 500 unidades por projeto, XML até 2 MB, JSON HTTP até 5 MB e um cálculo por empresa por vez.

Ainda não implementados: exportação `.lote`/G-code, integração de pasta, sincronização com Promob, continuidade do veio entre peças, furação/usinagem, cobrança de assinatura e recuperação de senha por e-mail. Não houve homologação física da máquina. O editor tem controles adaptáveis, mas a revisão visual completa em vários celulares continua pendente.

A revisão dos requisitos da Pontual e o comparativo de otimização estão em [docs/REVISAO-PONTUAL.md](docs/REVISAO-PONTUAL.md).

Veja [docs/LIMITES-E-HOMOLOGACAO.md](docs/LIMITES-E-HOMOLOGACAO.md), [docs/API.md](docs/API.md) e [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md).
