// Safely fetches an API endpoint with automatic exponential backoff for 429 Too Many Requests
// and transient 50x server errors.
export async function fetchWithBackoff(
    url: string,
    options: RequestInit,
    maxRetries = 3,
): Promise<Response> {
    let attempt = 0;
    let delayMs = 500;

    while (attempt < maxRetries) {
        const response = await fetch(url, options);

        // Catch Rate Limits (429) AND Transient Gateway Errors (500, 502, 503, 504)
        if (
            response.status === 429 ||
            (response.status >= 500 && response.status <= 504)
        ) {
            attempt++;
            console.warn(
                `[${response.status} Error] Retrying ${url} in ${delayMs}ms... (Attempt ${attempt}/${maxRetries})`,
            );
            await new Promise((res) => setTimeout(res, delayMs));
            delayMs *= 2;
            continue;
        }

        return response;
    }

    throw new Error(`Exceeded max retries (${maxRetries}) for ${url}`);
}
