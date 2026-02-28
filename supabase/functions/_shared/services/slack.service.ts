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
        // 1. Format the "Changes" section
        const formatList = (items: string[]) => {
            if (items.length === 0) return null;
            return `${items.length} (${items.join(", ")})`;
        };

        const newUsersStr = formatList(stats.newUsers);
        const renamedStr = formatList(stats.renamedUsers);
        const newProjectsStr = formatList(stats.newProjects);

        // Only build the "Changes" block if there ARE changes
        const hasChanges = newUsersStr || renamedStr || newProjectsStr;

        let changesText = "*Changes:*\n";
        if (hasChanges) {
            if (newUsersStr) changesText += `- New Users: ${newUsersStr}\n`;
            if (renamedStr) changesText += `- Renamed Users: ${renamedStr}\n`;
            if (newProjectsStr) {
                changesText += `- New Projects: ${newProjectsStr}\n`;
            }
        } else {
            changesText += "_No changes detected._\n";
        }

        // 2. Build the Payload
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
                        text: changesText,
                    },
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Cleanup stats:*\n" +
                            `- Time entries updated: ${stats.upserted}\n` +
                            `- Time entries deleted: ${stats.deleted}\n` +
                            `- Total users scanned: ${stats.usersScanned}`,
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
