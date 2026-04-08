import { requireServiceRole } from "./auth.utils.ts";
import { SlackService } from "../services/slack.service.ts";
import { toSafeError } from "./error.utils.ts";

export function withEdgeWrapper(
    functionName: string,
    handler: (req: Request, slack: SlackService) => Promise<Response>,
): (req: Request) => Promise<Response> {
    return async (req: Request): Promise<Response> => {
        const authError = requireServiceRole(req);
        if (authError) return authError;

        const slack = new SlackService();

        try {
            return await handler(req, slack);
        } catch (err: unknown) {
            const error = toSafeError(err);
            console.error(
                `[${functionName}] Execution Error: ${error.message}`,
            );

            await slack.sendAlert(
                `${functionName} Edge Function`,
                error.message,
            );

            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Internal server error.",
                }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
    };
}
