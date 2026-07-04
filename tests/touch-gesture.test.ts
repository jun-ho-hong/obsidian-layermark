import { describe, expect, it } from "vitest";
import { calculateTouchViewport, createTouchSnapshot } from "../src/touch-gesture";

describe("touch gesture calculations", () => {
  it("calculates pinch zoom around the gesture center", () => {
    const startSnapshot = createTouchSnapshot([
      { pointerId: 1, x: 50, y: 100 },
      { pointerId: 2, x: 150, y: 100 }
    ]);
    const currentSnapshot = createTouchSnapshot([
      { pointerId: 1, x: 25, y: 100 },
      { pointerId: 2, x: 175, y: 100 }
    ]);

    expect(startSnapshot).not.toBeNull();
    expect(currentSnapshot).not.toBeNull();
    expect(calculateTouchViewport({
      start: {
        snapshot: startSnapshot!,
        zoom: 1,
        scrollLeft: 200,
        scrollTop: 300
      },
      current: currentSnapshot!
    })).toEqual({
      zoom: 1.5,
      scrollLeft: 350,
      scrollTop: 500
    });
  });

  it("calculates two-finger pan without changing zoom when distance is stable", () => {
    const startSnapshot = createTouchSnapshot([
      { pointerId: 1, x: 50, y: 100 },
      { pointerId: 2, x: 150, y: 100 }
    ]);
    const currentSnapshot = createTouchSnapshot([
      { pointerId: 1, x: 30, y: 120 },
      { pointerId: 2, x: 130, y: 120 }
    ]);

    expect(calculateTouchViewport({
      start: {
        snapshot: startSnapshot!,
        zoom: 1,
        scrollLeft: 200,
        scrollTop: 300
      },
      current: currentSnapshot!
    })).toEqual({
      zoom: 1,
      scrollLeft: 220,
      scrollTop: 280
    });
  });

  it("does not create a pinch snapshot from fewer than two touch points", () => {
    expect(createTouchSnapshot([{ pointerId: 1, x: 10, y: 20 }])).toBeNull();
  });
});
