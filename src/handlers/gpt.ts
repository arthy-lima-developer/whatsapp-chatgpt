import os from "os";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Message, MessageMedia } from "whatsapp-web.js";
import { chatgpt } from "../providers/openai";
import * as cli from "../cli/ui";
import config from "../config";
import { loadAppointments, getAppointmentsByPhone } from "./appointments";
import { 
	getUserMemory, 
	updateUserMemory, 
	addUserTopic, 
	updateConversationFlow,
	clearUserContext,
	setAppointmentContext,
	setPendingConfirmation,
	cleanupExpiredConfirmations,
	addAdminNote,
	addImportantInfo,
	removeAppointment
} from "./memory";

import { ChatMessage } from "chatgpt";

// TTS
import { ttsRequest as speechTTSRequest } from "../providers/speech";
import { ttsRequest as awsTTSRequest } from "../providers/aws";
import { TTSMode } from "../types/tts-mode";

// Moderation
import { moderateIncomingPrompt } from "./moderation";
import { aiConfig, getConfig } from "./ai-config";

// Mapping from number to last conversation id
const conversations = {};

const handleMessageGPT = async (message: Message, prompt: string) => {
	try {
		// Clean up expired confirmations
		cleanupExpiredConfirmations();

		// Get user memory and last conversation
		const userMemory = getUserMemory(message.from);
		const lastConversationId = conversations[message.from];

		// Verifica se é uma mensagem do número da Ana sem @ana
		if (message.from === process.env.WHATSAPP_NUMBER_ANA && !prompt.toLowerCase().includes('@ana')) {
			cli.print(`[NÚMERO DA ANA] Ignorando processamento GPT de mensagem sem @ana`);
			return;
		}

		// Log modelo e detalhes da mensagem
		cli.print(`[GPT] Modelo em uso: ${process.env.OPENAI_GPT_MODEL}`);
		if (message.from === process.env.WHATSAPP_NUMBER_ANA) {
			cli.print(`[ANA BOT] Processando mensagem com @ana: ${prompt}`);
		} else {
			cli.print(`[GPT] Recebido de ${message.from}: ${prompt}`);
		}
		
		// Log especial se for do número da Ana
		if (message.from === process.env.WHATSAPP_NUMBER_ANA) {
			cli.print(`[ANA] Mensagem do próprio número (com @ana)`);
		}

		// Add topic to user memory
		addUserTopic(message.from, prompt);

		// Prompt Moderation
		if (config.promptModerationEnabled) {
			try {
				await moderateIncomingPrompt(prompt);
			} catch (error: any) {
				message.reply(error.message);
				return;
			}
		}

		const start = Date.now();

		// Check if we have a conversation with the user
		let response: ChatMessage;
		
		// Build the system prompt with enhanced context
		let systemPrompt = "";
		if (config.aiAgentMode) {
			// Base assistant prompt with personality
			systemPrompt = process.env.AI_ASSISTANT_PROMPT?.replace("${AI_AGENT_NAME}", process.env.AI_AGENT_NAME || "")
				.replace("${AI_AGENT_PERSONALITY}", process.env.AI_AGENT_PERSONALITY || "")
				.replace("${ADMIN_NUMBERS}", process.env.ADMIN_NUMBERS || "[]") || "";

			// Log para debug de admin
			if (userMemory.isAdmin) {
				cli.print(`[ADMIN] Detectado mensagem do administrador: ${message.from}`);
				cli.print(`[ADMIN] Ativando modo administrador com acesso total`);
			}

			if (userMemory.isAdmin) {
				systemPrompt = "MODO ADMINISTRADOR ATIVADO - Você está falando com seu chefe.\n\n" + systemPrompt;
				systemPrompt += "\n\nATENÇÃO: Esta é uma interação com um ADMINISTRADOR/CHEFE. " + 
					"Mantenha um tom profissional e direto, fornecendo acesso total às informações e aceitando comandos administrativos. " +
					"Sempre responda com 'Sim, chefe' ou 'Entendi, chefe' ao receber instruções.";
				
				// Adicionar todas as notas administrativas para contexto
				if (userMemory.adminNotes && userMemory.adminNotes.length > 0) {
					systemPrompt += "\n\nHistórico de instruções administrativas:";
					userMemory.adminNotes.forEach(note => {
						systemPrompt += `\n- ${note.timestamp}: ${note.note}`;
					});
				}

				// Adicionar resumo de agendamentos do dia
				const today = new Date().toISOString().split('T')[0];
				const appointments = loadAppointments();
				const todayAppointments = appointments.appointments.filter(apt => apt.date === today);
				if (todayAppointments.length > 0) {
					systemPrompt += "\n\nAgendamentos de hoje:";
					todayAppointments.forEach(apt => {
						systemPrompt += `\n- ${apt.time}: ${apt.doctor} - Paciente: ${apt.patient} (${apt.phone}) - Status: ${apt.status}`;
					});
				}
			}
			
			// Add current date and time context
			const now = new Date();
			const dateStr = now.toLocaleDateString('pt-BR', { 
				weekday: 'long', 
				year: 'numeric', 
				month: 'long', 
				day: 'numeric' 
			});
			const timeStr = now.toLocaleTimeString('pt-BR');
			systemPrompt += `\n\nContexto atual:\nData: ${dateStr}\nHora: ${timeStr}\nNúmero do usuário: ${message.from}`;

			// Add user context
			systemPrompt += "\n\nContexto do usuário:";
			if (userMemory.name) {
				systemPrompt += `\nNome: ${userMemory.name}`;
			}
			if (userMemory.context.preferredDoctor) {
				systemPrompt += `\nMédico preferido: ${userMemory.context.preferredDoctor}`;
			}
			if (userMemory.context.preferredTimes) {
				systemPrompt += `\nHorários preferidos: ${userMemory.context.preferredTimes.join(", ")}`;
			}
			if (userMemory.context.importantInfo && userMemory.context.importantInfo.length > 0) {
				systemPrompt += "\nInformações importantes:";
				userMemory.context.importantInfo.forEach(info => {
					systemPrompt += `\n- ${info}`;
				});
			}

			// Add backstory if user is not admin
			if (!userMemory.isAdmin) {
				systemPrompt += "\n\nSeu background (não compartilhe diretamente):\n" + 
					process.env.AI_AGENT_BACKSTORY;
			}

			// Add conversation flow
			if (userMemory.conversationFlow.currentStep) {
				systemPrompt += `\n\nFluxo da conversa:\nEtapa atual: ${userMemory.conversationFlow.currentStep}`;
				if (userMemory.conversationFlow.data) {
					systemPrompt += `\nDados da etapa: ${JSON.stringify(userMemory.conversationFlow.data)}`;
				}
			}

			// Add pending confirmation if exists
			if (userMemory.context.pendingConfirmation) {
				const conf = userMemory.context.pendingConfirmation;
				systemPrompt += `\n\nConfirmação pendente:\nMédico: ${conf.doctor}\nData: ${conf.date}\nHorário: ${conf.time}\nExpira em: ${conf.expiresAt}`;
			}

			// Add recent conversation topics
			if (userMemory.topics.length > 0) {
				systemPrompt += "\n\nTópicos recentes da conversa:";
				userMemory.topics.slice(-5).forEach(topic => {
					systemPrompt += `\n- ${topic.timestamp}: ${topic.topic}`;
				});
			}

			// Add user's appointment history
			const userAppointments = getAppointmentsByPhone(message.from);
			if (userAppointments.length > 0) {
				systemPrompt += "\n\nHistórico de consultas do paciente:";
				userAppointments.forEach(apt => {
					systemPrompt += `\n- ${apt.doctor} em ${apt.date} às ${apt.time} (${apt.status})`;
				});
			}
			
			// Add doctor schedules to the context
			systemPrompt += "\n\nHorários dos profissionais:\n" + process.env.DOCTOR_SCHEDULES;
			
			// Add current appointments for today and future
			const appointments = loadAppointments();
			const futureAppointments = appointments.appointments.filter(apt => {
				const aptDate = new Date(apt.date + "T" + apt.time);
				return aptDate >= now;
			});
			systemPrompt += "\n\nAgendamentos futuros:\n" + JSON.stringify(futureAppointments, null, 2);

			// Add instructions for date/time handling
			systemPrompt += "\n\nInstruções adicionais:\n" +
				"- Use a data e hora atual fornecida acima para referência\n" +
				"- Ao falar sobre datas, sempre confirme o dia específico com o usuário\n" +
				"- Se o usuário mencionar 'amanhã', 'hoje', etc., use a data atual como referência\n" +
				"- Mantenha o contexto do histórico de consultas do paciente nas respostas\n" +
				"- Se identificar o nome do paciente durante a conversa, atualize o contexto\n" +
				"- Mantenha o fluxo da conversa atualizado conforme o progresso do agendamento";
		} else if (config.prePrompt) {
			systemPrompt = config.prePrompt;
		}

		if (lastConversationId) {
			// Handle message with previous conversation
			response = await chatgpt.sendMessage(prompt, {
				parentMessageId: lastConversationId,
				systemMessage: systemPrompt
			});
		} else {
			// Handle message with new conversation
			response = await chatgpt.sendMessage(prompt, {
				systemMessage: systemPrompt
			});
		}
		
		// Set conversation id
		conversations[message.from] = response.id;

		// Update conversation flow based on response content
		if (response.text.toLowerCase().includes("qual médico")) {
			updateConversationFlow(message.from, "choosing_doctor");
		} else if (response.text.toLowerCase().includes("qual data")) {
			updateConversationFlow(message.from, "choosing_date");
		} else if (response.text.toLowerCase().includes("qual horário")) {
			updateConversationFlow(message.from, "choosing_time");
		} else if (response.text.toLowerCase().includes("confirma")) {
			updateConversationFlow(message.from, "confirming");
		}

		// Try to extract and update user name if mentioned
		const nameMatch = prompt.match(/meu nome é\s+([^\.,]+)/i);
		if (nameMatch) {
			updateUserMemory(message.from, { name: nameMatch[1].trim() });
		}

		// Handle admin commands
		if (userMemory.isAdmin) {
			if (prompt.startsWith("!nota")) {
				const note = prompt.substring(6);
				addAdminNote(message.from, note);
				message.reply("Nota administrativa adicionada com sucesso!");
				return;
			} else if (prompt.startsWith("!info")) {
				const [_, phone, ...infoWords] = prompt.split(" ");
				const info = infoWords.join(" ");
				addImportantInfo(phone, info, message.from);
				message.reply(`Informação importante adicionada para ${phone}`);
				return;
			} else if (prompt.startsWith("!cancelar")) {
				const [_, date, time] = prompt.split(" ");
				if (removeAppointment(date, time, message.from)) {
					message.reply(`Agendamento de ${date} às ${time} foi cancelado.`);
				} else {
					message.reply("Não foi possível encontrar o agendamento especificado.");
				}
				return;
			}
		}

		const end = Date.now() - start;

		cli.print(`[GPT] Resposta para ${message.from}:`);
		cli.print(`[GPT] Modelo: ${process.env.OPENAI_GPT_MODEL}`);
		cli.print(`[GPT] Tempo de resposta: ${end}ms`);
		cli.print(`[GPT] Conteúdo: ${response.text}`);
		
		if (userMemory.isAdmin) {
			cli.print(`[GPT] Modo: ${message.from === 'sudo@master' ? 'TERMINAL (ADMIN)' : 'ADMINISTRADOR'}`);
		}

		// Se for mensagem do terminal, apenas mostra a resposta no console
		if (message.from === 'sudo@master') {
			return;
		}

		// TTS reply (Default: disabled)
		if (getConfig("tts", "enabled")) {
			sendVoiceMessageReply(message, response.text);
			message.reply(response.text);
			return;
		}

		// Default: Text reply
		message.reply(response.text);
	} catch (error: any) {
		console.error("An error occured", error);
		message.reply("Desculpe, ocorreu um erro. Por favor, tente novamente mais tarde. (" + error.message + ")");
	}
};

const handleDeleteConversation = async (message: Message) => {
	// Delete conversation
	delete conversations[message.from];
	
	// Clear user context
	clearUserContext(message.from);

	// Reply
	message.reply("Conversa reiniciada! Como posso ajudar?");
};

async function sendVoiceMessageReply(message: Message, gptTextResponse: string) {
	var logTAG = "[TTS]";
	var ttsRequest = async function (): Promise<Buffer | null> {
		return await speechTTSRequest(gptTextResponse);
	};

	switch (config.ttsMode) {
		case TTSMode.SpeechAPI:
			logTAG = "[SpeechAPI]";
			ttsRequest = async function (): Promise<Buffer | null> {
				return await speechTTSRequest(gptTextResponse);
			};
			break;

		case TTSMode.AWSPolly:
			logTAG = "[AWSPolly]";
			ttsRequest = async function (): Promise<Buffer | null> {
				return await awsTTSRequest(gptTextResponse);
			};
			break;

		default:
			logTAG = "[SpeechAPI]";
			ttsRequest = async function (): Promise<Buffer | null> {
				return await speechTTSRequest(gptTextResponse);
			};
			break;
	}

	// Get audio buffer
	cli.print(`${logTAG} Generating audio from GPT response "${gptTextResponse}"...`);
	const audioBuffer = await ttsRequest();

	// Check if audio buffer is valid
	if (audioBuffer == null || audioBuffer.length == 0) {
		message.reply(`${logTAG} couldn't generate audio, please contact the administrator.`);
		return;
	}

	cli.print(`${logTAG} Audio generated!`);

	// Get temp folder and file path
	const tempFolder = os.tmpdir();
	const tempFilePath = path.join(tempFolder, randomUUID() + ".opus");

	// Save buffer to temp file
	fs.writeFileSync(tempFilePath, audioBuffer);

	// Send audio
	const messageMedia = new MessageMedia("audio/ogg; codecs=opus", audioBuffer.toString("base64"));
	message.reply(messageMedia);

	// Delete temp file
	fs.unlinkSync(tempFilePath);
}

export { handleMessageGPT, handleDeleteConversation };
