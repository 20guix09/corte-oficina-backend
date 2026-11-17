# Revisão dos requisitos da Pontual Móveis — versão 1.2

A versão 1.2 melhora a otimização e a revisão visual do plano. O objetivo da oficina é usar menos chapas novas e concentrar o material restante em sobras grandes, mantendo medidas, veio e uma sequência de cortes executável pelo modelo de seccionadora. As regras físicas ainda não confirmadas e a exportação do controlador permanecem separadas do planejamento validado.

## Comparação do XML fornecido

Condições: 43 linhas, 104 unidades, 9 grupos de material; chapas de 2750 × 1830 mm, refilos de 15 mm em cada lado, serra de 5 mm, 6 fases e corte máximo de 2800 mm. Sem sobras anteriores disponíveis, com mínimos configurados de 200 × 400 mm para considerar uma sobra útil. O XML particular não acompanha o pacote.

| Indicador                                | Versão 1.1 | Versão 1.2 |
| ---------------------------------------- | ---------: | ---------: |
| Chapas novas                             |         13 |         13 |
| Aproveitamento pelas áreas das peças     |     51,29% |     51,29% |
| Cortes internos                          |        187 |        173 |
| Maior sobra útil do pedido               |   4,099 m² |   4,406 m² |
| Área total das sobras consideradas úteis |  25,429 m² |  25,791 m² |

O custo de compra não caiu nesse exemplo: a quantidade de chapas permaneceu igual. A área total das peças é a mesma; por isso o percentual de aproveitamento também não muda. A melhoria está na distribuição e na sequência, que deixam mais material em retângulos reutilizáveis e reduzem os cortes internos. Nem toda área que não virou peça deve ser classificada como prejuízo: parte continua sendo estoque reaproveitável.

| Grupo                   | Unidades | Chapas | Maior sobra 1.1 | Maior sobra 1.2 |
| ----------------------- | -------: | -----: | --------------: | --------------: |
| Branco 18 mm            |        7 |      1 |        0,206 m² |        0,495 m² |
| Branco 15 mm            |       45 |      2 |        0,707 m² |        1,472 m² |
| Marrom Claro 12 mm      |        6 |      1 |        2,960 m² |        3,182 m² |
| Arauco Beige Matt 6 mm  |        4 |      2 |        2,398 m² |        4,162 m² |
| Branco 6 mm             |       11 |      3 |        1,038 m² |        1,702 m² |
| Marrom Claro 6 mm       |        4 |      1 |        4,099 m² |        4,406 m² |
| Marrom Claro 15 mm      |       10 |      1 |        2,762 m² |        4,217 m² |
| Arauco Beige Matt 18 mm |       12 |      1 |        1,137 m² |        1,137 m² |
| Marrom Claro 18 mm      |        5 |      1 |        2,646 m² |        4,168 m² |

Para cada grupo, a área das peças dividida pela maior área útil de uma chapa, arredondada para cima, já exige a quantidade indicada. A soma é 13. Um plano válido com 13 comprova o mínimo de chapas novas nessas condições. Isso não comprova que as posições e sobras sejam o melhor arranjo global possível.

Uma peça especificada em 12 mm não pode ser fabricada numa sobra de 18 mm apenas porque a cor e o encaixe visual são iguais. O sistema destaca a espessura no editor, nos seletores e na análise. Qualquer substituição de especificação deve ser uma alteração explícita do projeto.

## Requisitos conferidos

| Pedido da oficina                        | Estado na versão 1.2                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abrir projetos salvos e voltar depois    | Persistência SQLite e navegação testadas, inclusive histórico antigo incompleto                                                                            |
| Importar peças sem digitar tudo          | Importação XML com medidas, quantidades e metadados reconhecidos                                                                                           |
| Cadastrar/reutilizar MDF automaticamente | Catálogo automático; identidade por material, acabamento, espessura, fornecedor e linha                                                                    |
| Manter medidas exatas de corte           | Sem novo desconto de fita; dimensões não podem ser deformadas no editor                                                                                    |
| Otimizar automaticamente                 | Busca por grupo compatível; alternativas em X/Y; consolidação e comparação de sobras por material                                                          |
| Melhorar um plano já corrigido           | Considera uma revisão válida como base e cria outra alternativa, preservando o histórico                                                                   |
| Ajustar manualmente                      | Seleção, arraste, X/Y, giro permitido, transferência entre chapas compatíveis, desfazer/refazer e validação                                                |
| Ampliar enquanto ajusta                  | Zoom 25–500%, Ctrl + roda, pan, ajuste à tela e tela cheia; dimensões preservadas                                                                          |
| Consultar todas as chapas                | Anterior/Próxima/seletor junto ao editor e ao relatório, sincronizados                                                                                     |
| Peças coloridas e sobras brancas         | Desenho vetorial e PDF com medidas e legenda                                                                                                               |
| Cabeçalho como o plano impresso          | Cliente, projeto, pedido, material, acabamento, fornecedor, código disponível, dimensões, configuração, peças, cortes internos, aproveitamento e data/hora |
| Guardar a ficha da revisão               | Novos planos preservam dados do projeto e peças para o relatório histórico                                                                                 |
| Manter direção do desenho                | Giro bloqueado por padrão fora da política explícita de Branco liso; possibilidade de decisão por peça/material                                            |
| Continuidade do veio entre portas/peças  | Pendente: não modela alinhamento e sequência visual entre várias peças                                                                                     |
| Não cortar atravessando outra peça       | Árvore de cortes passantes por bloco, kerf, refilos, fases e alcance conferidos no servidor                                                                |
| Muitos cortes/giros físicos              | Não limita quantidade por um custo arbitrário; fases seguem a configuração de 6 da foto. Giro de bloco não autoriza mudar veio                             |
| Acabamento em serra manual               | Pendente: não existe roteiro separado de transferência e acabamento manual                                                                                 |
| Sobras grandes para pedidos futuros      | Preferência por maior retângulo útil e área útil de sobras; mínimos configuráveis                                                                          |
| Registrar sobras por chapa e pedido      | Registra previsões por plano; estoque físico só após confirmar produção, com origem e local                                                                |
| Não usar a mesma sobra duas vezes        | Reservas transacionais; refinamento pode considerar reserva do próprio pedido, nunca de outro                                                              |
| Evitar perder alterações de outra pessoa | Versões, checagem após cálculo e isolamento por empresa/perfil                                                                                             |
| Login e futura revenda                   | Conta, empresas e perfis presentes; operação comercial completa ainda pendente                                                                             |
| XML → sistema → arquivo da máquina       | Leitura e planejamento implementados; exportação Titanium e envio por pasta pendentes                                                                      |
| Receber automaticamente de T:\lotes      | Pendente: a primeira versão usa seleção manual do XML no computador                                                                                        |
| Etiquetas individuais de peças e sobras  | Pendente; identificação e legenda existem no plano, não há impressão individual                                                                            |
| Sincronizar sobras com Promob            | Pendente; os estoques são independentes                                                                                                                    |

## O que mudou no cálculo

A comparação anterior podia favorecer uma grande sobra de um material e deixar outros grupos com perdas fragmentadas. Agora cada grupo é otimizado individualmente. O algoritmo tenta ordenações diferentes, ambas as direções de divisão e transferências para eliminar chapas pouco ocupadas. Uma sequência válida acompanha cada alternativa e é verificada independentemente. A reconstrução tenta primeiro preservar grandes regiões vazias.

A preferência é: menos chapas novas; menos chapas físicas usadas; maior sobra útil; área total útil das sobras; menos cortes. Isso é aplicado por grupo compatível. Há limites de tempo e tentativas: o resultado é o melhor encontrado entre as alternativas examinadas, sem promessa de ótimo global. Não é necessário contratar uma API de IA para calcular.

## Verificação e pendências para a máquina

A coleção Postman também passou em 26 requisições e 33 verificações.

37 testes automatizados cobrem autenticação, isolamento, persistência, XML, catálogo, medidas, giro, guilhotina, alcance/fases, conservação de área, estoque, versões, histórico e fluxos das telas com HTTP real. A demonstração visual foi usada no navegador para verificar zoom, tela cheia, arraste ampliado e troca de chapas. O PDF fictício foi renderizado e inspecionado.

A integração ainda depende de um arquivo real aceito pelo controlador e do projeto correspondente. Não existe geração de G-code ou `.lote` nesta entrega. Também faltam modelar e confirmar o refilo interno de 5 mm, resto na fase de 2,1 mm, limites de pinça/apoio, empilhamento e procedimento da serra manual. O modelo matemático validado não substitui essa homologação.

Para revenda, ainda faltam hospedagem persistente, backups automatizados e restauração, recuperação de contas, licenciamento/cobrança, monitoramento, suporte e revisão de segurança operacional. O piloto não deve ser apresentado como integração de máquina concluída. Detalhes em [LIMITES-E-HOMOLOGACAO.md](LIMITES-E-HOMOLOGACAO.md).
