import { SLACK_CONFIG } from "../../_shared/config.ts";
import { SlackPayload, SyncReportStats } from "../types/types.ts";

export class SlackService {
    private readonly webhookUrl = SLACK_CONFIG.webhookUrl;

    //Sends a critical alert for system failures
    async sendAlert(functionName: string, errorMsg: string): Promise<void> {
        if (!this.webhookUrl) {
            console.warn("Skipping Slack Alert: No Webhook URL configured.");
            return;
        }

        const payload: SlackPayload = {
            text: "🚨 Project Capacity Tracker Sync Failed",
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

        await this.postToSlack(payload);
    }

    //Formats and sends the Daily DevOps Sync Report
    async sendSyncReport(stats: SyncReportStats): Promise<void> {
        if (!this.webhookUrl) return;

        const payload: SlackPayload = {
            text: "[Project Capacity Tracker] Sync Report", // Fallback for mobile notifications
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: "[Project Capacity Tracker] - Sync Report",
                        emoji: true,
                    },
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: `*Status:* ${
                                stats.status === "SUCCESS"
                                    ? "SUCCESS 🟢"
                                    : "FAILED 🔴"
                            }   |   *Duration:* ${stats.durationSeconds}s`,
                        },
                    ],
                },
                {
                    type: "divider",
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Stats:*\n" +
                            `-  *${stats.upserted}* time entries updated\n` +
                            `-  *${stats.deleted}* soft deleted\n` +
                            `-  *${stats.usersScanned}* users scanned`,
                    },
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "System is now 100% in sync with Clockify.",
                        },
                    ],
                },
            ],
        };

        await this.postToSlack(payload);
    }

    //Private helper to handle the HTTP request
    private async postToSlack(payload: SlackPayload): Promise<void> {
        try {
            const response = await fetch(this.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                console.error(
                    `Slack API Error: ${response.status} ${response.statusText}`,
                );
            }
        } catch (err) {
            console.error("Failed to send Slack payload:", err);
        }
    }
}
