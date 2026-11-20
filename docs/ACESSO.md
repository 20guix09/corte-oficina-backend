# Acesso da oficina
A empresa pode usar login e senha assim que iniciar o servidor. Na tela Equipe, o administrador cadastra colaboradores e pode gerar um link de recuperação individual de 30 minutos. Entregue o link diretamente à pessoa. O link mais recente substitui o anterior. A troca de senha encerra as sessões existentes.

## Recuperação por e-mail
Defina APP_ORIGIN no .env com a URL pública exata do aplicativo. Configure RESEND_API_KEY e EMAIL_FROM com uma chave e um remetente autorizado da sua conta Resend. Reinicie o servidor. Em Esqueci minha senha, solicite um link e confira a entrega na caixa da própria oficina. Em caso de falha confira o remetente e o painel de entregas do provedor. Para recuperar o acesso do único administrador, habilite o envio por e-mail.

## Continuar com Google
Crie credenciais de aplicativo Web no Google Cloud. Cadastre a URL de redirecionamento exata, por exemplo https://sua-oficina.example/api/auth/google/callback. No .env defina APP_ORIGIN, GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET e reinicie. Use HTTPS e COOKIE_SECURE=true na instalação pública. A oficina pode testar em localhost com a origem cadastrada para desenvolvimento.

No primeiro acesso pelo Google, quem já tem conta confirma a senha para vincular sua identidade. O gestor que está criando a empresa informa os dados e define uma senha alternativa. Quem só precisa entrar como colaborador deve pedir acesso ao gestor. Nas próximas visitas o Google abre a mesma conta com suas permissões existentes.

## Antes de disponibilizar para clientes
Confira os termos do piloto com o responsável pela instalação e adapte a identificação do responsável, canais de atendimento e política de retenção à operação da empresa. Teste a entrega real de e-mail e o retorno do Google no endereço em que o sistema será usado. Mantenha o arquivo .env e o banco fora do GitHub.

## Conferência visual reproduzível
O roteiro opcional em `qa/layout.py` usa um banco temporário em memória. Ele verifica largura da página e dos diálogos, cadastro, navegação, mudança de chapa e zoom a 320, 390, 768, 1024 e 1440 pixels. Na raiz do projeto com Node 24 e as dependências instaladas, use um ambiente Python com Playwright e Chromium:

```bash
python -m pip install playwright
python -m playwright install chromium
python qa/layout.py
```

O navegador deste ambiente de preparação não conseguiu abrir a prévia local. A execução visual desse roteiro fica para uma máquina com Chromium disponível. Os testes de formulários, navegação e servidor rodam separadamente com `npm test`.
