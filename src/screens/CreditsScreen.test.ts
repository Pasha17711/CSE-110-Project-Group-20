import { describe, it, expect, vi } from "vitest";

vi.mock("konva", () => import("./testing/fakeKonva"));

import { CreditsScreen } from "./CreditsScreen";
import { visibleTexts } from "./testing/fakeKonva";

describe("CreditsScreen", () => {
  it("shows every section heading and line it is given", () => {
    const screen = new CreditsScreen(1440, 900, [
      { heading: "Team", lines: ["Ada", "Grace"] },
      { heading: "Fonts", lines: ["Fredoka"] },
    ]);

    expect(visibleTexts(screen.layer)).toEqual(
      expect.arrayContaining(["CREDITS", "Team", "Ada", "Grace", "Fonts", "Fredoka", "Back"]),
    );
  });

  it("emits onBack when Back is clicked", () => {
    const screen = new CreditsScreen(1440, 900);
    const onBack = vi.fn();
    screen.onBack(onBack);

    screen.layer.findOne(".credits-back")!.fire("click");

    expect(onBack).toHaveBeenCalledOnce();
  });
});
