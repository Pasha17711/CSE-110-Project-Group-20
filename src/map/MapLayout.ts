import { MapGrid } from "./MapGrid";
import { Room, type RoomConfig } from "./Room";
import { Difficulty } from "../score";
import { getQuestion } from "../questions/QuestionGenerator";
import { generatePairs } from "../power-box/power-box-generator";
import { generateLaserQuestions } from "../graph/graph-equation-generator";

/** A Room's settings apart from its Question and puzzle, which the helpers below make. */
type RoomBasics = Omit<RoomConfig, "question" | "puzzle">;

export interface GeneratedMapLayout {
    grid: MapGrid;
    rooms: Room[];
}

/**
 * Every layout uses the same puzzles: Room B is the Power Box, Room C the
 * Laser Match, and every other Room (the Vault and Bonus Rooms included)
 * is a multistep Room.
 */
export class MapLayout {

    /** A Power Box Room: one Question per wire, made once per Heist. */
    private static powerBoxRoom(basics: RoomBasics, difficulty: Difficulty): Room {
        const pairs = generatePairs(difficulty);
        return new Room({ ...basics, question: pairs[0].question, puzzle: { type: "powerBox", pairs } });
    }

    /** A Laser Match Room: one Question per equation/graph pair, made once per Heist. */
    private static laserRoom(basics: RoomBasics, difficulty: Difficulty): Room {
        const questions = generateLaserQuestions(difficulty);
        return new Room({ ...basics, question: questions[0], puzzle: { type: "laser", questions } });
    }

    public static createLayout(difficulty: Difficulty): GeneratedMapLayout {
        switch (difficulty) {
            case Difficulty.Easy:
                return this.createEasyLayout();
            case Difficulty.Medium:
                return this.createMediumLayout();
            case Difficulty.Hard:
                return this.createHardLayout();
            default:
                return this.createEasyLayout();
        }
    }

    // Easy level map layout
    // [Room A] [Room B] [Vault]
    // [(null)] [(null)] [(null)]
    // [Room C] [(null)] [Room X]
    private static createEasyLayout(): GeneratedMapLayout {
        const grid = new MapGrid(3, 3);

        const roomA = new Room({
            id: "room_a",
            name: "Room A",
            question: getQuestion(Difficulty.Easy),
        });

        const roomB = this.powerBoxRoom({
            id: "room_b",
            name: "Room B",
        }, Difficulty.Easy);

        const roomC = this.laserRoom({
            id: "room_c",
            name: "Room C",
            prerequisites: ["room_a", "room_b"],
        }, Difficulty.Easy);

        const vault = new Room({
            id: "vault",
            name: "Vault",
            question: getQuestion(Difficulty.Easy),
            prerequisites: ["room_c"],
        });

        const roomX = new Room({
            id: "room_x",
            name: "Room X",
            question: getQuestion(Difficulty.Easy),
            kind: "bonus",
        });

        // Place + assign room widths & heights 
        grid.placeRoom(roomA, 0, 0, 1, 1);
        grid.placeRoom(roomB, 0, 1, 1, 1);
        grid.placeRoom(vault, 0, 2, 1, 2);
        grid.placeRoom(roomC, 2, 0, 2, 1, {visualColSpan: 1.5});
        grid.placeRoom(roomX, 2, 2, 1, 1);

        return {grid, rooms: [roomA, roomB, roomC, roomX, vault]};
    }

    // Medium level map layout
    // [Room A] [Room B] [Vault]
    // [Room C] [(null)] [(null)]
    // [Room X] [Room D] [(null)]
    private static createMediumLayout(): GeneratedMapLayout {
        const grid = new MapGrid(3, 3);

        const roomA = new Room({
            id: "room_a",
            name: "Room A",
            question: getQuestion(Difficulty.Medium),
        });

        const roomB = this.powerBoxRoom({
            id: "room_b",
            name: "Room B",
        }, Difficulty.Medium);

        const roomC = this.laserRoom({
            id: "room_c",
            name: "Room C",
            prerequisites: ["room_a", "room_b"],
        }, Difficulty.Medium);

        const roomD = new Room({
            id: "room_d",
            name: "Room D",
            question: getQuestion(Difficulty.Medium),
        });

        const vault = new Room({
            id: "vault",
            name: "Vault",
            question: getQuestion(Difficulty.Medium),
            prerequisites: ["room_c", "room_d"],
        });

        const roomX = new Room({
            id: "room_x",
            name: "Room X",
            question: getQuestion(Difficulty.Medium),
            kind: "bonus",
        });

        grid.placeRoom(roomA, 0, 0, 1, 2, {visualRowSpan: 1.3});
        grid.placeRoom(roomB, 0, 1, 1, 2, {visualColSpan: 0.9, visualRowSpan: 1.3});
        grid.placeRoom(vault, 0, 2, 1, 2);
        grid.placeRoom(roomC, 2, 0);
        grid.placeRoom(roomD, 2, 1, 1, 1, {visualColSpan: 0.9});
        grid.placeRoom(roomX, 2, 2);

        return {grid, rooms: [roomA, roomB, roomC, roomD, roomX, vault]};
    }

    // Hard level map layout
    // [Room A] [Room B] [Room E] [Vault]
    // [Room C] [(null)] [(null)] [(null)]
    // [Room X] [(null)] [Room D] [Room Y]
    private static createHardLayout(): GeneratedMapLayout {
        const grid = new MapGrid(3, 4);

        const roomA = new Room({
            id: "room_a",
            name: "Room A",
            question: getQuestion(Difficulty.Hard),
        });

        const roomB = this.powerBoxRoom({
            id: "room_b",
            name: "Room B",
            prerequisites: ["room_a"],
        }, Difficulty.Hard);

        const roomC = this.laserRoom({
            id: "room_c",
            name: "Room C",
        }, Difficulty.Hard);

        const roomD = new Room({
            id: "room_d",
            name: "Room D",
            question: getQuestion(Difficulty.Hard),
        });

        const roomE = new Room({
            id: "room_e",
            name: "Room E",
            question: getQuestion(Difficulty.Hard),
            prerequisites: ["room_b", "room_c"],
        });

        const vault = new Room({
            id: "vault",
            name: "Vault",
            question: getQuestion(Difficulty.Hard),
            prerequisites: ["room_e", "room_d"],
        });

        const roomX = new Room({
            id: "room_x",
            name: "Room X",
            question: getQuestion(Difficulty.Hard),
            kind: "bonus",
        });

        const roomY = new Room({
            id: "room_y",
            name: "Room Y",
            question: getQuestion(Difficulty.Hard),
            kind: "bonus",
        });

        grid.placeRoom(roomB, 0, 0, 1, 1, {visualColSpan: 0.9});
        grid.placeRoom(roomC, 0, 1);
        grid.placeRoom(roomD, 0, 2);
        grid.placeRoom(vault, 0, 3, 1, 2);
        grid.placeRoom(roomA, 1, 0, 1, 1, {visualColSpan: 0.9});
        grid.placeRoom(roomY, 2, 0, 1, 1, {visualColSpan: 0.9});
        grid.placeRoom(roomE, 2, 1, 2, 1, {visualColSpan: 1.5});
        grid.placeRoom(roomX, 2, 3);

        return {grid, rooms: [roomA, roomB, roomC, roomD, roomE, roomX, roomY, vault]};
    }

}