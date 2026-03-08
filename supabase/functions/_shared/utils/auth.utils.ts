import { SUPABASE_CONFIG } from "../config.ts";

/**
 * Acts as an Auth Guard for Edge Functions.
 * Returns a 401 Response if the caller is not using the Service Role Key.
 * Returns null if the request is authorized.
 */
export function requireServiceRole(req: Request): Response | null {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    if (!SUPABASE_CONFIG.key || token !== SUPABASE_CONFIG.key) {
        console.warn("Unauthorized access attempt blocked.");
        return new Response(
            JSON.stringify({
                success: false,
                error: "Unauthorized: Invalid or missing Service Role key.",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
        );
    }

    return null;
}
