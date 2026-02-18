import { SlackClient } from "../clients/slack.client.ts";
import { SlackPayload, SyncReportStats } from "../types/types.ts";

export class SlackService {
    private readonly client = new SlackClient();

    //Sends a critical alert for system failures
    async sendAlert(functionName: string, errorMsg: string): Promise<void> {
        const payload: SlackPayload = {
            text: "🚨 Project Capacity Tracker - Sync Failed",
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: "🚨 Project Capacity Tracker - Sync Failed",
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

        await this.client.post(payload);
    }

    //Formats and sends the Daily Audit Sync Report
    async sendSyncReport(stats: SyncReportStats): Promise<void> {
        const payload: SlackPayload = {
            text: "Project Capacity Tracker - Sync Report", // Fallback for mobile notifications
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: "Project Capacity Tracker - Sync Report",
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
                { type: "divider" },
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
                    elements: [{
                        type: "mrkdwn",
                        text: "System is now 100% in sync with Clockify.",
                    }],
                },
            ],
        };

        await this.client.post(payload);
    }
}
