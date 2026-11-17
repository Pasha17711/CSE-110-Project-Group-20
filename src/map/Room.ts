import type { Question } from "../questions/Question";
import type { PowerBoxPair } from "../power-box/power-box-generator";

/** A main Room is part of the path to the Vault; a bonus Room is optional extra. */
export type RoomKind = "main" | "bonus";

/**
 * Which puzzle the Room Screen builds for a Room, with the Questions it needs.
 * Like the Room's Question, they are made once per Heist, so leaving and
 * re-entering shows the same puzzle.
 * - multistep: solve the Room's `question` Step by Step.
 * - powerBox: wire each equation to its value of x, one Question per wire.
 * - laser: match each equation to its graph, one Question per pair
 *   (see generateLaserQuestions).
 */
export type RoomPuzzle =
  | { type: "multistep" }
  | { type: "powerBox"; pairs: readonly PowerBoxPair[] }
  | { type: "laser"; questions: readonly Question[] };

export interface RoomConfig {
  id: string;   // unique room id
  name: string; // display name
  /**
   * The Room's Question, generated once per Heist. A Power Box or Laser Room
   * has one Question per pair (in `puzzle`); this is then the first of them.
   */
  question: Question;
  kind?: RoomKind; // "main" (default) or "bonus"
  puzzle?: RoomPuzzle; // { type: "multistep" } (default), "powerBox" or "laser"
  assets?: Record<string, unknown>; // room assets (background art)
  prerequisites?: string[]; // ids of Rooms that must be Solved first
}

/**
 * A Room on the map. Solved state is not stored here: it lives only in
 * MapController (`solvedRooms`), which passes it in where needed.
 */
export class Room {
  public readonly id: string;
  public readonly name: string;
  public readonly question: Question;
  public readonly kind: RoomKind;
  public readonly puzzle: RoomPuzzle;
  public readonly assets: Record<string, unknown>;
  public readonly prerequisites: string[];

  constructor({
    id, name, question, kind = "main", puzzle = { type: "multistep" }, assets = {}, prerequisites = [],
  }: RoomConfig) {
    this.id = id;
    this.name = name;
    this.question = question;
    this.kind = kind;
    this.puzzle = puzzle;
    this.assets = assets;
    this.prerequisites = prerequisites;
  }

  /** True when every prerequisite is in `solvedRoomIds`. */
  public isAccessible(solvedRoomIds: Iterable<string> = []): boolean {
    return this.getMissingPrerequisites(solvedRoomIds).length === 0;
  }

  /** The prerequisite ids that are not in `solvedRoomIds`, in order. */
  public getMissingPrerequisites(solvedRoomIds: Iterable<string> = []): string[] {
    const solved = new Set(solvedRoomIds);
    return this.prerequisites.filter((reqId) => !solved.has(reqId));
  }
}
