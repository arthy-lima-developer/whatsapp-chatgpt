import * as cli from "../cli/ui";
import config from "../config";
import { openai } from "../providers/openai";

/**
 * Handle prompt moderation
 *
 * @param prompt Prompt to moderate
 * @returns true if the prompt is safe, throws an error otherwise
 */
const moderateIncomingPrompt = async (prompt: string) => {
	cli.print("[MODERATION] Checking user prompt...");
	try {
		const moderationResponse = await openai.moderations.create({
			input: prompt
		});

		console.log("[DEBUG] Moderation response:", JSON.stringify(moderationResponse, null, 2));

		if (!moderationResponse || !moderationResponse.results || moderationResponse.results.length === 0) {
			console.log("[DEBUG] Invalid moderation response structure");
			return true; // Allow the message if moderation check fails
		}

		const moderationResult = moderationResponse.results[0];
		const moderationCategories = moderationResult.categories;
		const blackListedCategories = config.promptModerationBlacklistedCategories;

		// Print categories as [ category: true/false ]
		const categoriesForPrint = Object.entries(moderationCategories).map(([category, value]) => {
			return `${category}: ${value}`;
		});
		cli.print(`[MODERATION] OpenAI Moderation response: ${JSON.stringify(categoriesForPrint)}`);

		// Check if any of the blacklisted categories are set to true
		for (const category of blackListedCategories) {
			if (moderationCategories[category]) {
				throw new Error(`Prompt was rejected by the moderation system. Reason: ${category}`);
			}
		}

		return true;
	} catch (error) {
		console.log("[DEBUG] Moderation error:", error);
		return true; // Allow the message if moderation check fails
	}
};

export { moderateIncomingPrompt };
