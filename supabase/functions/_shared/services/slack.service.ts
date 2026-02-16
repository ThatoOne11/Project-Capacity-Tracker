import { SLACK_CONFIG } from "../../_shared/config.ts";

export class SlackService {
    async sendAlert(functionName: string, errorMsg: string): Promise<void> {
        if (!SLACK_CONFIG.webhookUrl) {
            console.warn("No SLACK_WEBHOOK_URL set. Alert skipped.");
            return;
        }

        const payload = {
            text: `🚨 Project Capacity Tracker Sync Failed`,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: "🚨 Project Capacity Tracker Sync Failed",
                        emoji: true,
                    },
                },
                {
                    type: "section",
                    fields: [
                        {
                            type: "mrkdwn",
                            text: `*Function:*\n${functionName}`,
                        },
                        {
                            type: "mrkdwn",
                            text: `*Time:*\n${new Date().toISOString()}`,
                        },
                    ],
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*Error Details:*\n\`\`\`${errorMsg}\`\`\``,
                    },
                },
            ],
        };

        try {
            await fetch(SLACK_CONFIG.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } catch (err) {
            console.error("Failed to send Slack alert:", err);
        }
    }
}
