# O que falta para comandar a máquina e vender a solução

O pacote executa importação, planejamento e revisão. Ele ainda não está homologado para controlar a seccionadora. "Revisão aprovada" significa que um planejador aprovou o plano dentro das regras implementadas, não uma certificação de que o controlador executará o arquivo.

## Integração Titanium

Precisamos de um arquivo real usado na máquina, com sua extensão exata, e do XML e plano impresso correspondentes ao mesmo trabalho. Não presumir que a extensão é `.lot`, `.lote` ou `.gcode` apenas pela descrição verbal.

Com esses arquivos, confirmar:

- Quem exporta XML, quem converte para o arquivo da máquina, qual programa o operador abre e como escolhe o lote.
- Se `T:\lotes` é uma unidade de rede, seu caminho real e quais arquivos aparecem em cada etapa. Não mudar essa pasta durante testes.
- Modelo e controlador da máquina, versões instaladas, origem dos eixos, unidade, orientação inicial e formato exato de cortes/fases.
- Requisitos de identificação, códigos de peças, etiquetas, sobras, empilhamento e integridade do programa.

Depois será criado um exportador específico, com validação estrutural e comparação com saídas conhecidas. A primeira homologação deve acontecer em ambiente de simulação do controlador, quando disponível, e em teste acompanhado pelo operador, antes de habilitar envio normal.

Não renomear JSON ou um arquivo qualquer para `.lote`. Um arquivo sintaticamente legível não comprova que os movimentos são corretos.

## Parâmetros físicos ainda pendentes

| Tema                                | Estado desta versão                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Chapa 2750 × 1830 mm                | Medida confirmada nesta revisão; importação lê o XML e preserva cadastros existentes                                   |
| Refilos de 15 mm por lado           | Configuráveis; confirmar se a medida inclui a serra e o procedimento real                                              |
| Kerf                                | Default de 5 mm da foto; relatos de 4–4,5 mm precisam ser conciliados                                                  |
| Corte máximo 2800 mm                | Validado como extensão passante do bloco; conferir especificação real                                                  |
| 6 fases                             | Limita mudanças de eixo em cada ramo da árvore; não confundir com número total de cortes                               |
| Refilo interno de 5 mm              | Não implementado como reserva adicional                                                                                |
| Resto na fase de 2,1 mm             | Não implementado                                                                                                       |
| Pinças, apoio e retalhos minúsculos | Limites físicos não modelados; exigem verificação do operador                                                          |
| Empilhamento de 60 mm               | Não há otimização nem programa de empilhamento                                                                         |
| Acabamento manual em outra serra    | Não existe roteiro separado de acabamentos manuais                                                                     |
| Veio / desenho                      | Giro por regra de material, com Branco liso permitido pela regra da oficina; continuidade entre peças não implementada |

A sequência lista cortes internos. Os cortes para executar os refilos externos não fazem parte da árvore nem da contagem exibida. A posição exibida é global no desenho, não uma instrução pronta para digitar no painel.

A máquina da oficina pode ter procedimentos adicionais ao modelo matemático. Se um requisito físico exigir acabamento manual, o operador precisa definir isso; o sistema não declara sozinho que um retalho muito fino é executável.

## Sobras e dados de estoque

Os mínimos de 200 × 400 mm são uma sugestão inicial para filtrar sobras úteis, não uma medida obtida da oficina. Configure conforme a realidade. Uma sobra comprida e estreita pode ter uso na oficina e ser excluída por esse critério; a decisão é ajustável.

Depois da confirmação da produção, as dimensões cadastradas são as calculadas. Confira as dimensões reais e eventuais danos antes de reutilizar. Não cadastre a mesma sobra simultaneamente no Promob e aqui como se fossem dois itens disponíveis; não existe sincronização entre eles.

A aprovação reserva sobras. Retornar à revisão ou alterar peças libera as reservas não produzidas. Confirmar produção consome a reserva e registra as novas sobras uma única vez. Um projeto produzido não aceita novas edições; crie outro projeto para outra execução.

## Uso comercial futuro

A base já separa empresas e perfis. Antes da revenda, ainda é necessário escolher hospedagem persistente, automatizar backups e recuperação, revisar segurança operacional, acrescentar recuperação de contas, gestão de acesso da equipe, termos e política de dados, monitoramento, cobrança/licenças e suporte. O isolamento foi testado nesta versão, mas não substitui uma revisão de segurança para operação pública.

O cadastro de empresas é aberto na instalação. Para uma instalação restrita da oficina, mantenha acesso de rede limitado ou acrescente convite controlado antes de disponibilizá-la publicamente.

## Verificação feita nesta entrega

- 38 testes automáticos, incluindo servidor, autenticação/perfis, isolamento de empresas, reabertura do banco e navegação do editor com servidor real.
- Testes de importação, rejeição de XML inválido/DTD e preservação das quantidades.
- Cálculo com kerf, refilos, orientação, fases, alcance e conservação da área.
- Edição inválida rejeitada, controle de versões, reservas e registro único de sobras.
- Fluxo das telas de projeto/editor com DOM e API simulada, incluindo posição, desfazer/refazer e pedido de salvamento.
- Coleção Postman executada: 26 requisições e 33 verificações sem falha, incluindo importação, refinamento de plano e relatório PDF.
- Inspeção visual do relatório HTML e do PDF renderizado; zoom, tela cheia, navegação e arraste de uma peça ampliada no navegador com exemplo fictício.

Os testes de DOM, incluindo o fluxo com servidor real, não substituem ensaio de arraste em vários dispositivos. O teste de arraste no navegador usou uma demonstração pública com os mesmos módulos do editor; o fluxo autenticado foi conferido por DOM e HTTP real. Não houve execução na máquina, teste de `.lote`, ensaio de carga ou homologação física. O XML particular foi usado apenas na conferência local e não está incluído no pacote.
