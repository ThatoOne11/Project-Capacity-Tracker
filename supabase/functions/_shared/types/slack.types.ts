import { z } from "npm:zod";
type SlackTextObject = {
    type: "plain_text" | "mrkdwn";
    text: string;
    emoji?: boolean;
};

type SlackFieldObject = {
    type: "mrkdwn" | "plain_text";
    text: string;
};

type SlackHeaderBlock = {
    type: "header";
    text: SlackTextObject;
};

type SlackSectionBlock = {
    type: "section";
    text?: SlackTextObject;
    fields?: SlackFieldObject[];
};

type SlackContextBlock = {
    type: "context";
    elements: SlackFieldObject[];
};

type SlackDividerBlock = {
    type: "divider";
};

export type SlackBlock =
    | SlackHeaderBlock
    | SlackSectionBlock
    | SlackContextBlock
    | SlackDividerBlock;

export type SlackPayload = {
    text: string;
    blocks?: SlackBlock[];
};

export type CleanSlackUser = {
    id: string;
    name: string;
    email?: string;
};

export const SlackMemberSchema = z.object({
    id: z.string(),
    name: z.string(),
    real_name: z.string().optional(),
    deleted: z.boolean().optional(),
    is_bot: z.boolean().optional(),
    profile: z.object({ email: z.string().optional() }).optional(),
}).loose();

export const SlackUsersListResponseSchema = z.object({
    ok: z.boolean(),
    members: z.array(SlackMemberSchema).optional(),
    error: z.string().optional(),
});
