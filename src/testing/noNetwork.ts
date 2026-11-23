/**
 * Test setup (see vitest.config.ts): tests must pass in CI with no Supabase
 * env vars and no network, so any request fails the test that made it.
 */
import { vi } from "vitest";

vi.stubGlobal("fetch", (input: unknown) => {
  throw new Error(`Tests must not touch the network (fetch ${String(input)}). Use MemoryLeaderboardStore or a fake client.`);
});
