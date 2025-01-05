import qrcode from "qrcode";
import { Client, Message, Events, LocalAuth } from "whatsapp-web.js";
import readline from 'readline';

// Constants
import constants from "./constants";

// CLI
import * as cli from "./cli/ui";
import { handleIncomingMessage } from "./handlers/message";

// Config
import { initAiConfig } from "./handlers/ai-config";
import { initOpenAI } from "./providers/openai";

// Create interface for terminal input
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

// Ready timestamp of the bot
export let botReadyTimestamp: Date | null = null;

// Handle terminal input
function setupTerminalInput() {
	rl.on('line', async (input) => {
		if (input.trim()) {
			// Criar um objeto Message simulado para entrada do terminal
			const terminalMessage = {
				from: 'sudo@master',
				to: 'terminal',
				body: input,
				hasMedia: false,
				timestamp: Date.now(),
				fromMe: true,
				hasQuotedMsg: false,
				getChat: async () => ({ isGroup: false }),
				reply: (text: string) => {
					console.log('\n[RESPOSTA]:', text, '\n> ');
					return Promise.resolve();
				}
			};

			// Processar a mensagem
			await handleIncomingMessage(terminalMessage as any);
		}
		process.stdout.write('> ');
	});
}

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

		// Setup terminal input
		setupTerminalInput();

		initAiConfig();
		initOpenAI();
	});

	// WhatsApp message
	client.on(Events.MESSAGE_RECEIVED, async (message: any) => {
		// Ignore if message is from status broadcast
		if (message.from == constants.statusBroadcast) return;

		// Ignore if it's a quoted message, (e.g. Bot reply)
		if (message.hasQuotedMsg) return;

		await handleIncomingMessage(message);
	});

	// Reply to own message
	client.on(Events.MESSAGE_CREATE, async (message: Message) => {
		// Ignore if message is from status broadcast
		if (message.from == constants.statusBroadcast) return;

		// Ignore if it's a quoted message, (e.g. Bot reply)
		if (message.hasQuotedMsg) return;

		// Ignore if it's not from me
		if (!message.fromMe) return;

		await handleIncomingMessage(message);
	});

	// WhatsApp initialization
	client.initialize();
};

start();
