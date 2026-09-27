import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { loadBorderlineThresholds } from "../src/config/load-thresholds";

const POLICY_PATH = path.resolve(__dirname, "../../../policies.yaml");

describe("loadBorderlineThresholds", () => {
  it("lee config.borderline_score_min/_max del policies.yaml real de la raíz del monorepo", () => {
    const thresholds = loadBorderlineThresholds(POLICY_PATH);
    expect(thresholds.min).toBe(55);
    expect(thresholds.max).toBe(70);
    expect(thresholds.min).toBeLessThanOrEqual(thresholds.max);
  });

  it("lanza un error explícito si el archivo no existe (nunca inventa umbrales)", () => {
    expect(() => loadBorderlineThresholds(path.resolve(__dirname, "no-existe.yaml"))).toThrow();
  });
});
