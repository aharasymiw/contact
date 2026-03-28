import { setupDatabase } from "./setup-db.ts";

// Playwright starts the real app, so this bootstrap provisions the dedicated
// test database first and then imports the Express entrypoint.
await setupDatabase();
await import("../server/index.ts");
