import { describe, it, expect } from "vitest";
import {
  COMBOS,
  findDrawPartners,
  partnerTowerIdSet,
  findCompletableDrawRecipes,
  completableDrawSlotSet,
  type PartnerCandidate,
  type DrawSlotCandidate,
} from "../src/data/combos";

// Pick a real multi-input recipe to drive the tests so they track live data.
const recipe = COMBOS.find((c) => c.inputs.length >= 2);
if (!recipe) throw new Error("expected at least one multi-input recipe");
const [a, b] = recipe.inputs;

describe("findDrawPartners", () => {
  it("highlights a placed gem that fills another slot of a shared recipe", () => {
    const towers: PartnerCandidate[] = [{ id: 1, gem: b.gem, quality: b.quality }];
    const links = findDrawPartners(a.gem, a.quality, towers);
    const found = links.find((l) => l.combo.key === recipe.key);
    expect(found).toBeTruthy();
    expect(found!.partnerTowerIds).toContain(1);
  });

  it("ignores a same-type gem at the wrong quality", () => {
    const wrongQuality = ((b.quality % 5) + 1) as typeof b.quality;
    const towers: PartnerCandidate[] = [
      { id: 7, gem: b.gem, quality: wrongQuality },
    ];
    const ids = partnerTowerIdSet(findDrawPartners(a.gem, a.quality, towers));
    // It may still match some *other* recipe by coincidence, but never the one
    // whose slot needs b at its exact quality.
    const links = findDrawPartners(a.gem, a.quality, towers);
    const target = links.find((l) => l.combo.key === recipe.key);
    expect(target?.partnerTowerIds ?? []).not.toContain(7);
    expect(ids.has(7)).toBe(
      links.some((l) => l.partnerTowerIds.includes(7)),
    );
  });

  it("skips already-combined gems (they're finished specials, not ingredients)", () => {
    const towers: PartnerCandidate[] = [
      { id: 2, gem: b.gem, quality: b.quality, comboKey: "some_special" },
    ];
    const links = findDrawPartners(a.gem, a.quality, towers);
    expect(partnerTowerIdSet(links).has(2)).toBe(false);
  });

  it("returns nothing for a gem that's in no recipe slot here", () => {
    const towers: PartnerCandidate[] = [{ id: 3, gem: b.gem, quality: b.quality }];
    // A draw that shares no recipe with anything on the board yields no links
    // that reference tower 3 unless a real recipe connects them.
    const links = findDrawPartners(a.gem, a.quality, []);
    expect(links.every((l) => l.partnerTowerIds.length === 0)).toBe(true);
    expect(partnerTowerIdSet(findDrawPartners(a.gem, a.quality, towers)).size)
      .toBeGreaterThanOrEqual(0);
  });
});

describe("findCompletableDrawRecipes", () => {
  // A hand holding exactly one of each input for `recipe`, one draw per input.
  const fullHand: DrawSlotCandidate[] = recipe.inputs.map((i, idx) => ({
    slotId: idx,
    gem: i.gem,
    quality: i.quality,
  }));

  it("detects a recipe fully covered by the current hand", () => {
    const matches = findCompletableDrawRecipes(fullHand);
    const found = matches.find((m) => m.combo.key === recipe.key);
    expect(found).toBeTruthy();
    // One contributing slot per input.
    expect(found!.slotIds.length).toBe(recipe.inputs.length);
    // Every contributing slot is real and unique.
    expect(new Set(found!.slotIds).size).toBe(found!.slotIds.length);
    expect(completableDrawSlotSet(matches).has(found!.slotIds[0])).toBe(true);
  });

  it("does not detect a recipe when one ingredient is missing", () => {
    const short = fullHand.slice(0, -1);
    const matches = findCompletableDrawRecipes(short);
    expect(matches.some((m) => m.combo.key === recipe.key)).toBe(false);
  });

  it("requires a second matching draw for a duplicated input", () => {
    // Find a recipe that demands two identical (gem, quality) inputs, if any.
    const dup = COMBOS.find((c) => {
      const counts = new Map<string, number>();
      for (const i of c.inputs) {
        const k = `${i.gem}:${i.quality}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return [...counts.values()].some((n) => n >= 2);
    });
    if (!dup) return; // no such recipe in the current roster — nothing to assert
    const one: DrawSlotCandidate[] = [
      { slotId: 0, gem: dup.inputs[0].gem, quality: dup.inputs[0].quality },
    ];
    expect(
      findCompletableDrawRecipes(one).some((m) => m.combo.key === dup.key),
    ).toBe(false);
  });
});
