import { CleanSlackUser } from "../types/slack.types.ts";

export class IdentityMatcher {
    static findSlackId(
        clockifyEmail: string | null,
        clockifyName: string,
        cachedSlackId: string | null,
        slackUsers: CleanSlackUser[],
    ): string | null {
        // 1: Check Database Cache / Manual Overrides (Highest Priority)
        if (cachedSlackId) return cachedSlackId;

        const safeEmail = clockifyEmail?.trim().toLowerCase();
        const safeName = clockifyName.trim().toLowerCase();

        // 2: Exact Email Match
        if (safeEmail) {
            const emailMatch = slackUsers.find(
                (su) => su.email?.trim().toLowerCase() === safeEmail,
            );
            if (emailMatch) return emailMatch.id;
        }

        // 3: Exact Name Match (Fallback for mismatched domains)
        const nameMatch = slackUsers.find(
            (su) => su.name.trim().toLowerCase() === safeName,
        );
        if (nameMatch) return nameMatch.id;

        // No match found
        return null;
    }
}
