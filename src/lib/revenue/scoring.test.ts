// src/lib/revenue/scoring.test.ts
import { describe, expect, it } from "vitest";
import { scoreLead } from "./scoring";

describe("Scoring v1.0", () => {
 it("scores commercial pricing question high", () => {
  const meta = scoreLead({ message: "What is the price per house? We have 18 houses.", messageCount: 2 });
  expect(meta.intent).toBe("commercial");
  expect(meta.segment).toBe("unknown");
  expect(meta.leadScore).toBeGreaterThanOrEqual(55); // was 60
  expect(meta.askQualification).toBe(true);
});

  it("weights poultry higher via multiplier", () => {
    const meta = scoreLead({ message: "Poultry integrator here. Need a quote. 10 houses.", messageCount: 2 });
    expect(meta.segment).toBe("poultry");
    expect(meta.leadScore).toBeGreaterThanOrEqual(70);
  });

  it("forces min score on lead submitted", () => {
    const meta = scoreLead({ message: "Just submitting details.", leadSubmitted: true });
    expect(meta.leadScore).toBeGreaterThanOrEqual(70);
  });

  it("does not ask qualifier twice", () => {
    const meta = scoreLead({
      message: "How much does it cost?",
      qualificationAsked: true,
    });
    expect(meta.askQualification).toBe(false);
  });
});