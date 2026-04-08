import { z } from "npm:zod";

// Input schemas
export const ClockifyUserSchema = z
    .object({
        id: z.string(),
        name: z.string().nullish(),
        email: z.email().optional().nullable(),
        status: z.string().optional(),
    })
    .transform((user) => ({
        ...user,
        // Coerce to a guaranteed non-null display name at the parse boundary.
        name: user.name ?? user.email ?? "Unknown User",
    }));

export const ClockifyClientSchema = z.object({
    id: z.string(),
    name: z.string().nullish().transform((val) => val ?? "Unknown Client"),
});

export const ClockifyProjectSchema = z.object({
    id: z.string(),
    name: z.string().nullish().transform((val) => val ?? "Unknown Project"),
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

export type ClockifyUser = z.output<typeof ClockifyUserSchema>;
export type ClockifyClient = z.output<typeof ClockifyClientSchema>;
export type ClockifyProject = z.output<typeof ClockifyProjectSchema>;
export type ClockifyTimeInterval = z.output<typeof ClockifyTimeIntervalSchema>;
export type ClockifyTimeEntry = z.output<typeof ClockifyTimeEntrySchema>;
