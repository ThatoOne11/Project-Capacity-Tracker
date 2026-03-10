// Safely fetches an API endpoint with automatic exponential backoff for 429 Too Many Requests.
export async function fetchWithBackoff(
    url: string,
    options: RequestInit,
    maxRetries = 3,
): Promise<Response> {
    let attempt = 0;
    let delayMs = 500;

    while (attempt < maxRetries) {
        const response = await fetch(url, options);

        if (response.status === 429) {
            attempt++;
            console.warn(
                `[429 Too Many Requests] Retrying ${url} in ${delayMs}ms...`,
            );
            await new Promise((res) => setTimeout(res, delayMs));
            delayMs *= 2;
            continue;
        }

        return response;
    }

    throw new Error(`Exceeded max retries (${maxRetries}) for ${url}`);
}
