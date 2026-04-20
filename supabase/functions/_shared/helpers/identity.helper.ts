import { CleanSlackUser } from "../types/slack.types.ts";

export class IdentityMatcher {
    // Implements a strict Waterfall matching strategy
    static findSlackId(
        clockifyEmail: string | null,
        clockifyName: string,
        cachedSlackId: string | null,
        slackUsers: CleanSlackUser[],
    ): string | null {
        // GATE 1: Check Database Cache / Manual Overrides (Highest Priority)
        if (cachedSlackId) return cachedSlackId;

        const safeEmail = clockifyEmail?.trim().toLowerCase();
        const safeName = clockifyName.trim().toLowerCase();

        // GATE 2: Exact Email Match (Highly Deterministic)
        if (safeEmail) {
            const emailMatch = slackUsers.find(
                (su) => su.email?.trim().toLowerCase() === safeEmail,
            );
            if (emailMatch) return emailMatch.id;
        }

        // GATE 3: Exact Name Match (Fallback for mismatched domains)
        const nameMatch = slackUsers.find(
            (su) => su.name.trim().toLowerCase() === safeName,
        );
        if (nameMatch) return nameMatch.id;

        // FAILED: No match found
        return null;
    }
}
