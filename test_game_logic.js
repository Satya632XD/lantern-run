// test_game_logic.js - Comprehensive automated simulation & verification of Lantern Run logic

// Mock window and browser globals
global.window = global;
global.document = {
  getElementById: () => ({
    addEventListener: () => {},
    getBoundingClientRect: () => ({ width: 600, height: 600, left: 0, top: 0 }),
    getContext: () => ({
      save: () => {},
      restore: () => {},
      scale: () => {},
      translate: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      strokeRect: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      ellipse: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} })
    }),
    style: {},
    classList: { add: () => {}, remove: () => {} },
    setAttribute: () => {},
    showModal: () => {},
    close: () => {}
  }),
  addEventListener: () => {}
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
global.requestAnimationFrame = () => {};

// Load game files
require('./audio.js');
require('./map.js');
require('./entities.js');
require('./renderer.js');

console.log('Testing 1. Forest Map Generation & Solvability across 100 runs...');
let unsolvableCount = 0;
let minPathLength = Infinity;
let maxPathLength = -Infinity;

for (let i = 0; i < 100; i++) {
  const map = new ForestMap(24, 24);
  const success = map.generate();
  if (!success) {
    unsolvableCount++;
    continue;
  }

  const path = map.findPath(map.playerStart, map.exitPos);
  if (!path) {
    unsolvableCount++;
  } else {
    minPathLength = Math.min(minPathLength, path.length);
    maxPathLength = Math.max(maxPathLength, path.length);
  }

  // Verify feature counts
  if (map.shrines.length < 1) throw new Error('No shrines placed!');
  if (map.fireflies.length < 4) throw new Error('Too few fireflies placed!');
  if (map.creatures.length < 2) throw new Error('Too few creatures placed!');
}

console.log(`Results across 100 generated forests:`);
console.log(`- Solvability: ${100 - unsolvableCount}/100 passed`);
console.log(`- Min path length: ${minPathLength}, Max path length: ${maxPathLength}`);
if (unsolvableCount > 0) {
  throw new Error(`Failed: ${unsolvableCount} maps were unsolvable!`);
}

console.log('Testing 2. Player Movement, Turn Step, Fuel Drain & Collection...');
const testMap = new ForestMap(24, 24);
testMap.generate();
const player = new Player(testMap.playerStart.x, testMap.playerStart.y);

// Initial state
const initialFuel = player.fuel;
if (initialFuel <= 0) throw new Error('Initial fuel invalid');

// Move player one step
player.moveTo(player.x + 1, player.y);
player.drainFuel(1);
if (player.fuel !== initialFuel - 1) throw new Error('Fuel did not decrement by 1');
if (player.steps !== 1) throw new Error('Step counter did not increment');

// Pick up firefly test
const gained = player.addFuel(25);
if (player.fuel !== Math.min(player.maxFuel, initialFuel - 1 + 25)) {
  throw new Error('Firefly fuel restoration calculation failed');
}

console.log('Testing 3. Creature AI & Hunting Behavior...');
const creature = new Creature(1, 10, 10);
// Player at 10, 12 (dist = 2)
player.x = 10;
player.y = 12;
player.inGrove = false;

const updateResult = creature.update(testMap, player, [creature]);
console.log(`Creature state when player is nearby: ${creature.state}, Alert: ${updateResult.becameAlert}`);
if (creature.state !== 'hunt') {
  throw new Error('Creature failed to detect player in hunting range');
}

// Test Grove Stealth
console.log('Testing 4. Grove Camouflage...');
player.x = 10;
player.y = 15; // dist = 5
player.inGrove = true;
creature.update(testMap, player, [creature]);
console.log(`Creature state when player is in grove at dist 5: ${creature.state}`);
if (creature.state !== 'wander') {
  throw new Error('Creature detected player while camouflaged in grove!');
}

// Test Lantern Flare Stun
console.log('Testing 5. Lantern Flare Stun...');
creature.stun(3);
if (creature.state !== 'stunned' || creature.stunnedTurns !== 3) {
  throw new Error('Stun state not applied properly');
}
const stunTurn1 = creature.update(testMap, player, [creature]);
if (stunTurn1.moved || creature.stunnedTurns !== 2) {
  throw new Error('Stunned creature moved!');
}
const stunTurn2 = creature.update(testMap, player, [creature]);
const stunTurn3 = creature.update(testMap, player, [creature]);
console.log(`Creature after 3 turns: state = ${creature.state}, stunnedTurns = ${creature.stunnedTurns}`);
if (creature.state === 'stunned') {
  throw new Error('Creature remained stunned past 3 turns');
}

// Test Line of Sight & Shrine Activation
console.log('Testing 6. Shrines and Visibility...');
testMap.updateVisibility(testMap.playerStart.x, testMap.playerStart.y, 60);
const startVisible = testMap.visible[testMap.playerStart.y][testMap.playerStart.x];
if (!startVisible) throw new Error('Player start tile not visible');

const firstShrine = testMap.shrines[0];
const activated = testMap.activateShrine(firstShrine.x, firstShrine.y);
if (!activated) throw new Error('Shrine failed to activate');
// Check that shrine radius was revealed
if (!testMap.revealed[firstShrine.y][firstShrine.x]) {
  throw new Error('Shrine tile was not revealed after activation');
}

console.log('All automated logic tests PASSED successfully!');
