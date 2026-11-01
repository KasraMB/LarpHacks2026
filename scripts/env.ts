import { existsSync } from "node:fs";
// Node's loader leaves deployment-provided environment values in place.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (existsSync(".env")) process.loadEnvFile(".env");
