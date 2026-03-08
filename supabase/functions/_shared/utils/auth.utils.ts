import { SUPABASE_CONFIG } from "../config.ts";
import { timingSafeEqual } from "jsr:@std/crypto/timing-safe-equal";

export function requireServiceRole(req: Request): Response | null {
    // We bypass Kong's strict JWT rules by using our own custom header!
    const providedToken = req.headers.get("x-sync-secret")?.trim() || "";
    const expectedKey = SUPABASE_CONFIG.syncApiSecret?.replaceAll(/['"]/g, "")
        .trim();

    if (!expectedKey) {
        console.error(
            "SYNC_API_SECRET is missing from the .env",
        );
        return new Response(
            JSON.stringify({
                success: false,
                error: "Server Configuration Error",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    console.log(`[AUTH DEBUG] Provided Token: "${providedToken}"`);
    console.log(`[AUTH DEBUG] Expected Token: "${expectedKey}"`);

    const encoder = new TextEncoder();
    const providedBytes = encoder.encode(providedToken);
    const expectedBytes = encoder.encode(expectedKey);

    if (
        providedBytes.byteLength !== expectedBytes.byteLength ||
        !timingSafeEqual(providedBytes, expectedBytes)
    ) {
        console.warn("Unauthorized access attempt blocked.");
        return new Response(
            JSON.stringify({ success: false, error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
        );
    }

    return null;
}
