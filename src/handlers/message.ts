import { Message } from "whatsapp-web.js";
import { startsWithIgnoreCase } from "../utils";

// Config & Constants
import config from "../config";

// CLI
import * as cli from "../cli/ui";

// ChatGPT & DALLE
import { handleMessageGPT, handleDeleteConversation } from "../handlers/gpt";
import { handleMessageDALLE } from "../handlers/dalle";
import { handleMessageAIConfig, getConfig, executeCommand } from "../handlers/ai-config";
import { handleMessageLangChain } from "../handlers/langchain";
import { getUserMemory } from "./memory";

// Speech API & Whisper
import { TranscriptionMode } from "../types/transcription-mode";
import { transcribeRequest } from "../providers/speech";
import { transcribeAudioLocal } from "../providers/whisper-local";
import { transcribeWhisperApi } from "../providers/whisper-api";
import { transcribeOpenAI } from "../providers/openai";

// For deciding to ignore old messages
import { botReadyTimestamp } from "../index";

// Handles message
async function handleIncomingMessage(message: Message) {
	let messageString = message.body;

	// Verifica se a mensagem está relacionada ao número da Ana de alguma forma
	const isAnaNumber = message.from === process.env.WHATSAPP_NUMBER_ANA;
	const isManualFromAna = message.fromMe && (message.from === process.env.WHATSAPP_NUMBER_ANA || message.to === process.env.WHATSAPP_NUMBER_ANA);

	// Se for uma mensagem manual do número da Ana, ignora completamente
	if (isManualFromAna) {
		cli.print(`[NÚMERO DA ANA] Mensagem enviada manualmente por um humano usando o número: ${messageString}`);
		return;
	}

	// Se for uma mensagem do número da Ana (não manual), precisa do @ana
	if (isAnaNumber) {
		if (!messageString.toLowerCase().includes('@ana')) {
			cli.print(`[NÚMERO DA ANA] Mensagem recebida sem @ana (ignorando): ${messageString}`);
			return;
		}
		cli.print(`[ANA BOT] Mensagem recebida com @ana (processando): ${messageString}`);
		messageString = messageString.replace(/@ana/gi, '').trim();
	}

	// Get user memory and last conversation
	const userMemory = getUserMemory(message.from);

	// Ignore groupchats if disabled
	if ((await message.getChat()).isGroup && !config.groupchatsEnabled) return;

	const selfNotedMessage = message.fromMe && message.hasQuotedMsg === false && message.from === message.to;

	if (config.whitelistedEnabled) {
		const whitelistedPhoneNumbers = getConfig("general", "whitelist");

		if (!selfNotedMessage && whitelistedPhoneNumbers.length > 0 && !whitelistedPhoneNumbers.includes(message.from)) {
			cli.print(`Ignoring message from ${message.from} because it is not whitelisted.`);
			return;
		}
	}

	// Transcribe audio
	if (message.hasMedia) {
		const media = await message.downloadMedia();

		// Ignore non-audio media
		if (!media || !media.mimetype.startsWith("audio/")) return;

		// Check if transcription is enabled (Default: false)
		if (!getConfig("transcription", "enabled")) {
			cli.print("[Transcription] Received voice messsage but voice transcription is disabled.");
			return;
		}

		// Convert media to base64 string
		const mediaBuffer = Buffer.from(media.data, "base64");

		// Transcribe locally or with Speech API
		const transcriptionMode = getConfig("transcription", "mode");
		cli.print(`[Transcription] Transcribing audio with "${transcriptionMode}" mode...`);

		let res;
		switch (transcriptionMode) {
			case TranscriptionMode.Local:
				res = await transcribeAudioLocal(mediaBuffer);
				break;
			case TranscriptionMode.OpenAI:
				res = await transcribeOpenAI(mediaBuffer);
				break;
			case TranscriptionMode.WhisperAPI:
				res = await transcribeWhisperApi(new Blob([mediaBuffer]));
				break;
			case TranscriptionMode.SpeechAPI:
				res = await transcribeRequest(new Blob([mediaBuffer]));
				break;
			default:
				cli.print(`[Transcription] Unsupported transcription mode: ${transcriptionMode}`);
		}
		const { text: transcribedText, language: transcribedLanguage } = res;

		// Check transcription is null (error)
		if (transcribedText == null) {
			message.reply("I couldn't understand what you said.");
			return;
		}

		// Check transcription is empty (silent voice message)
		if (transcribedText.length == 0) {
			message.reply("I couldn't understand what you said.");
			return;
		}

		// Log transcription
		cli.print(`[Transcription] Transcription response: ${transcribedText} (language: ${transcribedLanguage})`);

		// Reply with transcription
		if (config.ttsTranscriptionResponse) {
			const reply = `You said: ${transcribedText}${transcribedLanguage ? " (language: " + transcribedLanguage + ")" : ""}`;
			message.reply(reply);
		}

		// Handle message GPT
		await handleMessageGPT(message, transcribedText);
		return;
	}

	// If AI Agent mode is enabled and message doesn't start with any special command prefix
	if (config.aiAgentMode && 
		!startsWithIgnoreCase(messageString, config.resetPrefix) &&
		!startsWithIgnoreCase(messageString, config.aiConfigPrefix) &&
		!startsWithIgnoreCase(messageString, config.dallePrefix) &&
		!startsWithIgnoreCase(messageString, config.stableDiffusionPrefix)) {
		
		// If message starts with !gpt, remove the prefix
		if (startsWithIgnoreCase(messageString, config.gptPrefix)) {
			messageString = messageString.substring(config.gptPrefix.length + 1);
		}
		
		await handleMessageGPT(message, messageString);
		return;
	}

	// Clear conversation context (!clear)
	if (startsWithIgnoreCase(messageString, config.resetPrefix)) {
		await handleDeleteConversation(message);
		return;
	}

	// AiConfig (!config <args>)
	if (startsWithIgnoreCase(messageString, config.aiConfigPrefix)) {
		const prompt = messageString.substring(config.aiConfigPrefix.length + 1);
		await handleMessageAIConfig(message, prompt);
		return;
	}

	// GPT (!gpt <prompt>)
	if (startsWithIgnoreCase(messageString, config.gptPrefix)) {
		const prompt = messageString.substring(config.gptPrefix.length + 1);
		await handleMessageGPT(message, prompt);
		return;
	}

	// DALLE (!dalle <prompt>)
	if (startsWithIgnoreCase(messageString, config.dallePrefix)) {
		const prompt = messageString.substring(config.dallePrefix.length + 1);
		await handleMessageDALLE(message, prompt);
		return;
	}

	// Stable Diffusion (!sd <prompt>)
	if (startsWithIgnoreCase(messageString, config.stableDiffusionPrefix)) {
		const prompt = messageString.substring(config.stableDiffusionPrefix.length + 1);
		await executeCommand("sd", "generate", message, prompt);
		return;
	}

	// GPT (only <prompt>) - this is now handled by AI Agent mode above
	if (!config.aiAgentMode && (!config.prefixEnabled || (config.prefixSkippedForMe && selfNotedMessage))) {
		await handleMessageGPT(message, messageString);
		return;
	}
}

export { handleIncomingMessage };
