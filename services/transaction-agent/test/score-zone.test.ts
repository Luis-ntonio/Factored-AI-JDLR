import { describe, expect, it } from "vitest";
import { deriveScoreZone } from "../src/scoring/score-zone";

describe("deriveScoreZone", () => {
  const thresholds = { min: 55, max: 70 }; // mismos valores que policies.yaml en este checkpoint

  it("score por debajo del mínimo -> declined", () => {
    expect(deriveScoreZone(0, thresholds)).toBe("declined");
    expect(deriveScoreZone(54, thresholds)).toBe("declined");
  });

  it("score por encima del máximo -> approved", () => {
    expect(deriveScoreZone(71, thresholds)).toBe("approved");
    expect(deriveScoreZone(100, thresholds)).toBe("approved");
  });

  it("score dentro del rango (exclusivo de los extremos ya cubiertos arriba) -> borderline", () => {
    expect(deriveScoreZone(60, thresholds)).toBe("borderline");
  });

  it("bordes exactos son inclusive en 'borderline': min y max mismos pertenecen a borderline", () => {
    expect(deriveScoreZone(thresholds.min, thresholds)).toBe("borderline");
    expect(deriveScoreZone(thresholds.max, thresholds)).toBe("borderline");
  });

  it("un punto fuera de cada borde cae en la zona vecina", () => {
    expect(deriveScoreZone(thresholds.min - 1, thresholds)).toBe("declined");
    expect(deriveScoreZone(thresholds.max + 1, thresholds)).toBe("approved");
  });
});
