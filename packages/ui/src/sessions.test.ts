import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_TITLE, titleFromUserText } from "./sessions.js";

describe("titleFromUserText", () => {
  it("collapses whitespace", () => {
    expect(titleFromUserText("  how   do\nI  deploy?  ")).toBe("how do I deploy?");
  });

  it("falls back to the default title for blank input", () => {
    expect(titleFromUserText("   ")).toBe(DEFAULT_CHAT_TITLE);
  });

  it("keeps short text intact", () => {
    const short = "a".repeat(56);
    expect(titleFromUserText(short)).toBe(short);
  });

  it("truncates long text with an ellipsis", () => {
    const title = titleFromUserText("b".repeat(100));
    expect(title).toHaveLength(54);
    expect(title.endsWith("…")).toBe(true);
  });
});
