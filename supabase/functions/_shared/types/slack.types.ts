export type SlackBlock = {
    type: string;
    text?: {
        type: string;
        text: string;
        emoji?: boolean;
    };
    fields?: {
        type: string;
        text: string;
    }[];
    elements?: unknown[];
};

export type SlackPayload = {
    text: string;
    blocks?: SlackBlock[];
};
