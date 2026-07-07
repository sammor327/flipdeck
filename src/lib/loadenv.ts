// Side-effect module: import this FIRST in tsx-run scripts so process.env is
// populated from .env before any module that reads it (e.g. the Prisma client).
import { loadEnvFile } from "./env";

loadEnvFile();
