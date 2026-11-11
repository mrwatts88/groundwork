// Command, event and state types, zod schemas and wire messages (DESIGN.md 12.2).
// Depends on nothing.

export const PROTOCOL_VERSION = 1;

export const PACKAGE_NAMES = ["protocol", "sim", "minds", "server", "client"] as const;

export type PackageName = (typeof PACKAGE_NAMES)[number];
