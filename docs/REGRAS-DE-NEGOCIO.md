# Regras implementadas no piloto

1. Uma empresa consulta e altera somente seus próprios registros. Administrador e planejador editam; operador consulta e imprime.
2. Dimensões são numéricas, finitas, positivas e em mm. Quantidade é inteira e positiva. Limite total de 500 unidades por projeto.
3. Dimensões de corte não são ajustadas por fita de borda. Cada unidade tem identidade derivada da linha e do número de repetição.
4. Cada peça precisa aparecer exatamente uma vez no plano final. Não dividir uma peça entre chapas nem alterar suas dimensões no editor.
5. Uma chapa recebe somente peças do mesmo material, acabamento e espessura. Nomes precisam corresponder ao cadastro; não há equivalência por aproximação de texto.
6. Giro de 90° depende de autorização explícita na peça. Importação começa bloqueada. Não inferir autorização pela cor branca nem pelo nome do material.
7. Refilos reduzem a área útil em cada lado. Entre peças existe espaço para a serra. O encaixe não pode sobrepor peças nem sair da área útil.
8. Cada corte atravessa completamente o bloco atual. Ele não pode atravessar uma peça. Depois, os blocos resultantes podem ser cortados separadamente.
9. A fase aumenta quando o eixo muda ao longo de um ramo de cortes. O número total de cortes pode ser maior que o número de fases.
10. A extensão passante de cada corte não pode superar o alcance configurado.
11. A busca prioriza menos chapas novas, depois maior sobra útil, depois área útil total de sobras e por fim menos cortes. O custo é informativo; tipos de chapa com preços diferentes não são comparados por um objetivo financeiro completo.
12. Retalhos úteis precisam atender aos dois mínimos cadastrados, considerando lado menor e lado maior. Área e retalhos vêm da árvore de corte, não de uma diferença de porcentagem.
13. O mesmo retalho físico não pode ser usado duas vezes. A busca apenas considera disponíveis; a reserva só ocorre quando o plano é aprovado.
14. Aprovar uma alternativa revoga a aprovação das outras alternativas do mesmo projeto. Retalhos reservados em outro projeto não podem ser aprovados novamente.
15. O XML original é preservado no computador do usuário. A importação substitui as peças do projeto somente com confirmação, após validar o documento inteiro.
16. Alterar peças ou dados do projeto muda sua revisão, desatualiza os planos anteriores e libera reservas não produzidas. Um plano desatualizado serve para consulta, sem aprovação ou exportação.
17. Edição manual valida no servidor e cria outra versão do plano. Se falhar, nenhum plano inválido é salvo nem liberado para aprovação.
18. Alterar as regras de máquina exige um novo cálculo antes de aprovar. Mudança no cadastro físico da chapa também exige salvar/recalcular uma revisão compatível.
19. Exportar JSON exige plano aprovado e atualizado. Esse arquivo é interno, sem compatibilidade declarada com Titanium.
20. Confirmar produção exige aprovação e confirmação explícita de que os cortes aconteceram. A operação é transacional e só registra as sobras uma vez. O projeto fica bloqueado para novas peças/cálculos.
21. Valores de custo de chapas não significam prejuízo, lucro ou compra confirmada. Retalhos não têm revenda futura presumida.
22. Exportação de comando da máquina permanece desabilitada até implementar e homologar o formato real.
