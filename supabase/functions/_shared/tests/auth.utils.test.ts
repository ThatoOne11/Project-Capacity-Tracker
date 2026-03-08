import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { requireServiceRole } from "../utils/auth.utils.ts";
import { SUPABASE_CONFIG } from "../config.ts";

Deno.test("AuthUtils - requireServiceRole (x-sync-secret Guard)", async (t) => {
    // Save the original secret so we don't break other tests
    const originalSecret = SUPABASE_CONFIG.syncApiSecret;

    await t.step(
        "1. Returns 500 Server Error if SYNC_API_SECRET is missing from environment",
        async () => {
            // Simulate a broken server environment
            SUPABASE_CONFIG.syncApiSecret = undefined as unknown as string;

            const req = new Request("https://mock.com", {
                headers: { "x-sync-secret": "some_token" },
            });

            const res = requireServiceRole(req);

            assertNotEquals(res, null);
            assertEquals(res!.status, 500);

            const body = await res!.json();
            assertEquals(body.error, "Server Configuration Error");
        },
    );

    await t.step(
        "2. Returns 401 Unauthorized if x-sync-secret header is missing",
        async () => {
            SUPABASE_CONFIG.syncApiSecret = "valid_opaque_secret_123";

            // Request with NO headers
            const req = new Request("https://mock.com");

            const res = requireServiceRole(req);

            assertNotEquals(res, null);
            assertEquals(res!.status, 401);

            const body = await res!.json();
            assertEquals(body.error, "Unauthorized");
        },
    );

    await t.step(
        "3. Returns 401 Unauthorized if x-sync-secret is incorrect (Timing Safe Equal)",
        async () => {
            SUPABASE_CONFIG.syncApiSecret = "valid_opaque_secret_123";

            const req = new Request("https://mock.com", {
                headers: { "x-sync-secret": "hacker_guess_123" },
            });

            const res = requireServiceRole(req);

            assertNotEquals(res, null);
            assertEquals(res!.status, 401);
        },
    );

    await t.step(
        "4. Returns NULL (Allows access) if x-sync-secret perfectly matches",
        () => {
            SUPABASE_CONFIG.syncApiSecret = "valid_opaque_secret_123";

            const req = new Request("https://mock.com", {
                headers: { "x-sync-secret": "valid_opaque_secret_123" },
            });

            // If it returns null, the guard has stepped aside and allowed the request!
            const res = requireServiceRole(req);

            assertEquals(res, null);
        },
    );

    // Teardown: Restore the original secret
    SUPABASE_CONFIG.syncApiSecret = originalSecret;
});
