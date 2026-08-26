import { describe, expect, it } from "vitest";

import { mergeScoreSnapshot, scoreHistoryForDays } from "./scoreHistory";

describe("scoreHistory", () => {
  it("keeps one snapshot per day and filters by window", () => {
    const day1 = Date.UTC(2026, 0, 1, 12);
    const day2 = Date.UTC(2026, 0, 2, 12);
    const afterFirst = mergeScoreSnapshot([], 70, day1);
    const afterSameDay = mergeScoreSnapshot(afterFirst, 75, day1 + 1000);
    const afterNextDay = mergeScoreSnapshot(afterSameDay, 80, day2);
    expect(afterSameDay).toHaveLength(1);
    expect(afterSameDay[0]?.score).toBe(75);
    expect(afterSameDay[0]?.ts).toBe(day1 + 1000);
    expect(afterNextDay).toHaveLength(2);
    expect(afterNextDay[1]?.score).toBe(80);
    // Window shorter than the gap to the earlier snapshot
    expect(scoreHistoryForDays(afterNextDay, 0.5, day2)).toHaveLength(1);
    expect(scoreHistoryForDays(afterNextDay, 2, day2)).toHaveLength(2);
  });
});
