import "./env";
import { migrate } from "../src/server/db/migrate";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
migrate(process.env.DATABASE_URL).then(() => console.log("Database migrations applied."), () => { console.error("Migration failed. Verify database connection and schema permissions."); process.exitCode = 1; });
