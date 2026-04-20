import { assertEquals } from "jsr:@std/assert";
import { IdentityMatcher } from "../helpers/identity.helper.ts";
import type { CleanSlackUser } from "../types/slack.types.ts";

const MOCK_SLACK_USERS: CleanSlackUser[] = [
    { id: "U_ROSS", name: "Ross Hartigan", email: "ross@oneeleven.tech" },
    { id: "U_JESS", name: "Jessica Bland", email: "jess@oneeleven.tech" },
    {
        id: "U_MIKE",
        name: "Michael Shepherd",
        email: "michael.s@souschefai.co.uk",
    }, // Contractor email
];

Deno.test("IdentityMatcher - Waterfall Strategy Suite", async (t) => {
    await t.step(
        "Gate 1: Prioritizes cached Database ID (Manual Override) over everything else",
        () => {
            // Even though Jess's email matches exactly, the cache says this is Ross. The cache MUST win.
            const result = IdentityMatcher.findSlackId(
                "jess@oneeleven.tech",
                "Jessica Bland",
                "U_ROSS", // <-- Cached ID
                MOCK_SLACK_USERS,
            );

            assertEquals(result, "U_ROSS");
        },
    );

    await t.step("Gate 2: Matches exact email (Case Insensitive)", () => {
        const result = IdentityMatcher.findSlackId(
            " JESS@ONEELEVEN.TECH ", // Messy input from Clockify
            "Jessica B",
            null,
            MOCK_SLACK_USERS,
        );

        assertEquals(result, "U_JESS");
    });

    await t.step(
        "Gate 3: Falls back to exact Name Match if email is different",
        () => {
            // Michael is using a personal gmail for Clockify, but his name matches Slack exactly.
            const result = IdentityMatcher.findSlackId(
                "skaterboi99@gmail.com",
                "Michael Shepherd",
                null,
                MOCK_SLACK_USERS,
            );

            assertEquals(result, "U_MIKE");
        },
    );

    await t.step(
        "Failure: Returns null if neither email nor name matches",
        () => {
            // Total mismatch. The system must return null so the orchestrator can alert the Admin.
            const result = IdentityMatcher.findSlackId(
                "unknown@test.com",
                "Ghost User",
                null,
                MOCK_SLACK_USERS,
            );

            assertEquals(result, null);
        },
    );
});
