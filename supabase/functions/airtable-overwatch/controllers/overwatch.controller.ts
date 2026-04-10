import { OverwatchService } from "../services/overwatch.service.ts";
import {
  OverwatchRequest,
  OverwatchRequestSchema,
} from "../types/overwatch.types.ts";
import { ValidationError } from "../../_shared/exceptions/custom.exceptions.ts";
import { toSafeError } from "../../_shared/utils/error.utils.ts";

export class OverwatchController {
  constructor(private readonly service: OverwatchService) {}

  async handleRequest(req: Request): Promise<Response> {
    const rawText = await req.text();

    if (!rawText.trim()) {
      throw new ValidationError("Empty payload. Please provide a tableId.");
    }

    let body: OverwatchRequest;
    try {
      body = OverwatchRequestSchema.parse(JSON.parse(rawText));
    } catch (err) {
      throw new ValidationError(
        `Invalid payload: ${toSafeError(err).message}`,
      );
    }

    const data = await this.service.fetchRawRecords(body.tableId, {
      filterByFormula: body.filterByFormula,
      maxRecords: body.maxRecords,
      fields: body.fields,
    });

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
