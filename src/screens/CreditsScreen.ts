import Konva from "konva";
import type { CreditsScreen as CreditsScreenContract, Unsubscribe } from "./contracts";
import { DESIGN_WIDTH, fitLayer } from "./layout";
import { Listeners } from "./listeners";
import { COLORS, createBackground, createButton, createText } from "./theme";

export interface CreditsSection {
  heading: string;
  lines: string[];
}

/**
 * Template credits. Replace the placeholders with real names; each section
 * fills the left column first, then the right.
 */
export const CREDITS: CreditsSection[] = [
  { heading: "Team", lines: ["Seven Flaminiano", "Calista Hartono", "Asad Pasha Chaudhry", "Ping-Shu Lee", "Brian To", "Kaiyo Igaki"] },
  { heading: "Built With", lines: ["Konva", "Vite + TypeScript"] },
  { heading: "Fonts", lines: ["Gasoek One", "Fredoka"] },
];

const PANEL = { x: 206, y: 160, width: 987, height: 600 };
const COLUMN_GAP = 40;
const HEADING_SIZE = 30;
const LINE_SIZE = 22;
const LINE_HEIGHT = 30;
const SECTION_GAP = 24;

/** Lists who made the game; Back returns to the Start Screen. */
export class CreditsScreen implements CreditsScreenContract {
  readonly layer = new Konva.Layer();
  private readonly backs = new Listeners<[]>();

  constructor(stageWidth: number, stageHeight: number, credits: CreditsSection[] = CREDITS) {
    fitLayer(this.layer, stageWidth, stageHeight);
    this.layer.add(createBackground());

    this.layer.add(createText({
      x: 0, y: 50, width: DESIGN_WIDTH, text: "CREDITS",
      fontFamily: "Gasoek One", fontStyle: "normal", fontSize: 80,
      align: "center", fill: COLORS.gold, listening: false,
    }));

    this.layer.add(new Konva.Rect({
      ...PANEL, fill: COLORS.room, cornerRadius: 18,
      stroke: COLORS.purple, strokeWidth: 4, listening: false,
    }));

    this.layer.add(this.buildColumns(credits));

    this.layer.add(createButton({
      x: PANEL.x + PANEL.width - 163 - 40,
      y: PANEL.y + PANEL.height - 65 - 30,
      width: 163, height: 65, fontSize: 28,
      label: "Back", name: "credits-back",
      onClick: () => this.backs.emit(),
    }));
  }

  /** Splits the sections into two columns, half in each. */
  private buildColumns(credits: CreditsSection[]): Konva.Group {
    const group = new Konva.Group({ listening: false });
    const padding = 50;
    const columnWidth = (PANEL.width - padding * 2 - COLUMN_GAP) / 2;
    const split = Math.ceil(credits.length / 2);

    [credits.slice(0, split), credits.slice(split)].forEach((column, i) => {
      const x = PANEL.x + padding + i * (columnWidth + COLUMN_GAP);
      let y = PANEL.y + 40;
      for (const section of column) {
        group.add(createText({
          x, y, width: columnWidth, text: section.heading,
          fontSize: HEADING_SIZE, fill: COLORS.purple,
        }));
        y += HEADING_SIZE + 10;
        for (const line of section.lines) {
          group.add(createText({
            x, y, width: columnWidth, text: line,
            fontSize: LINE_SIZE, fontStyle: "500", fill: COLORS.purple,
          }));
          y += LINE_HEIGHT;
        }
        y += SECTION_GAP;
      }
    });
    return group;
  }

  onBack(cb: () => void): Unsubscribe {
    return this.backs.add(cb);
  }

  show(): void {
    this.layer.show();
    this.layer.batchDraw();
  }

  hide(): void {
    this.layer.hide();
  }
}
