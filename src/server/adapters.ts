import "server-only";
import { notImplemented } from "@/lib/not-implemented";
import type { AiProvider, ArticleReader, DiscoverySource, JobQueue, Repository, ServerDependencies } from "./ports";

// Construction is deliberately deferred: importing the scaffold opens no connections.
export function createPostgresRepository(): Repository { return notImplemented("Postgres repository"); }
export function createFeatherlessProvider(): AiProvider { return notImplemented("Featherless provider"); }
export function createDiscoverySources(): DiscoverySource[] { return notImplemented("RSS/Google News/HN/Reddit/Wikipedia discovery"); }
export function createArticleReader(): ArticleReader { return notImplemented("Readability/Jina article reader"); }
export function createJobQueue(): JobQueue { return notImplemented("Job queue"); }
export function createDependencies(): ServerDependencies { return notImplemented("Dependency assembly"); }
