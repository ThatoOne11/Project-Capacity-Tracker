// Safely converts "February 2026" into Airtable's required "2026-02-01" ISO format.
// Uses a static map to prevent locale-dependent date parsing crashes.
export function formatMonthToIsoDate(monthString: string): string {
    const [monthName, year] = monthString.split(" ");

    const monthMap: Record<string, number> = {
        "January": 1,
        "February": 2,
        "March": 3,
        "April": 4,
        "May": 5,
        "June": 6,
        "July": 7,
        "August": 8,
        "September": 9,
        "October": 10,
        "November": 11,
        "December": 12,
    };

    const monthIndex = monthMap[monthName];

    if (!monthIndex) {
        throw new Error(`Could not parse month name: "${monthName}"`);
    }

    return `${year}-${monthIndex.toString().padStart(2, "0")}-01`;
}
