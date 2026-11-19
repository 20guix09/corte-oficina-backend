# API do piloto

Base local: `http://localhost:3000`. Envie JSON com `Content-Type: application/json`. Resposta de erro: `{ "erro": "mensagem" }`. Todos os endpoints `/api` exigem sessão, exceto cadastro e login. As rotas usam cookies de sessão; a interface não salva token no localStorage.

Sucesso retorna normalmente `{ "dados": ... }`. `POST` de criação retorna 201; exclusão e logout retornam 204. Versões desatualizadas retornam 409. Campos inválidos retornam 400. Perfil sem permissão retorna 403; registro de outra empresa aparece como 404.

## Conta

| Método   | Rota                 | Corpo / finalidade                                                        |
| -------- | -------------------- | ------------------------------------------------------------------------- |
| GET      | `/health`            | Saúde do processo, sem autenticação                                       |
| POST     | `/api/auth/register` | `nome, empresa, email, senha`; cria empresa e administrador               |
| POST     | `/api/auth/login`    | `email, senha`                                                            |
| GET      | `/api/auth/me`       | Usuário e empresa atuais                                                  |
| POST     | `/api/auth/logout`   | Encerra sessão                                                            |
| PUT      | `/api/auth/password` | `atual, nova`; invalida todas as sessões do usuário                       |
| GET/POST | `/api/equipe`        | Admin; criação com `nome,email,senha,perfil` (`planejador` ou `operador`) |

## Projetos e peças

| Método         | Rota                                | Finalidade                                                                                              |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET/POST       | `/api/projetos`                     | Listar / criar com `nome,cliente,pedido,observacoes`                                                    |
| GET/PUT/DELETE | `/api/projetos/:id`                 | Consultar / substituir dados / excluir                                                                  |
| GET/POST       | `/api/projetos/:id/pecas`           | Listar / cadastrar peça                                                                                 |
| PUT/DELETE     | `/api/projetos/:id/pecas/:pieceId`  | Editar / excluir peça                                                                                   |
| POST           | `/api/projetos/:id/importar`        | `{ xml, versao, substituir: true }`; cadastra/reutiliza chapas automaticamente                          |
| POST           | `/api/projetos/:id/preparar-chapas` | `{}`; prepara catálogo de projetos existentes e aplica migração de giro padrão legado quando necessário |

`PUT` exige `versao` no corpo. `DELETE` exige `?versao=NUMERO`. Edição de peça envia a ficha completa. Exemplo:

```json
{
  "codigo": "PORTA-1",
  "descricao": "Porta inferior",
  "largura": 600,
  "comprimento": 400,
  "espessura": 15,
  "quantidade": 2,
  "material": "MDF",
  "acabamento": "Branco",
  "giroPermitido": false,
  "bordas": "Conferir projeto"
}
```

## Estoque e máquina

`GET/POST /api/materiais`, `PUT/DELETE /api/materiais/:resourceId` e equivalentes em `/api/retalhos`.

Material: `material, acabamento, espessura, comprimento, largura, custo, refilos: {esquerda,direita,superior,inferior}`, mais os opcionais `fornecedor,linha,descricaoMaterial,codigoMaterial,giroPadrao`. Retalho acrescenta `codigo,local`. O status é controlado pelo servidor. Atualizações precisam de `versao`; exclusões de query `versao`.

`GET/PUT /api/maquina`: `nome,serra,corteMaximo,fases,minimoRetalhoLargura,minimoRetalhoComprimento,versao`. Alteração só por administrador.

## Planos

| Método | Rota sob `/api/projetos/:id`    | Corpo / saída                                                                                      |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/planos`                       | Histórico com desenhos e indicadores                                                               |
| POST   | `/otimizar`                     | `{ tentativas: 80, planoBaseId?: "ID" }`; `confirmado` antigo continua aceito, sem obrigatoriedade |
| POST   | `/planos/manual`                | `{ projectVersion, boards }`                                                                       |
| PUT    | `/planos/:planId`               | `{ versao, boards }`; cria revisão nova                                                            |
| POST   | `/planos/:planId/aprovar`       | `{ versao }`                                                                                       |
| POST   | `/planos/:planId/liberar`       | `{ versao }`; volta à revisão e libera sobras                                                      |
| GET    | `/planos/:planId/relatorio`     | Resumo e geometria por chapa, sem exigir aprovação                                                 |
| GET    | `/planos/:planId/relatorio.pdf` | PDF vetorial em anexo, sem exigir aprovação                                                        |
| GET    | `/planos/:planId/exportar`      | JSON interno em anexo, se aprovado e atualizado                                                    |
| POST   | `/planos/:planId/retalhos`      | `{ versao, produzidos: true, local: "Estante A" }`                                                 |

`boards` é uma lista de `{id, source, sourceId, pieces}`. `source` é `material` ou `scrap`; `sourceId` é o registro daquela empresa. Cada posição contém `{unitId,x,y,w,h}`. `unitId` é `ID_DA_LINHA:NUMERO_DA_UNIDADE`, começando em 1. O servidor carrega as dimensões físicas do estoque; não aceita dimensões de chapa inventadas pelo editor.

O limite de `tentativas` é 1–200 por material, sob limite total de tempo. `planoBaseId` é opcional: considera esse plano do mesmo projeto, quando ainda compatível. Sem ele, procura uma revisão recente compatível. A resposta inclui `analysis.grupos`, limites de área e `search`. A análise refere-se ao estoque considerado naquele cálculo; não é uma cotação nem uma garantia física da máquina.

`projectVersion` é a revisão atual das peças/projeto, distinta da `versao` do plano. Alterações de posições criam outra versão de plano sem alterar a lista de peças.

Não existe endpoint de exportação `.lote` nem um endpoint de execução de máquina. O recebimento de comandos pela Titanium não está integrado.

## Conferência de referência Titanium

`POST /api/projetos/:id/titanium/analisar`, para admin/planejador:

```json
{"xml": "<br.com.scmtecmatic.titanium.lote ...>...</br.com.scmtecmatic.titanium.lote>", "unidadeEtiqueta": "cm"}
```

`xml` tem no máximo 2 MB. `unidadeEtiqueta` aceita `cm` (padrão) ou `mm`; um sufixo explícito na etiqueta prevalece. Os números de material/programa/comando são lidos em mm. Documento inválido, DTD, números negativos, IDs repetidos no mesmo escopo ou limites excedidos retornam 400. Limites: 100 materiais, 500 programas, 10.000 comandos e 5.000 unidades etiquetadas.

`dados` contém `nome`, `versaoFormato`, `projectVersion`, `materiais`, `programas`, `pecas`, `resumo`, `comparacao`, `execucaoValidada: false` e `aviso`. A comparação de medidas/espessura/quantidade desconsidera orientação. Os materiais são comparados apenas quando o código da peça tem correspondência única na listagem; não há associação inventada para IDs de repetições. Nenhum registro é modificado nem persistido. O resultado fica transitório no frontend e é descartado ao mudar de projeto/revisão.

`GET /api/projetos/:id/planos/:planId/etiquetas.pdf` fornece PDF de etiquetas com páginas de 100 × 60 mm, uma por unidade, usando a ficha preservada no plano. Operador também pode baixar. Não exige aprovação; status/revisão aparecem no PDF. Histórico sem ficha original retorna 409; plano de outra empresa/projeto retorna 404. Textos longos podem ser abreviados; bordas mantêm a referência original. Não dispara impressão física.

## Convenção dos nomes operacionais

`GET/PUT /api/maquina` inclui `perfilCadastros`, com `literal` (padrão) ou `pontual`. Só admin altera. O PUT de um cliente antigo que omite esse campo preserva a configuração existente. Um perfil inválido retorna 400. O perfil integra a versão das regras e o snapshot do plano.

O endpoint `titanium/analisar` usa exclusivamente o perfil persistido da empresa; não aceita substituição por parâmetro do cliente. A resposta inclui `perfilCadastros`, interpretação textual dos materiais, `nomesOperacionaisExplicados`, `divergenciasNaoExplicadas` e, nas correspondências, `formatoProjeto`, `formatoLote`, `formatoDiferente` e `nomeOperacionalExplicado`. `materialConfere` continua representando a comparação literal; uma explicação operacional não libera a execução.
