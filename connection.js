/**
 * Script de inicialização do bot.
 * Responsável por iniciar a conexão com o WhatsApp.
 * @author Dev Gui
 */
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidStatusBroadcast,
  proto,
  makeInMemoryStore,
  isJidNewsletter,
  delay,
} = require("baileys");
const QRCode = require('qrcode-terminal'); // Adicionado para exibir QR Code
const NodeCache = require("node-cache");
const pino = require("pino");
const { BAILEYS_CREDS_DIR } = require("./config");
const { runLite } = require("./index");
const { onlyNumbers } = require("./utils/functions");
const {
  textInput,
  infoLog,
  warningLog,
  errorLog,
  successLog,
  tutorLog,
  bannerLog,
} = require("./utils/terminal");
const { welcome } = require("./welcome");

const msgRetryCounterCache = new NodeCache();

const store = makeInMemoryStore({
  logger: pino().child({ level: "silent", stream: "store" }),
});

bannerLog();

async function startConnection() {
  const { state, saveCreds } = await useMultiFileAuthState(BAILEYS_CREDS_DIR);

  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    browser: ["Chrome", "Linux", "latest"],    
    logger: pino({ level: "error" }),
    printQRInTerminal: false, // Desativamos o QR nativo para usar o qrcode-terminal
    defaultQueryTimeoutMs: 60 * 1000,
    auth: state,
    shouldIgnoreJid: (jid) =>
      isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid),
    keepAliveIntervalMs: 60 * 1000,
    markOnlineOnConnect: true,
    msgRetryCounterCache,
    shouldSyncHistoryMessage: () => false,
    getMessage: async (key) => {
      if (!store) {
        return proto.Message.fromObject({});
      }

      const msg = await store.loadMessage(key.remoteJid, key.id);
      return msg ? msg.message : undefined;
    },
  });

  if (!socket.authState.creds.registered) {
    warningLog("Credenciais ainda não configuradas!");

    let enableTutor = "s";

    do {
      if (!["s", "n"].includes(enableTutor)) {
        errorLog("Opção inválida! Tente novamente.");
      }

      enableTutor = await textInput(
        "Deseja ativar o tutor com explicações detalhadas para instalação no termux? (s/n): "
      );
    } while (!["s", "n"].includes(enableTutor));

    infoLog('Escaneie o QR Code que aparecerá em breve para vincular sua conta');
  }

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Exibir QR Code no terminal
    if (qr) {
      QRCode.generate(qr, { small: true }, (qrcode) => {
        console.log('┌──────────────────────────────┐');
        console.log('│   ESCANEIE O QR CODE ABAIXO  │');
        console.log('│      PARA CONECTAR O BOT     │');
        console.log('└──────────────────────────────┘');
        console.log(qrcode);
        console.log('┌──────────────────────────────┐');
        console.log('│  O QR CODE EXPIRA EM 60 SEG. │');
        console.log('└──────────────────────────────┘\n');
      });
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (statusCode === DisconnectReason.loggedOut) {
        errorLog("Bot desconectado!");
      } else {
        switch (statusCode) {
          case DisconnectReason.badSession:
            warningLog("Sessão inválida!");
            break;
          case DisconnectReason.connectionClosed:
            warningLog("Conexão fechada!");
            break;
          case DisconnectReason.connectionLost:
            warningLog("Conexão perdida!");
            break;
          case DisconnectReason.connectionReplaced:
            warningLog("Conexão substituída!");
            break;
          case DisconnectReason.multideviceMismatch:
            warningLog("Dispositivo incompatível!");
            break;
          case DisconnectReason.forbidden:
            warningLog("Conexão proibida!");
            break;
          case DisconnectReason.restartRequired:
            infoLog('Me reinicie por favor! Digite "yarn start".');
            break;
          case DisconnectReason.unavailableService:
            warningLog("Serviço indisponível!");
            break;
        }

        startConnection();
      }
    } else if (connection === "open") {
      successLog("Fui conectado com sucesso!");
    }
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("messages.upsert", (data) => {
    runLite({ socket, data });
  });

  socket.ev.on("group-participants.update", (data) => {
    welcome({ socket, data });
  });

  return socket;
}

startConnection().catch(error => {
  errorLog(`Erro ao iniciar: ${error.message}`);
  process.exit(1);
});