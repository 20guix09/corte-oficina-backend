import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT deve ser um inteiro entre 1 e 65535.');
  process.exit(1);
}

const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`Corte Oficina API em http://localhost:${port}`);
  console.log('Etapa 1: projetos em memória. Reiniciar apaga todos os projetos.');
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `A porta ${port} já está ocupada.` : error.message);
  process.exitCode = 1;
});
