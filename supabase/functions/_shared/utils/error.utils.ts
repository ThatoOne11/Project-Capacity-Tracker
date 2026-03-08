// Safely converts an unknown catch clause variable into a standard Error object.
export function toSafeError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}
