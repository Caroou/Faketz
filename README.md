<div align="center">
  <h1>Faketz</h1>
  <p><b>Chamadas de voz e compartilhamento de tela de altíssima qualidade (1080p 60fps).</b></p>
</div>

Um clone simplificado e levíssimo focado no que importa: transmissão de tela fluida usando conexões Peer-to-Peer diretas. Disponível pelo Navegador e em Aplicativo Desktop.

## ✨ Destaques

- 🚀 **Aplicativo Desktop Dedicado:** Feito com Electron, o `.exe` nativo burla as limitações de energia dos navegadores para entregar compartilhamento cravado em **60 FPS**, ideal para jogos.
- 📺 **Qualidade "Nitro" Gratuita:** SDP modificado para forçar taxa de bits máxima.
- 🎙️ **Áudio de Estúdio & Cancelamento de Eco:** Ganho automático nativo ativado para equalizar os volumes, com opção rápida para ligar/desligar o Filtro de Ruído a qualquer momento. Um supressor de loopback isola a voz dos amigos, impedindo microfonia (eco) nas transmissões de tela.
- 🖼️ **Pop-up Flutuante (Picture-in-Picture):** Assista às telas dos seus amigos em uma mini-janela flutuante por cima dos seus jogos ou trabalho.
- 🎨 **Design Moderno:** Interface polida (Tailwind CSS) com deteção dinâmica de voz e métricas de rede em tempo real.

## 📥 Instalação

### Usando o Aplicativo Desktop (Recomendado para 60 FPS)
Baixe a versão mais recente em [Releases](https://github.com/Caroou/Faketz/releases/download/setup/Faketz.Setup.1.0.2.exe) e instale no Windows.

### Rodando o Servidor (Desenvolvimento)
1. Instale as dependências: `npm install`
2. Inicie o servidor Web e de Sinalização: `npm start`
3. Acesse `http://localhost:3000`

### Gerando o Instalador (.exe)
Para compilar o aplicativo para o Windows a partir do código fonte:
```bash
# Abra o terminal como Administrador
npm run build:exe
```
O executável será gerado na pasta `dist/`.

## ☁️ Hospedagem
O servidor atua apenas conectando os usuários (sinalização via Socket.io). Sendo assim, o consumo de banda é ínfimo. Recomenda-se hospedar o código em plataformas como **Render** ou **Koyeb** (Vercel Serverless não é compatível com WebSockets longos).

---
*Feito para gamers e amigos que não abrem mão de qualidade.*
