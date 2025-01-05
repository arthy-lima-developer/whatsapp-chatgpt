import color from "picocolors";
import config from "../config";

export function printIntro(): void {
	console.log("\n");
	console.log(" Whatsapp ChatGPT & DALL-E ");
	console.log("|-------------------------------------------------------------------------------------------------|");
	console.log("| A Whatsapp bot that uses OpenAI's ChatGPT and DALL-E to generate text and images from a prompt. |");
	console.log("|-------------------------------------------------------------------------------------------------|");
	console.log("\n");
}

export function printQRCode(qr: string): void {
	console.log(qr);
	console.log("\nScan the QR code above to login to Whatsapp Web...");
}

export function printLoading(): void {
	console.log("Loading...");
}

export function printAuthenticated(): void {
	console.log("\nAuthenticated, session started!");
}

export function printAuthenticationFailure(): void {
	console.log("\nAuthentication failed!");
}

export function printOutro(): void {
	console.log("\nO bot está pronto para uso!");
	if (config.aiAgentMode) {
		console.log("Olá! Sou a Ana, assistente virtual da Clínica Vitalume.");
		console.log("Estou aqui para ajudar com agendamentos e informações sobre consultas.");
		console.log("\nVocê pode:");
		console.log("1. Enviar mensagens pelo WhatsApp");
		console.log("2. Digitar mensagens aqui no terminal (acesso administrativo)");
		console.log("\nAguardando mensagens... (Digite sua mensagem e pressione Enter)");
		console.log("> ");
	} else {
		console.log("To get started, send a message to the bot with the prompt you want to use.");
		console.log("Use the prefix '!gpt' if configured that way.");
	}
}

export function print(text: string): void {
	console.log("◇ ", text);
	if (config.aiAgentMode) {
		console.log("> ");
	}
}

export function printError(text: string) {
	console.log(color.red("◇") + "  " + text);
}
