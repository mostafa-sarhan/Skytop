/**
 * Prisma filter for an inclusive date range taken from `YYYY-MM-DD` inputs
 * (the end date includes the whole day). Returns undefined when unbounded.
 */
export const dateRangeFilter = (from?: Date, to?: Date): { gte?: Date; lte?: Date } | undefined =>
  from || to
    ? {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: new Date(to.getTime() + 86_399_999) } : {}),
      }
    : undefined;
