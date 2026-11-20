import Konva from "konva";
import { Difficulty, DIFFICULTY_LABEL, Leaderboard, formatTime, type LeaderboardEntry } from "../score";
import type { StartScreen as StartScreenContract, Unsubscribe } from "./contracts";
import { DESIGN_HEIGHT, DESIGN_WIDTH, fitLayer } from "./layout";
import { Listeners } from "./listeners";
import { COLORS, createBackground, createText, setCursor } from "./theme";

const DIFFICULTIES = [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard] as const;

const MENU_BTN = { width: 320, height: 64, gap: 40 };
const VAULT = { x: 350, y: 235, width: 740, height: 590 };
const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  [Difficulty.Easy]: "#7cfc30",
  [Difficulty.Medium]: "#ffd447",
  [Difficulty.Hard]: "#ff6b6b",
};

export class StartScreen implements StartScreenContract {
  readonly layer = new Konva.Layer();
  private readonly starts = new Listeners<[Difficulty]>();

  // Optional callbacks for secondary menu buttons
  private readonly tutorials = new Listeners<[]>();
  private readonly settings = new Listeners<[]>();
  private readonly leaderboardClicks = new Listeners<[]>();
  private readonly credits = new Listeners<[]>();
  private readonly muteChanges = new Listeners<[boolean]>();
  private readonly audioSettings = new Konva.Group({ visible: false, name: "audio-settings" });
  private muteLabel: Konva.Text | null = null;
  private muted = false;

  private readonly leaderboard?: Leaderboard;
  private readonly leaderboardModal = new Konva.Group({ visible: false });
  private selectedBoardDifficulty: Difficulty = Difficulty.Easy;

  private readonly mainMenuGroup = new Konva.Group();
  private readonly difficultyGroup = new Konva.Group({ visible: false });
  private readonly boardRowsGroup = new Konva.Group();
  private readonly boardTabs = new Map<Difficulty, Konva.Group>();

  constructor(stageWidth: number, stageHeight: number, leaderboard?: Leaderboard) {
    this.leaderboard = leaderboard;

    fitLayer(this.layer, stageWidth, stageHeight);
    this.layer.add(createBackground());

    // Vault Door Background 
    this.drawVaultDoor();

    // Main Title 
    this.layer.add(new Konva.Text({
      x: 0,
      y: 30,
      width: DESIGN_WIDTH,
      text: "Seven's Wonderful\nBank Heist !!",
      align: "center",
      fontFamily: "Gasoek One",
      fontStyle: "normal",
      fontSize: 82,
      lineHeight: 1.08,
      fill: "#ffd447",
      stroke: "#111111",
      strokeWidth: 5,
      fillAfterStrokeEnabled: true,
      listening: false,
    }));

    // Primary Menu Buttons
    this.buildMainMenuControls();

    // Difficulty Sub-menu (shown when PLAY is clicked)
    this.buildDifficultyControls();

    // Credits Button
    const creditsText = createText({
      x: DESIGN_WIDTH - 135 - 40,
      y: DESIGN_HEIGHT - 44,
      width: 135,
      text: "Credits  >",
      align: "right",
      fontSize: 20,
      fill: "#ffffff",
      name: "credits-button",
    });
    creditsText.on("mouseenter", () => setCursor(creditsText, "pointer"));
    creditsText.on("mouseleave", () => setCursor(creditsText, ""));
    creditsText.on("click tap", () => this.credits.emit());
    this.layer.add(creditsText);

    // Leaderboard displayed when trophy button is clicked
    this.buildLeaderboardModal();
    this.buildAudioSettings();
  }

  private drawVaultDoor(): void {
    const vaultGroup = new Konva.Group({ listening: false });

    // Outer grey vault casing
    vaultGroup.add(new Konva.Rect({
      x: VAULT.x,
      y: VAULT.y,
      width: VAULT.width,
      height: VAULT.height,
      fill: "#d3d3d3",
      stroke: "#111111",
      strokeWidth: 4,
    }));

    // Inner recessed door frame
    const inset = 44;
    vaultGroup.add(new Konva.Rect({
      x: VAULT.x + inset,
      y: VAULT.y + inset,
      width: VAULT.width - inset * 2,
      height: VAULT.height - inset * 2,
      fill: "#d9d9d9",
      stroke: "#111111",
      strokeWidth: 4,
    }));

    // Central vault locking wheel rings 
    const centerX = VAULT.x + VAULT.width / 2;
    const centerY = VAULT.y + VAULT.height / 2 + 12;
    vaultGroup.add(new Konva.Circle({
      x: centerX,
      y: centerY,
      radius: 175,
      stroke: "#6b6b6b",
      strokeWidth: 9,
    }));
    vaultGroup.add(new Konva.Circle({
      x: centerX,
      y: centerY,
      radius: 82,
      stroke: "#6b6b6b",
      strokeWidth: 9,
    }));

    // Two left-side door hinges overlapping the inner seam
    const hingeX = VAULT.x + inset - 16;
    const hingePositions = [VAULT.y + 150, VAULT.y + 345];
    for (const hy of hingePositions) {
      vaultGroup.add(new Konva.Rect({
        x: hingeX,
        y: hy,
        width: 32,
        height: 85,
        fill: "#bfbfbf",
        stroke: "#111111",
        strokeWidth: 3.5,
      }));
    }

    this.layer.add(vaultGroup);
  }

  private buildMainMenuControls(): void {
    const centerX = (DESIGN_WIDTH - MENU_BTN.width) / 2;
    const startY = 400;

    // PLAY Button
    const playBtn = this.createStyledMenuButton({
      x: centerX,
      y: startY,
      width: MENU_BTN.width,
      height: MENU_BTN.height,
      label: "PLAY",
      fill: "#7cfc30",
      name: "play-button",
      onClick: () => {
        this.mainMenuGroup.hide();
        this.difficultyGroup.show();
        this.layer.batchDraw();
      },
    });
    this.mainMenuGroup.add(playBtn);

    // Leaderboard (trophy) Button
    const trophyBtn = this.createTrophyBadge(
      centerX + MENU_BTN.width + 20,
      startY + 4,
    );
    this.mainMenuGroup.add(trophyBtn);

    // TUTORIAL Button 
    this.mainMenuGroup.add(this.createStyledMenuButton({
      x: centerX,
      y: startY + (MENU_BTN.height + MENU_BTN.gap),
      width: MENU_BTN.width,
      height: MENU_BTN.height,
      label: "TUTORIAL",
      fill: "#ffffff",
      name: "tutorial-button",
      onClick: () => this.tutorials.emit(),
    }));

    // SETTINGS Button 
    this.mainMenuGroup.add(this.createStyledMenuButton({
      x: centerX,
      y: startY + 2 * (MENU_BTN.height + MENU_BTN.gap),
      width: MENU_BTN.width,
      height: MENU_BTN.height,
      label: "SETTINGS",
      fill: "#ffffff",
      name: "settings-button",
      onClick: () => {
        this.settings.emit();
        this.audioSettings.show();
        this.audioSettings.moveToTop();
        this.layer.batchDraw();
      },
    }));

    this.layer.add(this.mainMenuGroup);
  }

  private buildDifficultyControls(): void {
    const centerX = (DESIGN_WIDTH - MENU_BTN.width) / 2;
    const startY = 400;

    this.difficultyGroup.add(createText({
      y: startY - 80,
      width: DESIGN_WIDTH,
      text: "Select Difficulty",
      align: "center",
      fontSize: 35,
      fill: COLORS.purple,
    }));

    DIFFICULTIES.forEach((difficulty, i) => {
      this.difficultyGroup.add(this.createStyledMenuButton({
        x: centerX,
        y: startY + i * (MENU_BTN.height + 40),
        width: MENU_BTN.width,
        height: MENU_BTN.height,
        label: DIFFICULTY_LABEL[difficulty].toUpperCase(),
        fill: DIFFICULTY_COLORS[difficulty],
        name: `difficulty-${DIFFICULTY_LABEL[difficulty].toLowerCase()}`,
        onClick: () => this.starts.emit(difficulty),
      }));
    });

    // Back link to return to primary menu
    const backBtn = createText({
      x: centerX,
      y: startY + 3 * (MENU_BTN.height + 16) + 90,
      width: MENU_BTN.width,
      text: "← Back",
      align: "center",
      fontSize: 22,
      fill: COLORS.purple,
      name: "difficulty-back",
    });
    backBtn.on("mouseenter", () => setCursor(backBtn, "pointer"));
    backBtn.on("mouseleave", () => setCursor(backBtn, ""));
    backBtn.on("click tap", () => {
      this.difficultyGroup.hide();
      this.mainMenuGroup.show();
      this.layer.batchDraw();
    });
    this.difficultyGroup.add(backBtn);

    this.layer.add(this.difficultyGroup);
  }

  private createStyledMenuButton(opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    fill: string;
    name: string;
    onClick: () => void;
  }): Konva.Group {
    const group = new Konva.Group({ x: opts.x, y: opts.y, name: opts.name });

    // Bottom drop-shadow pill
    group.add(new Konva.Rect({
      y: 6,
      width: opts.width,
      height: opts.height,
      cornerRadius: 22,
      fill: COLORS.purple,
      listening: false,
    }));

    // Main button face
    group.add(new Konva.Rect({
      width: opts.width,
      height: opts.height,
      cornerRadius: 22,
      fill: opts.fill,
      stroke: COLORS.purple,
      strokeWidth: 3,
    }));

    group.add(createText({
      width: opts.width,
      height: opts.height,
      text: opts.label,
      align: "center",
      verticalAlign: "middle",
      fontSize: 28,
      fill: COLORS.purple,
      listening: false,
    }));

    group.on("mouseenter", () => setCursor(group, "pointer"));
    group.on("mouseleave", () => setCursor(group, ""));
    group.on("click tap", opts.onClick);
    return group;
  }

  private createTrophyBadge(x: number, y: number): Konva.Group {
    const size = 56;
    const badge = new Konva.Group({ x, y, name: "trophy-button" });

    badge.add(new Konva.Rect({
      y: 5,
      width: size,
      height: size,
      cornerRadius: 16,
      fill: COLORS.purple,
      listening: false,
    }));

    badge.add(new Konva.Rect({
      width: size,
      height: size,
      cornerRadius: 16,
      fill: "#ffd447",
      stroke: COLORS.purple,
      strokeWidth: 3,
    }));

    badge.add(createText({
      width: size,
      height: size,
      text: "🏆",
      align: "center",
      verticalAlign: "middle",
      fontSize: 28,
      listening: false,
    }));

    badge.on("mouseenter", () => setCursor(badge, "pointer"));
    badge.on("mouseleave", () => setCursor(badge, ""));
    badge.on("click tap", () => {
      this.leaderboardClicks.emit();
      if (this.leaderboard) {
        this.updateLeaderboardTabStyles();
        this.renderLeaderboardRows(this.selectedBoardDifficulty);
        this.leaderboardModal.moveToTop();
        this.leaderboardModal.show();
        this.layer.batchDraw();
      }
    });
    return badge;
  }

  private buildLeaderboardModal(): void {
    // Dimmed backdrop
    const backdrop = new Konva.Rect({
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      fill: "rgba(15, 18, 36, 0.72)",
    });
    this.leaderboardModal.add(backdrop);

    // Modal card
    const modalW = 720;
    const modalH = 620;
    const mx = (DESIGN_WIDTH - modalW) / 2;
    const my = (DESIGN_HEIGHT - modalH) / 2;

    this.leaderboardModal.add(new Konva.Rect({
      x: mx,
      y: my,
      width: modalW,
      height: modalH,
      cornerRadius: 24,
      fill: "#f4f4f6",
      stroke: COLORS.purple,
      strokeWidth: 4,
    }));

    this.leaderboardModal.add(createText({
      x: mx,
      y: my + 24,
      width: modalW,
      text: "🏆 HIGH SCORES",
      align: "center",
      fontSize: 36,
      fill: COLORS.purple,
    }));

    // Difficulty Tabs (EASY / MEDIUM / HARD)
    const tabW = 180;
    const tabGap = 20;
    const tabsStartX = mx + (modalW - (3 * tabW + 2 * tabGap)) / 2;

    DIFFICULTIES.forEach((diff, idx) => {
      const label = DIFFICULTY_LABEL[diff].toUpperCase();
      const tab = this.createStyledMenuButton({
        x: tabsStartX + idx * (tabW + tabGap),
        y: my + 82,
        width: tabW,
        height: 46,
        label,
        fill: DIFFICULTY_COLORS[diff],
        name: `leaderboard-tab-${label.toLowerCase()}`,
        onClick: () => {
          this.selectedBoardDifficulty = diff;
          this.updateLeaderboardTabStyles();
          this.renderLeaderboardRows(diff);
          this.layer.batchDraw();
        },
      });
      this.boardTabs.set(diff, tab);
      this.leaderboardModal.add(tab);
    });

    this.updateLeaderboardTabStyles();

    this.leaderboardModal.add(this.boardRowsGroup);

    // Close button
    this.leaderboardModal.add(this.createStyledMenuButton({
      x: mx + (modalW - 200) / 2,
      y: my + modalH - 76,
      width: 200,
      height: 52,
      label: "CLOSE",
      fill: "#ffffff",
      name: "close-leaderboard",
      onClick: () => {
        this.leaderboardModal.hide();
        this.layer.batchDraw();
      },
    }));

    this.layer.add(this.leaderboardModal);
  }

  private updateLeaderboardTabStyles(): void {
    for (const [diff, tab] of this.boardTabs) {
      const isSelected = diff === this.selectedBoardDifficulty;
      tab.opacity(isSelected ? 1 : 0.67);
    }
  }

  /**
   * Loads one Difficulty's Leaderboard, then draws it. A load that finishes
   * after the player picked another tab is ignored. A failed load shows the
   * empty-board text for now (loading and error states come in stage 4).
   */
  private renderLeaderboardRows(difficulty: Difficulty): void {
    this.boardRowsGroup.destroyChildren();
    if (!this.leaderboard) return;

    void this.leaderboard.getEntries(difficulty).then((result) => {
      if (this.selectedBoardDifficulty !== difficulty) return;
      this.drawLeaderboardRows(difficulty, result.status === "loaded" ? result.entries : []);
      this.layer.batchDraw();
    });
  }

  private drawLeaderboardRows(difficulty: Difficulty, entries: LeaderboardEntry[]): void {
    this.boardRowsGroup.destroyChildren();

    const modalW = 720;
    const mx = (DESIGN_WIDTH - modalW) / 2;
    const startY = 300;

    if (entries.length === 0) {
      this.boardRowsGroup.add(createText({
        x: mx,
        y: startY + 110,
        width: modalW,
        text: `No ${DIFFICULTY_LABEL[difficulty]} scores recorded yet.\nComplete a heist to claim #1!`,
        align: "center",
        fontSize: 24,
        fill: "#555566",
      }));
      return;
    }

    entries.slice(0, 10).forEach((entry, i) => {
      const rowY = startY + i * 36;
      const formattedTime = formatTime(entry.timeSpentMs);
      
      this.boardRowsGroup.add(createText({
        x: mx + 56,
        y: rowY,
        width: 340,
        text: `#${i + 1}  ${entry.playerName}`,
        align: "left",
        fontSize: 22,
        fill: COLORS.purple,
      }));

      this.boardRowsGroup.add(createText({
        x: mx + 400,
        y: rowY,
        width: 260,
        text: `${entry.score.toLocaleString("en-US")}  (${formatTime(entry.timeSpentMs)})`,
        align: "right",
        fontSize: 22,
        fill: COLORS.purple,
      }));
    });
  }

  /** A lightweight Settings screen using the same colors and positions as Figma 50:2. */
  private buildAudioSettings(): void {
    this.audioSettings.add(new Konva.Rect({
      width: DESIGN_WIDTH, height: DESIGN_HEIGHT, fill: COLORS.background,
    }));
    this.audioSettings.add(new Konva.Rect({
      x: 206, y: 136, width: 987, height: 627,
      fill: COLORS.room, cornerRadius: 18, name: "settings-panel",
    }));
    this.audioSettings.add(createText({
      x: 300, y: 60, width: 840, text: "SETTINGS",
      fontFamily: "Gasoek One", fontStyle: "normal", fontSize: 80,
      align: "center", fill: COLORS.gold, listening: false,
    }));
    this.audioSettings.add(createText({
      x: 245, y: 258, width: 900, text: "Sound Effects",
      fontSize: 50, fill: COLORS.purple, listening: false,
    }));
    this.audioSettings.add(createText({
      x: 245, y: 346, width: 900,
      text: "Sound effects play when you answer, solve a room, or use a hint.",
      fontSize: 25, fill: COLORS.purple, listening: false,
    }));
    const muteToggle = new Konva.Group({ x: 245, y: 443, name: "audio-mute-toggle" });
    muteToggle.add(new Konva.Rect({
      width: 550, height: 90, cornerRadius: 24,
      fill: COLORS.green, stroke: COLORS.purple, strokeWidth: 4,
    }));
    this.muteLabel = createText({
      width: 550, height: 90, text: "Sound Effects: ON", name: "audio-mute-label",
      align: "center", verticalAlign: "middle", fontSize: 40,
      fill: COLORS.purple, listening: false,
    });
    muteToggle.add(this.muteLabel);
    muteToggle.on("mouseenter", () => setCursor(muteToggle, "pointer"));
    muteToggle.on("mouseleave", () => setCursor(muteToggle, ""));
    muteToggle.on("click tap", () => {
      this.muted = !this.muted;
      this.muteLabel?.text(this.muted ? "Sound Effects: OFF" : "Sound Effects: ON");
      this.muteChanges.emit(this.muted);
      this.layer.batchDraw();
    });
    this.audioSettings.add(muteToggle);
    this.audioSettings.add(this.createStyledMenuButton({
      x: 948, y: 648, width: 163, height: 65,
      label: "Back", fill: COLORS.white, name: "settings-back",
      onClick: () => { this.audioSettings.hide(); this.layer.batchDraw(); },
    }));
    this.layer.add(this.audioSettings);
  }

  onAudioMuteChange(cb: (muted: boolean) => void): Unsubscribe {
    return this.muteChanges.add(cb);
  }

  onStart(cb: (difficulty: Difficulty) => void): Unsubscribe {
    return this.starts.add(cb);
  }

  onTutorial(cb: () => void): Unsubscribe {
    return this.tutorials.add(cb);
  }

  onSettings(cb: () => void): Unsubscribe {
    return this.settings.add(cb);
  }

  onLeaderboard(cb: () => void): Unsubscribe {
    return this.leaderboardClicks.add(cb);
  }

  onCredits(cb: () => void): Unsubscribe {
    return this.credits.add(cb);
  }

  show(): void {
    // Reset to primary menu whenever returning to StartScreen
    this.leaderboardModal.hide();
    this.audioSettings.hide();
    this.difficultyGroup.hide();
    this.mainMenuGroup.show();
    this.layer.show();
    this.layer.batchDraw();
  }

  hide(): void {
    this.layer.hide();
  }
}