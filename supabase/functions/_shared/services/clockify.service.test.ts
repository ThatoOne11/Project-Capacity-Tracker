import { assertEquals, assertRejects } from "jsr:@std/assert";
import { ClockifyService } from "./clockify.service.ts";

Deno.test("ClockifyService - Zod API Protection Suite", async (t) => {
    const service = new ClockifyService("dummy_api_key", "dummy_workspace_id");

    await t.step(
        "1. It should successfully parse VALID data from the Clockify API",
        async () => {
            const originalFetch = globalThis.fetch;

            // Mock the fetch to return exactly what Zod expects
            globalThis.fetch = () =>
                Promise.resolve(
                    new Response(
                        JSON.stringify([
                            {
                                id: "user_1",
                                name: "Ross Nelson",
                                email: "ross@test.com",
                                status: "ACTIVE",
                            },
                        ]),
                        { status: 200 },
                    ),
                );

            try {
                const users = await service.fetchUsers();
                assertEquals(users.length, 1);
                assertEquals(users[0].name, "Ross Nelson");
            } finally {
                globalThis.fetch = originalFetch;
            }
        },
    );

    await t.step(
        "2. It should THROW A ZOD ERROR if the Clockify API returns INVALID data",
        async () => {
            const originalFetch = globalThis.fetch;

            // Mock the fetch to return a broken payload (Missing the REQUIRED 'id' field)
            globalThis.fetch = () =>
                Promise.resolve(
                    new Response(
                        JSON.stringify([
                            { name: "Broken User" }, // Uh oh, no ID!
                        ]),
                        { status: 200 },
                    ),
                );

            try {
                // assertRejects verifies that the function throws an Error instead of succeeding
                await assertRejects(
                    () => service.fetchUsers(),
                    Error,
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        },
    );
});
