import qrcode from "qrcode";
import { Client, Message, Events, LocalAuth } from "whatsapp-web.js";

// Constants
import constants from "./constants";

// CLI
import * as cli from "./cli/ui";
import { handleIncomingMessage } from "./handlers/message";

// Config
import { initAiConfig } from "./handlers/ai-config";
import { initOpenAI } from "./providers/openai";

// Ready timestamp of the bot
let botReadyTimestamp: Date | null = null;

// Entrypoint
const start = async () => {
	const wwebVersion = "2.2412.54";
	cli.printIntro();

	// WhatsApp Client
	const client = new Client({
		puppeteer: {
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-web-security",
				"--allow-running-insecure-content",
				"--disable-features=IsolateOrigins,site-per-process"
			],
			headless: false
		},
		authStrategy: new LocalAuth({
			dataPath: constants.sessionPath
		}),
		webVersionCache: {
			type: "remote",
			remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${wwebVersion}.html`
		}
	});

	// WhatsApp auth
	client.on(Events.QR_RECEIVED, (qr: string) => {
		console.log("");
		qrcode.toString(
			qr,
			{
				type: "terminal",
				small: true,
				margin: 2,
				scale: 1
			},
			(err, url) => {
				if (err) throw err;
				cli.printQRCode(url);
			}
		);
	});

	// WhatsApp loading
	client.on(Events.LOADING_SCREEN, (percent) => {
		if (percent == "0") {
			cli.printLoading();
		}
	});

	// WhatsApp authenticated
	client.on(Events.AUTHENTICATED, () => {
		cli.printAuthenticated();
	});

	// WhatsApp authentication failure
	client.on(Events.AUTHENTICATION_FAILURE, () => {
		cli.printAuthenticationFailure();
	});

	// WhatsApp ready
	client.on(Events.READY, () => {
		// Print outro
		cli.printOutro();

		// Set bot ready timestamp
		botReadyTimestamp = new Date();
		cli.print(`[STARTUP] Bot iniciado em: ${botReadyTimestamp.toLocaleString()}`);

		initAiConfig();
		initOpenAI();
	});

	// WhatsApp message
	client.on(Events.MESSAGE_RECEIVED, async (message: any) => {
		// Ignore messages from before bot startup
		const messageTimestamp = new Date(message.timestamp * 1000); // Convert Unix timestamp to Date
		if (botReadyTimestamp && messageTimestamp < botReadyTimestamp) {
			cli.print(`[STARTUP] Ignorando mensagem antiga de ${message.from} | "${message.body}" | ${messageTimestamp.toLocaleString()}`);
			return;
		}

		// Debug log para entender o fluxo da mensagem
		console.log('\n[DEBUG] Nova mensagem recebida:', {
			de: message.from,
			para: message.to,
			conteudo: message.body,
			timestamp: messageTimestamp.toLocaleString()
		});

		// Ignore if message is from status broadcast
		if (message.from == constants.statusBroadcast) return;

		// Ignore if it's a quoted message, (e.g. Bot reply)
		if (message.hasQuotedMsg) return;

		// Bloqueia APENAS mensagens que vierem DO número da Ana e não tiverem @ana
		const isFromAna = message.from === process.env.WHATSAPP_NUMBER_ANA;
		if (isFromAna && !message.body.toLowerCase().includes('@ana')) {
			cli.print(`[ANA] Bloqueando mensagem sem @ana do número ${message.from}`);
			return;
		}

		await handleIncomingMessage(message);
	});

	// Reply to own message
	client.on(Events.MESSAGE_CREATE, async (message: Message) => {
		// Ignore messages from before bot startup
		const messageTimestamp = new Date(message.timestamp * 1000); // Convert Unix timestamp to Date
		if (botReadyTimestamp && messageTimestamp < botReadyTimestamp) {
			cli.print(`[STARTUP] Ignorando mensagem antiga de ${message.from} | "${message.body}" | ${messageTimestamp.toLocaleString()}`);
			return;
		}

		// Ignore if message is from status broadcast
		if (message.from == constants.statusBroadcast) return;

		// Ignore if it's a quoted message, (e.g. Bot reply)
		if (message.hasQuotedMsg) return;

		// Ignore if it's not from me
		if (!message.fromMe) return;

		// Bloqueia APENAS mensagens manuais do número da Ana que não tem @ana
		const isFromAna = message.from === process.env.WHATSAPP_NUMBER_ANA;
		if (isFromAna && !message.body.toLowerCase().includes('@ana')) {
			cli.print(`[ANA] Bloqueando mensagem manual sem @ana do número ${message.from}`);
			return;
		}

		await handleIncomingMessage(message);
	});

	// WhatsApp initialization
	client.initialize();
};

start();

export { botReadyTimestamp };
