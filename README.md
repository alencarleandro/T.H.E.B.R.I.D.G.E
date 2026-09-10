# T.H.E.B.R.I.D.G.E

Aplicativos de streaming pessoal de jogos: o PC Windows executa o jogo, captura a tela e o áudio; outro Windows ou Android recebe a transmissão e envia comandos. Versão **0.1.0 experimental, para rede local ou VPN já configurada**.

## Abrir os aplicativos

- **Windows:** `release/THE-BRIDGE-0.1.0-Windows.exe`. É portátil: use o mesmo executável no PC de jogos e no PC receptor.
- **Android:** `release/THE-BRIDGE-0.1.0-Android.apk`. APK de desenvolvimento assinado com chave de debug; transfira para seu celular e permita a instalação desse arquivo. Ainda não é uma publicação em loja.

## Primeira sessão

1. Conecte os dois aparelhos à mesma rede. Para começar, prefira o host por cabo e o receptor em Wi-Fi 5 GHz/6 GHz.
2. Abra o aplicativo no Windows e escolha **Transmitir deste PC**.
3. Escolha o monitor, o perfil e o bitrate. Clique em **Abrir sessão**.
4. No outro PC ou no Android, digite o IP e o código de 24 caracteres mostrados pelo host. Se houver vários IPs, escolha o da rede compartilhada pelos aparelhos.
5. Clique em **Conectar e jogar** e aceite a solicitação no PC host.
6. Deixe o jogo visível no monitor transmitido. No receptor Windows, use **Capturar mouse**; no Android, habilite os controles na tela. Use **Ativar som** caso a reprodução automática de áudio esteja bloqueada.

**Encerrar no host:** botão Encerrar sessão ou **Ctrl + Alt + F12**, inclusive fora da janela, se o atalho estiver disponível no Windows. **Esc** libera o cursor no receptor. Não há acesso sem abrir uma sessão e aprovar o receptor.

O firewall pode solicitar acesso de rede ao executável. Permita na sua rede privada. A sinalização usa **TCP 47831**; WebRTC negocia portas UDP dinâmicas. Não abra essa porta no roteador para a internet. Redes de convidados podem bloquear comunicação entre dispositivos.

## O que esta versão faz

- Captura um monitor Windows e áudio do sistema com Electron/Chromium.
- Transmite vídeo e áudio diretamente por WebRTC, com preferência por H.264. A negociação pode selecionar outro codec compatível.
- Oferece limites de 720p60, 1080p60 e 1080p120, e bitrate máximo entre 5 e 80 Mbps. São parâmetros solicitados, não garantias de resolução/FPS.
- Usa canal confiável para teclas/botões e canal sem retransmissão para movimento relativo do mouse.
- Injeta teclado e mouse no Windows com `SendInput` em um processo C# persistente.
- Libera teclas e botões quando o receptor sai, perde foco, libera o cursor ou deixa de enviar heartbeat.
- Mostra FPS decodificados, bitrate recebido, perda acumulada de pacotes e RTT do par de rede no receptor. **RTT não é latência total entre comando e imagem.** As métricas de vídeo no host ficam sem valor porque ali não há recepção de vídeo.
- Tem pareamento por código aleatório por sessão, aprovação local e limite de um receptor.

## Controles

No Windows receptor, capture o mouse para enviar movimentos relativos, cliques, rolagem e teclas. No Android, o pad WASD move, a área central controla a câmera e os botões enviam espaço/E/R/Esc e cliques.

Controles físicos reconhecidos pela Gamepad API usam **mapeamento para teclado e mouse**, não um controle Xbox virtual:

| Entrada | Saída no PC |
| --- | --- |
| Analógico esquerdo | WASD |
| Analógico direito | Movimento do mouse |
| A / B / X / Y | Espaço / Ctrl / R / E |
| LB / RB | Q / Shift |
| RT | Botão esquerdo do mouse |
| Start | Esc |

O reconhecimento de controles no Android depende do WebView/aparelho. Não há vibração, eixos analógicos nativos nem remapeamento na interface nesta versão. Jogos que exigem controle XInput ou bloqueiam entrada sintética podem não funcionar. Jogos elevados também podem rejeitar comandos de um app não elevado; não há bypass de anti-cheat.

## Limites importantes desta entrega

- É uma base funcional de protótipo, **não uma comprovação de desempenho superior ao Parsec**. Aceleração e buffers ainda são gerenciados pelo Chromium, sem pipeline nativo zero-copy/NVENC próprio.
- O vídeo e os canais de entrada usam a criptografia do WebRTC. **O pareamento/sinalização usam WebSocket sem TLS:** use somente redes confiáveis ou uma VPN criptografada. Não há promessa de proteção contra um atacante presente na rede local.
- Acesso pela internet sem VPN, descoberta automática, STUN/TURN e relay privado ainda não estão implementados.
- Não há cliente iOS, HDR, clipboard, inicialização automática, acesso não assistido ou seleção individual de áudio por jogo.
- 120 FPS, jogos em tela cheia exclusiva e compatibilidade de áudio precisam ser avaliados no hardware real. Comece com janela sem bordas e 720p60/1080p60.

## Desenvolvimento

Windows x64, Node.js, .NET Framework com `csc.exe`; para Android, JDK 21 e SDK Android 35.

```powershell
npm ci
npm run native
npm start
```

```powershell
npm test
npm run test:e2e
npm run build:win
npm run build:android
```

Defina `JAVA_HOME` e `ANDROID_HOME` conforme a instalação local antes de compilar Android. O APK sai originalmente em `android/app/build/outputs/apk/debug/app-debug.apk`. O executável portátil sai em `release/`.

## Estrutura

- `desktop/`: app Windows, processo principal, permissão de captura, sinalização e validação de entrada.
- `native/BridgeInput.cs`: envio de comandos ao Windows; não usa driver virtual.
- `web/`: interface e implementação compartilhada de WebRTC.
- `android/`: aplicativo receptor Capacitor.
- `tests/`: testes de pareamento e transmissão sintética entre janelas Electron.

O teste ponta a ponta usa um vídeo de canvas e uma implementação de entrada simulada. Ele confirma transporte/decodificação e entrega de comandos, mas não mede latência de jogo, não injeta entradas no seu desktop e não substitui teste entre dispositivos físicos.

Referências técnicas: [captura de tela Electron](https://www.electronjs.org/docs/latest/api/desktop-capturer/), [Capacitor Android](https://capacitorjs.com/docs/android), [SendInput da Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).
