import { SLACK_CONFIG } from "../config.ts";
import { ApiConstants } from "../constants/api.constants.ts";
import { SlackPayload } from "../types/slack.types.ts";
import { fetchWithBackoff } from "../utils/api.utils.ts";

export class SlackClient {
    private readonly webhookUrl: string = SLACK_CONFIG.webhookUrl;

    async post(payload: SlackPayload): Promise<void> {
        if (!this.webhookUrl) {
            console.warn(
                "Skipping Slack Notification: No Webhook URL configured.",
            );
            return;
        }

        try {
            const response = await fetchWithBackoff(this.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                console.error(
                    `Slack API Error: ${response.status} ${response.statusText} - ${await response
                        .text()}`,
                );
            }
        } catch (err) {
            console.error("Failed to send Slack payload:", err);
        }
    }

    // Fetches all human members in the workspace
    async getWorkspaceMembers(): Promise<unknown> {
        if (!SLACK_CONFIG.botToken) {
            throw new Error("SLACK_BOT_TOKEN is missing.");
        }

        const response = await fetchWithBackoff(
            `${ApiConstants.SLACK_BASE_URL}/users.list`,
            {
                headers: { Authorization: `Bearer ${SLACK_CONFIG.botToken}` },
            },
        );

        if (!response.ok) {
            throw new Error(`Slack API Error [${response.status}]`);
        }
        return response.json();
    }

    // Sends a private DM to a specific user ID
    async postDirectMessage(
        slackUserId: string,
        payload: SlackPayload,
    ): Promise<void> {
        if (!SLACK_CONFIG.botToken) {
            throw new Error("SLACK_BOT_TOKEN is missing.");
        }

        const response = await fetchWithBackoff(
            `${ApiConstants.SLACK_BASE_URL}/chat.postMessage`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${SLACK_CONFIG.botToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ channel: slackUserId, ...payload }),
            },
        );

        if (!response.ok) {
            throw new Error(`Slack DM Error [${response.status}]`);
        }
    }
}
