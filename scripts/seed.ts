import "./env";
import { seedDemo } from "../src/server/demo-seed";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
seedDemo(process.env.DATABASE_URL).then(() => console.log("Offline demo ready: person_seed_dana / deck_seed_dana (existing demo preserved)."), error => { console.error(error instanceof Error && error.message.startsWith("Demo seed") ? error.message : "Demo seed failed. Verify migrations and database connection."); process.exitCode = 1; });
