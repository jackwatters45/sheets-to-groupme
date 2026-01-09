import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

it("should pass a simple test", () => {
  expect(true).toBe(true);
});

it("should work with Effect", () => {
  Effect.runSync(Effect.succeed(1));
  expect(1).toBe(1);
});
