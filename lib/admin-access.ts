export const ADMIN_OWNER_EMAIL = 'dillon@theinvestoragent.io';

export const normalizeEmail = (email: string | null | undefined) => email?.trim().toLowerCase() ?? '';

export const isOwnerEmail = (email: string | null | undefined) => normalizeEmail(email) === ADMIN_OWNER_EMAIL;
