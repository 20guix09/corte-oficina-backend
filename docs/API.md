# API do piloto

Base local: `http://localhost:3000`. Envie JSON com `Content-Type: application/json`. Resposta de erro: `{ "erro": "mensagem" }`. Todos os endpoints `/api` exigem sessão, exceto cadastro e login. As rotas usam cookies de sessão; a interface não salva token no localStorage.

Sucesso retorna normalmente `{ "dados": ... }`. `POST` de criação retorna 201; exclusão e logout retornam 204. Versões desatualizadas retornam 409. Campos inválidos retornam 400. Perfil sem permissão retorna 403; registro de outra empresa aparece como 404.

## Conta

| Método | Rota | Corpo / finalidade |
| --- | --- | --- |
| GET | `/health` | Saúde do processo, sem autenticação |
| POST | `/api/auth/register` | `nome, empresa, email, senha`; cria empresa e administrador |
| POST | `/api/auth/login` | `email, senha` |
| GET | `/api/auth/me` | Usuário e empresa atuais |
| POST | `/api/auth/logout` | Encerra sessão |
| PUT | `/api/auth/password` | `atual, nova`; invalida todas as sessões do usuário |
| GET/POST | `/api/equipe` | Admin; criação com `nome,email,senha,perfil` (`planejador` ou `operador`) |

## Projetos e peças

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET/POST | `/api/projetos` | Listar / criar com `nome,cliente,pedido,observacoes` |
| GET/PUT/DELETE | `/api/projetos/:id` | Consultar / substituir dados / excluir |
| GET/POST | `/api/projetos/:id/pecas` | Listar / cadastrar peça |
| PUT/DELETE | `/api/projetos/:id/pecas/:pieceId` | Editar / excluir peça |
| POST | `/api/projetos/:id/importar` | `{ xml, versao, substituir: true }` |

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

Material: `material, acabamento, espessura, comprimento, largura, custo, refilos: {esquerda,direita,superior,inferior}`. Retalho acrescenta `codigo,local`. O status é controlado pelo servidor. Atualizações precisam de `versao`; exclusões de query `versao`.

`GET/PUT /api/maquina`: `nome,serra,corteMaximo,fases,minimoRetalhoLargura,minimoRetalhoComprimento,versao`. Alteração só por administrador.

## Planos

| Método | Rota sob `/api/projetos/:id` | Corpo / saída |
| --- | --- | --- |
| GET | `/planos` | Histórico com desenhos e indicadores |
| POST | `/otimizar` | `{ confirmado: true, tentativas: 40 }` |
| POST | `/planos/manual` | `{ projectVersion, boards }` |
| PUT | `/planos/:planId` | `{ versao, boards }`; cria revisão nova |
| POST | `/planos/:planId/aprovar` | `{ versao }` |
| POST | `/planos/:planId/liberar` | `{ versao }`; volta à revisão e libera sobras |
| GET | `/planos/:planId/exportar` | JSON interno em anexo, se aprovado e atualizado |
| POST | `/planos/:planId/retalhos` | `{ versao, produzidos: true, local: "Estante A" }` |

`boards` é uma lista de `{id, source, sourceId, pieces}`. `source` é `material` ou `scrap`; `sourceId` é o registro daquela empresa. Cada posição contém `{unitId,x,y,w,h}`. `unitId` é `ID_DA_LINHA:NUMERO_DA_UNIDADE`, começando em 1. O servidor carrega as dimensões físicas do estoque; não aceita dimensões de chapa inventadas pelo editor.

`projectVersion` é a revisão atual das peças/projeto, distinta da `versao` do plano. Alterações de posições criam outra versão de plano sem alterar a lista de peças.

Não existe endpoint de exportação `.lote` nem um endpoint de execução de máquina. O recebimento de comandos pela Titanium não está integrado.
