import { z } from "npm:zod";

export const ClockifyUserSchema = z
    .object({
        id: z.string(),
        name: z.string().nullish(),
        email: z.email().optional().nullable(),
        status: z.string().optional(),
    })
    .transform((user) => ({
        ...user,
        name: user.name || user.email || "Unknown User",
    }));

export const ClockifyClientSchema = z.object({
    id: z.string(),
    name: z
        .string()
        .nullish()
        .transform((val) => val || "Unknown Client"),
});

export const ClockifyProjectSchema = z.object({
    id: z.string(),
    name: z
        .string()
        .nullish()
        .transform((val) => val || "Unknown Project"),
    clientId: z.string().nullable().optional(),
});

export const ClockifyTimeIntervalSchema = z.object({
    start: z.iso.datetime(),
    end: z.iso.datetime().nullable().optional(),
    duration: z.string().nullable().optional(),
});

export const ClockifyTimeEntrySchema = z.object({
    id: z.string(),
    description: z.string().nullable().optional(),
    userId: z.string(),
    projectId: z.string().nullable().optional(),
    timeInterval: ClockifyTimeIntervalSchema,
});

export type ClockifyUser = z.infer<typeof ClockifyUserSchema>;
export type ClockifyClient = z.infer<typeof ClockifyClientSchema>;
export type ClockifyProject = z.infer<typeof ClockifyProjectSchema>;
export type ClockifyTimeInterval = z.infer<typeof ClockifyTimeIntervalSchema>;
export type ClockifyTimeEntry = z.infer<typeof ClockifyTimeEntrySchema>;
