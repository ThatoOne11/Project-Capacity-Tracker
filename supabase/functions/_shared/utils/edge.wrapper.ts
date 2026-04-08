import { requireServiceRole } from "./auth.utils.ts";
import { SlackService } from "../services/slack.service.ts";
import { toSafeError } from "./error.utils.ts";
import { ValidationError } from "../exceptions/custom.exceptions.ts";

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

            if (error instanceof ValidationError) {
                return new Response(
                    JSON.stringify({ success: false, error: error.message }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }

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
