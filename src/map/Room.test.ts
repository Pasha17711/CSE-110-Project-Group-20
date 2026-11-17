import { describe, test, expect } from 'vitest';
import { Room } from './Room';

const question = { prompt: 'x * 2 + 1 = 5', answer: '2' };

describe('Room Unit Tests', () => {
  test('unlocked room with empty prerequisites is accessible by default', () => {
    const roomA = new Room({ id: 'room_a', name: 'Room A', question });
    expect(roomA.isAccessible([])).toBe(true);
  });

  test('locked room is not accessible if prerequisite room is not Solved', () => {
    const roomC = new Room({
      id: 'room_c',
      name: 'Room C',
      question,
      prerequisites: ['room_a'],
    });

    expect(roomC.isAccessible([])).toBe(false);
    expect(roomC.isAccessible(['room_b'])).toBe(false);
  });

  test('locked room is accessible once all prerequisite rooms are Solved', () => {
    const vault = new Room({
      id: 'vault',
      name: 'Vault',
      question,
      prerequisites: ['room_b', 'room_c'],
    });

    expect(vault.isAccessible(['room_b'])).toBe(false);
    expect(vault.isAccessible(['room_b', 'room_c'])).toBe(true);
  });

  test('accepts the Solved ids as a Set and lists missing prerequisites in order', () => {
    const vault = new Room({ id: 'vault', name: 'Vault', question, prerequisites: ['room_b', 'room_c'] });

    expect(vault.isAccessible(new Set(['room_b', 'room_c']))).toBe(true);
    expect(vault.getMissingPrerequisites(new Set(['room_c']))).toEqual(['room_b']);
  });

  test('defaults to a main Room and keeps its Question', () => {
    const roomA = new Room({ id: 'room_a', name: 'Room A', question });
    const roomX = new Room({ id: 'room_X', name: 'Room X', question, kind: 'bonus' });

    expect(roomA.kind).toBe('main');
    expect(roomX.kind).toBe('bonus');
    expect(roomA.question).toBe(question);
  });

  test('defaults to a multistep puzzle and keeps the puzzle it is given', () => {
    const roomA = new Room({ id: 'room_a', name: 'Room A', question });
    const pairs = [{ question }];
    const roomB = new Room({ id: 'room_b', name: 'Room B', question, puzzle: { type: 'powerBox', pairs } });

    expect(roomA.puzzle).toEqual({ type: 'multistep' });
    expect(roomB.puzzle).toEqual({ type: 'powerBox', pairs });
  });

});