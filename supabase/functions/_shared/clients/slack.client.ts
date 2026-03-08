import { SLACK_CONFIG } from "../config.ts";
import { SlackPayload } from "../types/slack.types.ts";

export class SlackClient {
    private readonly webhookUrl = SLACK_CONFIG.webhookUrl;

    async post(payload: SlackPayload): Promise<void> {
        if (!this.webhookUrl) {
            console.warn(
                "Skipping Slack Notification: No Webhook URL configured.",
            );
            return;
        }

        try {
            const response = await fetch(this.webhookUrl, {
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
}
