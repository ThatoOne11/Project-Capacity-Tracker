import { SlackClient } from "../clients/slack.client.ts";
import { SlackPayload } from "../types/slack.types.ts";
import { SyncReportStats } from "../types/sync.types.ts";

export class SlackService {
    private readonly client: SlackClient = new SlackClient();

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

    async sendInfo(title: string, message: string): Promise<void> {
        const payload: SlackPayload = {
            text: title,
            blocks: [
                {
                    type: "header",
                    text: { type: "plain_text", text: title, emoji: true },
                },
                {
                    type: "section",
                    text: { type: "mrkdwn", text: message },
                },
            ],
        };

        await this.client.post(payload);
    }

    async sendSyncReport(stats: SyncReportStats): Promise<void> {
        const formatList = (items: string[]): string | null =>
            items.length === 0 ? null : `${items.length} (${items.join(", ")})`;

        const newUsersStr = formatList(stats.newUsers);
        const renamedStr = formatList(stats.renamedUsers);
        const newProjectsStr = formatList(stats.newProjects);

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

        const statusLabel = stats.status === "SUCCESS"
            ? "SUCCESS 🟢"
            : "FAILED 🔴";

        const payload: SlackPayload = {
            text: "Project Capacity Tracker - Sync Report",
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
                            text:
                                `*Status:* ${statusLabel}   |   *Duration:* ${stats.durationSeconds}s`,
                        },
                    ],
                },
                { type: "divider" },
                {
                    type: "section",
                    text: { type: "mrkdwn", text: changesText },
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
