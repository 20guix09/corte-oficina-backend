# Corte Oficina — piloto funcional

Planejamento de corte de chapas para a Pontual Móveis: importar uma listagem XML, buscar uma distribuição guilhotinada, ajustar posições manualmente e preservar sobras reaproveitáveis.

Comece por **[COMECE-AQUI.md](COMECE-AQUI.md)** para enviar o pacote ao GitHub e abrir o sistema no Codespaces.

## O que está implementado

- Site responsivo servido pelo próprio Express, sem build nem serviços externos obrigatórios.
- Cadastro de empresas, login, sessão em cookie HttpOnly com expiração de 8 horas, logout e troca de senha.
- Dados separados por empresa e perfis de administrador, planejador e operador.
- Projetos e peças com criação, consulta, edição, exclusão e controle de versão.
- Banco SQLite em disco com transações, chaves estrangeiras e índices de escopo.
- Importação de XML `LISTING ID="Listagem_chapas" UNIT="MM"` do Promob. Pais agrupadores não viram peças.
- Cadastro de chapas por material, acabamento, espessura, dimensões, custo e refilos por lado.
- Cadastro e reutilização de sobras disponíveis, com reserva na aprovação e consumo depois da produção confirmada.
- Busca heurística de múltiplas alternativas, executada em worker, separada do atendimento HTTP.
- Editor SVG: arrastar, informar X/Y, girar peças autorizadas, transferir entre chapas compatíveis, adicionar chapas, retirar posições, desfazer e refazer.
- Montagem manual do zero, preservando a lista original de unidades.
- Validação no servidor de quantidade completa, giro permitido, dimensões, material, espessura, margens, sobreposição, kerf, sequência passante, alcance e fases.
- Histórico de planos e comparação de chapas novas, sobras usadas, aproveitamento, maior sobra útil e custo das chapas.
- Visualização dos cortes internos por bloco, impressão do plano e exportação JSON interna depois da aprovação.
- Registro de sobras úteis apenas após confirmação de produção. Essa confirmação bloqueia novas edições do projeto.
- Testes automatizados, coleção Postman e workflow de testes no GitHub Actions.

## Executar

Requer Node.js 24 e npm. Não requer PostgreSQL, Docker, Python nem uma API de inteligência artificial.

```bash
npm ci
cp .env.example .env
npm test
npm start
```

Abra `http://localhost:3000` se estiver rodando no seu próprio computador. No Codespaces, use a URL da porta encaminhada.

`npm run dev` inicia o servidor com reinício quando o código do servidor muda. Arquivos estáticos podem ser atualizados recarregando o navegador.

## Fluxo desta versão

O operador do escritório exporta o XML de listagem, abre o nosso sistema e escolhe o arquivo. O sistema cria seus próprios dados de peças e planos; não sobrescreve o XML original. O planejador confere os materiais e giros, calcula e faz os ajustes. Depois salva, revisa e imprime ou baixa o JSON interno.

Não há monitoramento automático de `T:\lotes`, envio de arquivo à serra ou instalação do nosso sistema no painel da máquina nesta versão. A posição exata da conversão XML → `.lote` no fluxo existente ainda deve ser confirmada com os arquivos usados na oficina.

## Critério de otimização

Entre os resultados válidos encontrados, a ordem é:

1. Menor quantidade de chapas novas.
2. Maior área do maior retalho que atende aos mínimos cadastrados.
3. Maior área total de retalhos que atendem aos mínimos.
4. Menor quantidade de cortes internos.

A busca combina ordenações e divisões guilhotinadas diferentes; tenta reaproveitar sobras disponíveis antes de abrir chapas novas. Ela tem limite de 200 tentativas e aproximadamente 10 segundos de busca, com timeout externo do worker. Os cortes são reconstruídos e validados depois do encaixe. Um resultado de busca sem sequência válida é descartado.

Isso é a **melhor solução encontrada**, não uma prova de ótimo global. O objetivo não é enumerar todas as combinações possíveis. Uma tentativa pode falhar mesmo existindo outra distribuição viável.

## Unidades e eixos

Tudo é armazenado e enviado pela API em **milímetros**. Área em mm² é convertida para m² somente na apresentação.

| Informação | Tratamento |
| --- | --- |
| Chapa `comprimento` | Dimensão horizontal X do desenho |
| Chapa `largura` | Dimensão vertical Y do desenho |
| Peça XML `WIDTH` | `largura`, dimensão X inicial da peça |
| Peça XML `DEPTH` | `comprimento`, dimensão Y inicial da peça |
| XML `HEIGHT` / referência `THICKNESS` | Espessura |
| XML `REPETITION` | Quantidade inteira de unidades |
| XML `QUANTITY` | Não é usado como quantidade de peças, pois pode representar área |
| Giro | Troca X e Y somente se autorizado na própria peça |
| Refilos | Margem descartada de cada lado; já inclui toda a reserva desse lado |
| Serra | Largura consumida por cada corte interno, descontada uma vez |

As peças já vêm com as medidas de corte, conforme informado pela oficina. Não há novo desconto de fita de borda. Referências de bordas são preservadas como informação, sem gerar usinagem.

Todas as peças importadas começam com giro bloqueado. `PLATECUTTINGROTATE=NONE` não é usado como autorização automática. Girar fisicamente um bloco durante o trabalho não libera a rotação da peça no desenho.

## Perfis

| Ação | Administrador | Planejador | Operador |
| --- | --- | --- | --- |
| Consultar projetos, planos, chapas e sobras | Sim | Sim | Sim |
| Imprimir / baixar JSON de plano aprovado | Sim | Sim | Sim |
| Editar peças, otimizar, editar plano e aprovar | Sim | Sim | Não |
| Cadastrar chapas e sobras | Sim | Sim | Não |
| Confirmar produção | Sim | Sim | Não |
| Cadastrar pessoas e alterar regras da máquina | Sim | Não | Não |

Não existe usuário nem senha padrão no banco entregue. A primeira pessoa cadastra a própria empresa e vira administrador dela. E-mails são únicos nesta instalação. Cadastro de equipe é direto; o sistema não envia convites ou senhas por e-mail.

## Organização

| Arquivo / pasta | Responsabilidade |
| --- | --- |
| `src/server.js` | Porta, ambiente e ciclo de vida do servidor |
| `src/app.js` | Configuração Express, segurança HTTP e tratamento de erros |
| `src/routes/api.js` | Rotas HTTP, autorização e coordenação das transações |
| `src/repositories/accounts.js` | Persistência de empresas, pessoas e sessões |
| `src/validation.js` | Contratos e validações de entrada |
| `src/db.js` | Repositório SQLite, isolamento e versões |
| `src/auth.js` | Hash de senhas e sessões |
| `src/xml.js` | Leitura da listagem do Promob |
| `src/engine.js` | Encaixe e validação matemática do corte |
| `src/optimizer-worker.js` | Execução do cálculo fora da thread HTTP |
| `public/app.js` | Telas e fluxo de trabalho |
| `public/editor.js` | Desenho SVG e eventos de arraste |
| `tests` | Testes de API, cálculo, XML, persistência e DOM |
| `postman` | Coleção de teste manual / runner |
| `exemplos` | Dados fictícios para primeiro uso |

O acesso ao banco está separado das rotas. O piloto usa uma tabela de registros com JSON para reduzir código repetitivo; isso não é uma modelagem relacional final de todos os módulos. Para ampliar relatórios e escalar a revenda, planeje migrações de esquema e tabelas específicas.

## Ambiente e publicação futura

`PORT` é 3000, `DB_PATH` é `./data/corte.sqlite` e `COOKIE_SECURE` começa `false` para localhost. Em HTTPS, configure `COOKIE_SECURE=true`. As chamadas da interface usam a mesma origem do servidor, sem CORS aberto. Se um proxy reescrever o cabeçalho Host e o servidor recusar a origem, configure `APP_ORIGIN` com a URL pública exata (protocolo e host, sem caminho) e reinicie.

Use um servidor Node com disco persistente, HTTPS e backup privado para a operação contínua. Esta versão é para uma instância de servidor. Não coloque o banco em uma pasta pública, não use disco efêmero e não compartilhe o arquivo SQLite entre múltiplos servidores. Deploy em hospedagem apenas estática ou em funções sem armazenamento persistente não atende ao banco atual.

Codespaces é ambiente de desenvolvimento, não a hospedagem final da oficina. Um computador com o servidor e o banco local pode operar sem internet depois da instalação, mas o pacote não é um aplicativo instalável nem uma PWA com sincronização offline.

## Limites

Até 500 unidades por projeto, XML até 2 MB, JSON HTTP até 5 MB, 1 cálculo por empresa por vez. O usuário revisa cadastros antes de calcular. A configuração inicial vem de informações da oficina e contém valores ainda provisórios.

Não estão implementados: exportação `.lote`/G-code, integração Titanium, acompanhamento automático de pasta, etiquetas individuais de produção, sincronização com o estoque de sobras do Promob, continuidade visual entre várias peças, furação/usinagem, faturamento/assinaturas, recuperação de senha por e-mail ou gestão comercial de licenças.

Não use o valor de sobra como "prejuízo" automático. O sistema distingue área de peças e retalhos úteis, mas não calcula venda futura do retalho, custo de mão de obra, energia, compra efetiva ou lucro. Chapas novas cadastradas têm disponibilidade ilimitada; só as sobras têm controle de disponibilidade nesta versão.

Consulte [docs/LIMITES-E-HOMOLOGACAO.md](docs/LIMITES-E-HOMOLOGACAO.md), [docs/API.md](docs/API.md) e [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md).
