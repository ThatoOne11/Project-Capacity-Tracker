export class SlackService {
    private webhookUrl: string;

    constructor() {
        this.webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";
    }

    async sendAlert(functionName: string, errorMsg: string): Promise<void> {
        if (!this.webhookUrl) {
            console.warn("⚠️ No SLACK_WEBHOOK_URL set. Alert skipped.");
            return;
        }

        const payload = {
            text: `🚨 *Supabase Error* in \`${functionName}\``,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: "🚨 Process Failed",
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
            await fetch(this.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } catch (err) {
            console.error("Failed to send Slack alert:", err);
        }
    }
}
