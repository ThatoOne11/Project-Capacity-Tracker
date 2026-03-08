/**
 * Thrown when an incoming HTTP request payload is invalid or malformed.
 * Controllers should catch this and return a 400 Bad Request.
 */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

/**
 * Thrown when a downstream process (like Airtable or Clockify) fails,
 * or when partial failures occur during a batch process.
 * Controllers should catch this and return a 500 Internal Server Error.
 */
export class DownstreamSyncError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DownstreamSyncError";
    }
}
