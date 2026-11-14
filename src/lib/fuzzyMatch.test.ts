import { describe, expect, it } from "vitest";
import {
  filterByFuzzy,
  fuzzyMatchRanges,
  matchesFuzzy,
  parseFuzzyQuery,
  scoreFuzzyMatch,
} from "./fuzzyMatch";

const q = parseFuzzyQuery;

describe("parseFuzzyQuery", () => {
  it("lowercases and splits terms on whitespace", () => {
    expect(q("  GCF  player ")).toEqual({ terms: ["gcf", "player"], text: "gcf  player" });
  });

  it("treats a blank query as no terms", () => {
    expect(q("   ").terms).toEqual([]);
  });
});

describe("matchesFuzzy", () => {
  it("matches scattered initials against a hyphenated name", () => {
    // The reported case: typing the initials of gcf-player.
    expect(matchesFuzzy("gcf-player", q("gcfp"))).toBe(true);
  });

  it("matches initials across other separators and camel case", () => {
    expect(matchesFuzzy("gcf_play", q("gcfp"))).toBe(true);
    expect(matchesFuzzy("gcf/play", q("gcfp"))).toBe(true);
    expect(matchesFuzzy("gcfPlay", q("gcfp"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesFuzzy("GCF-Player", q("gcfp"))).toBe(true);
  });

  it("rejects letters that are not in order", () => {
    expect(matchesFuzzy("player-gcf", q("gcfp"))).toBe(false);
    expect(matchesFuzzy("gcf-player", q("pcfg"))).toBe(false);
  });

  it("requires every whitespace-separated term to match", () => {
    expect(matchesFuzzy("gcf-player", q("gcf play"))).toBe(true);
    expect(matchesFuzzy("gcf-player", q("gcf nope"))).toBe(false);
  });

  it("still matches a plain substring, the previous behavior", () => {
    expect(matchesFuzzy("feature/login-fix", q("login"))).toBe(true);
    expect(matchesFuzzy("origin/main", q("gin"))).toBe(true);
  });

  it("shows everything for a blank query", () => {
    expect(matchesFuzzy("anything", q(""))).toBe(true);
  });

  it("matches CJK text by substring", () => {
    expect(matchesFuzzy("支付服务", q("支付"))).toBe(true);
    expect(matchesFuzzy("支付服务", q("付支"))).toBe(false);
  });
});

describe("scoreFuzzyMatch", () => {
  it("returns 0 only when a term does not match", () => {
    expect(scoreFuzzyMatch("gcf-player", q("zzz"))).toBe(0);
    expect(scoreFuzzyMatch("gcf-player", q("gcfp"))).toBeGreaterThan(0);
  });

  it("ranks a prefix substring above a mid-text one", () => {
    expect(scoreFuzzyMatch("gcf-player", q("gcf"))).toBeGreaterThan(
      scoreFuzzyMatch("player-gcf", q("gcf"))
    );
  });

  it("ranks the shorter text first when both contain the term equally early", () => {
    expect(scoreFuzzyMatch("gcf-player", q("gcf"))).toBeGreaterThan(
      scoreFuzzyMatch("gcf-something-else", q("gcf"))
    );
  });

  it("ranks a token-start match above a mid-word one", () => {
    expect(scoreFuzzyMatch("docs", q("o"))).toBeGreaterThan(scoreFuzzyMatch("hotfix", q("o")));
  });
});

describe("filterByFuzzy", () => {
  const names = [
    "gcf-something-else",
    "player-gcf",
    "gcf-player",
    "gcf_play-service",
    "backend",
  ];
  const pick = (query: string) =>
    filterByFuzzy(names, q(query), (n) => [n]);

  it("finds the reported project from its initials, ranked first", () => {
    const result = pick("gcfp");
    expect(result[0]).toBe("gcf-player");
    expect(result).toContain("gcf_play-service");
    expect(result).not.toContain("backend");
  });

  it("keeps the incoming order for a blank query", () => {
    expect(pick("   ")).toEqual(names);
  });

  it("is stable for equal scores", () => {
    const equal = ["ab-1", "ab-2", "ab-3"];
    expect(filterByFuzzy(equal, q("ab"), (n) => [n])).toEqual(equal);
  });

  it("matches when any provided field matches, ranked by the best field", () => {
    const rows = [
      { name: "zzz", command: "yarn run build" },
      { name: "build", command: "yarn run all" },
    ];
    const result = filterByFuzzy(rows, q("build"), (r) => [r.name, r.command]);
    expect(result.map((r) => r.name)).toEqual(["build", "zzz"]);
    // Fields are matched one by one, never as one concatenated string.
    expect(filterByFuzzy(rows, q("zzzbuild"), (r) => [r.name, r.command])).toEqual([]);
  });
});

describe("fuzzyMatchRanges", () => {
  it("returns one range per matched letter for an acronym query", () => {
    expect(fuzzyMatchRanges("gcf-player", q("gcfp"))).toEqual([
      [0, 3],
      [4, 5],
    ]);
  });

  it("returns one range per occurrence for a substring query", () => {
    expect(fuzzyMatchRanges("a-b / a-b", q("a-b"))).toEqual([
      [0, 3],
      [6, 9],
    ]);
  });

  it("splits a space-separated query into one range per term", () => {
    expect(fuzzyMatchRanges("a b a b", q("a b"))).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ]);
  });

  it("returns nothing for a blank query", () => {
    expect(fuzzyMatchRanges("gcf-player", q(""))).toEqual([]);
  });
});
