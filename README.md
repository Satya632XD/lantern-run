# 🏮 Lantern Run

**Lantern Run** is an atmospheric, turn-based survival browser game set in a moonlit forest. Explore hidden paths, gather fireflies to fuel your lantern, camouflage in misty groves, evade prowling shadow stalkers, and make your way to the ancient Forest Gate before the light dies.

---

## 🎮 How to Play

### Launching the Game
Because Lantern Run is completely self-contained with zero external dependencies, you can launch it in any of the following ways:

1. **Local HTTP Server (Recommended)**:
   In the project folder, run:
   ```bash
   python -m http.server 8000
   ```
   Then open your browser and navigate to:
   `http://localhost:8000`

2. **Node.js `npx serve` or `http-server`**:
   ```bash
   npx serve .
   ```

3. **Direct File Open**:
   Open `index.html` directly in any modern browser (Chrome, Edge, Firefox, Safari).

---

## 🕹️ Controls

| Action | Desktop Keys | Mobile / Touch |
| :--- | :--- | :--- |
| **Move** | <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>Arrow Keys</kbd> | On-screen Virtual D-Pad or Tap Adjacent Tile |
| **Wait / Pass Turn** | <kbd>Spacebar</kbd> | "Wait (Pass Turn)" Button |
| **Lantern Flare (Stun)** | <kbd>F</kbd> | "Flare (Stun Beasts)" Button |
| **Pause / Resume** | <kbd>P</kbd> or <kbd>Esc</kbd> | Pause Button |
| **Restart Fresh Run** | <kbd>R</kbd> | Restart Button |
| **Help & Rules** | <kbd>H</kbd> or <kbd>?</kbd> | Rules Button |
| **Toggle Audio** | <kbd>M</kbd> | Sound Button |

---

## 🌲 Forest Map & Symbols

- **🏮 Player (You):** An explorer with a dark hooded cloak and a warm, glowing handheld lantern.
- **🚪 Forest Gate (Exit):** An ancient stone gateway shining with moonlit beacon rays. Reach here to escape and win!
- **✨ Fireflies:** Swarms of glowing woodland fireflies. Walk on them to collect and restore **+25 Lantern Fuel**.
- **🏛️ Ancient Shrines:** Sacred stone monoliths. Step into an active shrine to send out a light pulse that **permanently unveils an expanse of the map** and grants **+1 Lantern Flare**.
- **🌿 Misty Groves:** Dense thickets that **camouflage you from prowling creatures**. When inside a grove, creatures lose your trail unless they are directly next to you.
- **🐾 Shadow Stalkers:** Predatory beasts roaming the woods. When you are within 5-6 tiles, they begin hunting you using pathfinding.
- **🌲 Ancient Trees:** Dense, impassable woodland obstacles.

---

## ⚙️ Core Mechanics & Balance

1. **Turn-Based Flow:** Every move or action is 1 turn. Creatures only move *after* you take an action, allowing strategic planning without twitch reflexes.
2. **Dynamic Vision Radius:**
   - **High Fuel (> 50%):** Wide radius (3.6 tiles).
   - **Moderate Fuel (21% - 50%):** Medium radius (2.8 tiles).
   - **Critical Fuel (≤ 20%):** Tight perimeter (2.1 tiles) + heartbeat warning pulse.
   - **Fuel reaches 0%:** Lantern extinguishes; darkness consumes the run.
3. **Guaranteed Solvable Maps:** Every generated forest is procedurally validated via Breadth-First Search (BFS) pathfinding to guarantee a winding, reachable path from spawn to exit.
4. **Procedural Web Audio:** Zero audio downloads or external assets. Features realistic procedural audio synthesis via the Web Audio API for footsteps, firefly chimes, shrine bells, creature whispers, flare bursts, defeat, and victory.
5. **Accessibility & Responsive Design:**
   - Works seamlessly on both desktop monitors and mobile touchscreens.
   - Keyboard focus rings (`:focus-visible`) and native `<dialog>` modals with overscroll isolation.
   - "Reduce Motion" setting to disable dynamic flicker and floating particles for sensitive players.

---

## 📂 Project Architecture

```
lantern-run/
├── index.html           # Semantic HTML5 layout, HUD, mobile controls & accessible modals
├── style.css            # Nocturnal palette, animations, D-pad styling, and responsive media queries
├── audio.js             # Zero-dependency procedural Web Audio API sound synthesizer
├── map.js               # Grid definitions, procedural forest generation, BFS validation, and fog of war
├── entities.js          # Player state, Creature hunting AI (BFS), and ambient spore particle system
├── renderer.js          # HTML5 Canvas 2D engine with dynamic lighting, radial fog, and smooth movement
├── game.js              # Game loop, turn coordinator, input debounce, and dialog lifecycle
├── test_game_logic.js   # Automated test suite (100-run map solvability & entity behavior verification)
└── README.md            # Documentation, controls, and architecture breakdown
```
