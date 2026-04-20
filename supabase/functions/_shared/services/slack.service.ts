import { SlackClient } from "../clients/slack.client.ts";
import {
    CleanSlackUser,
    SlackPayload,
    SlackUsersListResponseSchema,
} from "../types/slack.types.ts";
import { SyncReportStats } from "../types/sync.types.ts";

type SlackMessageConfig = {
    title: string;
    contextBar: string;
    bodySections: string[];
    footer: string;
};

export class SlackService {
    private readonly client: SlackClient = new SlackClient();

    private buildPayload(config: SlackMessageConfig): SlackPayload {
        return {
            text: config.title,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: config.title,
                        emoji: true,
                    },
                },
                {
                    type: "context",
                    elements: [{ type: "mrkdwn", text: config.contextBar }],
                },
                { type: "divider" },
                ...config.bodySections.map((text) => ({
                    type: "section" as const,
                    text: { type: "mrkdwn" as const, text },
                })),
                {
                    type: "context",
                    elements: [{ type: "mrkdwn", text: config.footer }],
                },
            ],
        };
    }

    async sendAlert(functionName: string, errorMsg: string): Promise<void> {
        await this.client.post(this.buildPayload({
            title: "Project Capacity Tracker - Sync Failed",
            contextBar: `*Function:* ${functionName}   |   *Time:* ${
                new Date().toISOString()
            }`,
            bodySections: [
                `*Error Details:*\n\`\`\`${errorMsg}\`\`\``,
            ],
            footer: "Investigate via Supabase Edge Functions Logs.",
        }));
    }

    async sendGhostBusterReport(airtableId: string): Promise<void> {
        await this.client.post(this.buildPayload({
            title: "Project Capacity Tracker - Ghost Record Caught",
            contextBar: `*Record ID:* ${airtableId}   |   *Time:* ${
                new Date().toISOString()
            }`,
            bodySections: [
                `*What happened:*\nAirtable record *${airtableId}* was manually deleted or corrupted.\n\n*What the system did:*\nThe internal cache has been cleared. The link will be automatically re-established on the next sync.`,
            ],
            footer:
                "No action required. The system will self-heal on the next cron run.",
        }));
    }

    async sendAutoHealReport(
        table: string,
        healedRecords: string[],
    ): Promise<void> {
        await this.client.post(this.buildPayload({
            title: "Project Capacity Tracker - Auto-Heal Applied",
            contextBar: `*Table:* ${table}   |   *Time:* ${
                new Date().toISOString()
            }`,
            bodySections: [
                `*Healed Records (${healedRecords.length}):*\n${
                    healedRecords.join("\n")
                }`,
            ],
            footer:
                "Existing Airtable records were matched and linked. No new records were created.",
        }));
    }

    async sendSyncReport(stats: SyncReportStats): Promise<void> {
        const formatList = (items: string[]): string | null =>
            items.length === 0 ? null : `${items.length} (${items.join(", ")})`;

        const newUsersStr = formatList(stats.newUsers);
        const renamedStr = formatList(stats.renamedUsers);
        const newProjectsStr = formatList(stats.newProjects);
        const newClientsStr = formatList(stats.newClients);

        const hasChanges = newUsersStr || renamedStr || newProjectsStr ||
            newClientsStr;
        let changesText = "*Changes:*\n";

        if (hasChanges) {
            if (newUsersStr) changesText += `- New Users: ${newUsersStr}\n`;
            if (renamedStr) changesText += `- Renamed Users: ${renamedStr}\n`;
            if (newProjectsStr) {
                changesText += `- New Projects: ${newProjectsStr}\n`;
            }
            if (newClientsStr) {
                changesText += `- New Clients: ${newClientsStr}\n`;
            }
        } else {
            changesText += "_No changes detected._";
        }

        const cleanupText = "*Cleanup stats:*\n" +
            `- Time entries updated: ${stats.upserted}\n` +
            `- Time entries deleted: ${stats.deleted}\n` +
            `- Total users scanned: ${stats.usersScanned}`;

        const statusLabel = stats.status === "SUCCESS"
            ? "SUCCESS 🟢"
            : "FAILED 🔴";

        await this.client.post(this.buildPayload({
            title: "Project Capacity Tracker - Sync Report",
            contextBar:
                `*Status:* ${statusLabel}   |   *Duration:* ${stats.durationSeconds}s`,
            bodySections: [changesText, cleanupText],
            footer: "System is now 100% in sync with Clockify.",
        }));
    }

    async fetchWorkspaceMembers(): Promise<CleanSlackUser[]> {
        const payload = await this.client.getWorkspaceMembers();
        const parsed = SlackUsersListResponseSchema.parse(payload);

        if (!parsed.ok) {
            throw new Error(`Slack API Logic Error: ${parsed.error}`);
        }

        return (parsed.members ?? [])
            .filter((m) => !m.deleted && !m.is_bot && m.id !== "USLACKBOT")
            .map((m) => ({
                id: m.id,
                name: m.real_name ?? m.name,
                email: m.profile?.email,
            }));
    }

    async sendUnassignedNudgeDM(
        slackUserId: string,
        hours: number,
        dateStr: string,
    ): Promise<void> {
        await this.client.postDirectMessage(
            slackUserId,
            this.buildPayload({
                title: "Unassigned Time ⚠️",
                contextBar: `*Date:* ${dateStr}`,
                bodySections: [
                    `Hi there! You have *${hours} hours* of time logged today that isn't assigned to a project.\n\nPlease update your Clockify entries before the end of the day so our capacity reports remain accurate.`,
                ],
                footer:
                    "This is an automated nudge. Reply to your PM if you need help.",
            }),
        );
    }

    async sendUnmappedUsersAlert(
        unmappedUsers: Array<{ name: string; email: string | null }>,
    ): Promise<void> {
        const userList = unmappedUsers.map((u) =>
            `• ${u.name} (${u.email || "No Email"})`
        ).join("\n");

        await this.client.post(this.buildPayload({
            title: "Project Capacity Tracker - Identity Mismatch 🚨",
            contextBar: `*Action Required*`,
            bodySections: [
                `I tried to send unassigned-time nudges, but I couldn't automatically find the following Clockify users in Slack:\n\n${userList}\n\n*Please manually add their Slack IDs to the \`clockify_users\` table.*`,
            ],
            footer:
                "Once mapped, they will automatically receive nudges in the future.",
        }));
    }
}
