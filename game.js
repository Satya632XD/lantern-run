// game.js - Core game loop, turn coordinator, input management, and HUD updates

class LanternRunGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new GameRenderer(this.canvas);
    this.forestMap = new ForestMap(24, 24);
    this.player = new Player();
    this.creatures = [];
    this.particleSystem = new ParticleSystem(24, 24);

    this.state = 'intro'; // 'intro', 'playing', 'paused', 'won', 'lost'
    this.lossReason = null;
    this.firefliesCollected = 0;
    this.shrinesActivated = 0;
    this.runStartTime = null;
    this.elapsedSeconds = 0;

    this.logs = [];
    this.maxLogs = 3;
    this.lastInputTime = 0;
    this.inputCooldown = 140; // ms minimum between inputs to prevent unintended runaway moves
    this.reduceMotion = false;

    // Cache DOM Elements
    this.elements = {
      fuelFill: document.getElementById('fuel-fill'),
      fuelValue: document.getElementById('fuel-value'),
      fuelWarning: document.getElementById('fuel-warning'),
      statusMsgText: document.getElementById('status-msg-text'),
      stepsValue: document.getElementById('steps-value'),
      firefliesValue: document.getElementById('fireflies-value'),
      flashesValue: document.getElementById('flashes-value'),
      logFeed: document.getElementById('log-feed'),
      stealthBadge: document.getElementById('stealth-badge'),

      // Dialogs
      helpDialog: document.getElementById('help-dialog'),
      pauseDialog: document.getElementById('pause-dialog'),
      endDialog: document.getElementById('end-dialog'),
      endTitle: document.getElementById('end-title'),
      endMessage: document.getElementById('end-message'),
      endStats: document.getElementById('end-stats'),
      endIcon: document.getElementById('end-icon'),

      // Header buttons
      btnHelp: document.getElementById('btn-help'),
      btnPause: document.getElementById('btn-pause'),
      btnRestart: document.getElementById('btn-restart'),
      btnMute: document.getElementById('btn-mute'),
      btnMotion: document.getElementById('btn-motion'),

      // Action buttons
      btnWait: document.getElementById('btn-wait'),
      btnFlash: document.getElementById('btn-flash'),

      // D-Pad
      btnUp: document.getElementById('btn-up'),
      btnDown: document.getElementById('btn-down'),
      btnLeft: document.getElementById('btn-left'),
      btnRight: document.getElementById('btn-right'),

      // Modal buttons
      btnHelpClose: document.getElementById('btn-help-close'),
      btnPauseResume: document.getElementById('btn-pause-resume'),
      btnPauseRestart: document.getElementById('btn-pause-restart'),
      btnPlayAgain: document.getElementById('btn-play-again')
    };

    this.bindEvents();
    this.checkFirstVisit();
  }

  checkFirstVisit() {
    const hasSeenTutorial = localStorage.getItem('lantern_run_seen_tutorial');
    if (!hasSeenTutorial) {
      this.showHelp();
      localStorage.setItem('lantern_run_seen_tutorial', 'true');
    } else {
      this.startNewRun();
    }
  }

  startNewRun() {
    // Generate fresh solvable forest
    this.forestMap.generate();

    // Reset player position & stats
    this.player.reset(this.forestMap.playerStart.x, this.forestMap.playerStart.y);

    // Spawn creatures
    this.creatures = this.forestMap.creatures.map((c, idx) =>
      new Creature(idx + 1, c.x, c.y)
    );

    this.firefliesCollected = 0;
    this.shrinesActivated = 0;
    this.runStartTime = Date.now();
    this.elapsedSeconds = 0;
    this.state = 'playing';
    this.lossReason = null;
    this.logs = [];

    // Snap camera to start position
    this.renderer.camInitialized = false;

    // Initial vision update
    this.forestMap.updateVisibility(this.player.x, this.player.y, this.player.fuel);

    this.addLog('You step into the dark whispers of Whispering Pines. Reach the Forest Gate before your lantern fades.');
    this.updateHUD();

    if (window.soundFX) {
      window.soundFX.startAmbience();
    }
  }

  bindEvents() {
    // Resize listener
    window.addEventListener('resize', () => {
      this.renderer.resize();
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    // Header buttons
    this.elements.btnHelp?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showHelp();
    });

    this.elements.btnPause?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePause();
    });

    this.elements.btnRestart?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startNewRun();
    });

    this.elements.btnMute?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isMuted = window.soundFX.toggleMute();
      this.elements.btnMute.setAttribute('aria-pressed', isMuted);
      this.elements.btnMute.innerHTML = isMuted
        ? '<span class="icon">🔇</span><span class="label">Unmute</span>'
        : '<span class="icon">🔊</span><span class="label">Mute</span>';
    });

    this.elements.btnMotion?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.reduceMotion = !this.reduceMotion;
      this.renderer.setReduceMotion(this.reduceMotion);
      this.elements.btnMotion.setAttribute('aria-pressed', this.reduceMotion);
      this.elements.btnMotion.innerHTML = this.reduceMotion
        ? '<span class="icon">🛑</span><span class="label">Motion: Off</span>'
        : '<span class="icon">✨</span><span class="label">Motion: On</span>';
      this.addLog(this.reduceMotion ? 'Reduced motion enabled.' : 'Animated motion enabled.');
    });

    // Action buttons
    this.elements.btnWait?.addEventListener('click', () => {
      this.executeWaitAction();
    });

    this.elements.btnFlash?.addEventListener('click', () => {
      this.executeFlashAction();
    });

    // D-Pad touch & click
    const dpadButtons = [
      { el: this.elements.btnUp, dx: 0, dy: -1 },
      { el: this.elements.btnDown, dx: 0, dy: 1 },
      { el: this.elements.btnLeft, dx: -1, dy: 0 },
      { el: this.elements.btnRight, dx: 1, dy: 0 }
    ];

    dpadButtons.forEach(({ el, dx, dy }) => {
      if (!el) return;
      const moveHandler = (e) => {
        e.preventDefault();
        this.attemptPlayerMove(dx, dy);
      };
      el.addEventListener('pointerdown', moveHandler);
    });

    // Modal buttons and close lifecycle
    this.elements.helpDialog?.addEventListener('close', () => {
      if (this.state === 'intro') {
        this.startNewRun();
      } else if (this.state === 'paused') {
        this.resumeGame();
      }
    });

    this.elements.pauseDialog?.addEventListener('close', () => {
      if (this.state === 'paused') {
        this.state = 'playing';
      }
    });

    this.elements.btnHelpClose?.addEventListener('click', () => {
      this.elements.helpDialog.close();
    });

    this.elements.btnPauseResume?.addEventListener('click', () => {
      this.resumeGame();
    });

    this.elements.btnPauseRestart?.addEventListener('click', () => {
      this.elements.pauseDialog.close();
      this.startNewRun();
    });

    this.elements.btnPlayAgain?.addEventListener('click', () => {
      this.elements.endDialog.close();
      this.startNewRun();
    });

    // Light-dismiss fallback for <dialog closedby="any"> per modern web guidance
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e, dialog) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => { pressedOutside = isOutside(e, dialog); });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && isOutside(e, dialog)) dialog.close();
        });
      }
    }

    // Tap/Click on canvas to step towards adjacent tile
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      const rect = this.canvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) + this.renderer.camX;
      const clickY = (e.clientY - rect.top) + this.renderer.camY;

      const targetTileX = Math.floor(clickX / this.renderer.tileSize);
      const targetTileY = Math.floor(clickY / this.renderer.tileSize);

      const dx = targetTileX - this.player.x;
      const dy = targetTileY - this.player.y;

      if (Math.abs(dx) + Math.abs(dy) === 1) {
        this.attemptPlayerMove(dx, dy);
      } else if (dx === 0 && dy === 0) {
        this.executeWaitAction();
      }
    });
  }

  handleKeyDown(e) {
    // If a modal is open, let native dialog Esc close it or button enter
    if (this.elements.helpDialog.open || this.elements.pauseDialog.open || this.elements.endDialog.open) {
      if (e.key === 'Escape') {
        if (this.elements.helpDialog.open) {
          this.elements.helpDialog.close();
          if (this.state === 'intro') this.startNewRun();
        } else if (this.elements.pauseDialog.open) {
          this.resumeGame();
        }
      }
      return;
    }

    const key = e.key.toLowerCase();

    // Toggle Pause
    if (key === 'p' || key === 'escape') {
      e.preventDefault();
      this.togglePause();
      return;
    }

    // Help modal
    if (key === 'h' || key === '?') {
      e.preventDefault();
      this.showHelp();
      return;
    }

    // Restart key
    if (key === 'r') {
      e.preventDefault();
      this.startNewRun();
      return;
    }

    // Mute key
    if (key === 'm') {
      e.preventDefault();
      this.elements.btnMute?.click();
      return;
    }

    // Only process gameplay inputs when in playing state
    if (this.state !== 'playing') return;

    // Movement keys: prevent page scroll
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'f'].includes(key)) {
      e.preventDefault();
    }

    // Debounce rapid repeat key presses
    const now = Date.now();
    if (now - this.lastInputTime < this.inputCooldown) {
      return;
    }

    switch (key) {
      case 'arrowup':
      case 'w':
        this.attemptPlayerMove(0, -1);
        break;
      case 'arrowdown':
      case 's':
        this.attemptPlayerMove(0, 1);
        break;
      case 'arrowleft':
      case 'a':
        this.attemptPlayerMove(-1, 0);
        break;
      case 'arrowright':
      case 'd':
        this.attemptPlayerMove(1, 0);
        break;
      case ' ':
        this.executeWaitAction();
        break;
      case 'f':
        this.executeFlashAction();
        break;
    }
  }

  attemptPlayerMove(dx, dy) {
    if (this.state !== 'playing') return;
    this.lastInputTime = Date.now();

    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;

    // Check map boundaries
    if (targetX < 0 || targetX >= this.forestMap.width || targetY < 0 || targetY >= this.forestMap.height) {
      this.addLog('Dense impassable boundary blocks your path.');
      return;
    }

    const targetTile = this.forestMap.grid[targetY][targetX];

    // Check collision with trees
    if (targetTile === TILE.TREE) {
      this.addLog('Gnarls of ancient pine trees block this direction.');
      return;
    }

    // Valid step! Execute move
    this.player.moveTo(targetX, targetY);
    this.player.drainFuel(1);
    window.soundFX?.playStep();

    // Check tile interactions
    const tileAfter = this.forestMap.grid[targetY][targetX];

    // Grove stealth check
    if (tileAfter === TILE.GROVE) {
      this.player.inGrove = true;
      this.addLog('🌿 Concealed within the misty grove. Stalkers lose your trail.');
    } else {
      this.player.inGrove = false;
    }

    // Firefly pickup
    if (tileAfter === TILE.FIREFLY) {
      this.forestMap.collectFirefly(targetX, targetY);
      const restored = this.player.addFuel(25);
      this.firefliesCollected++;
      this.particleSystem.triggerCollectBurst(targetX, targetY);
      window.soundFX?.playFirefly();
      this.addLog(`✨ Captured warm fireflies! Lantern restored (+${restored} Fuel).`);
    }

    // Shrine interaction
    if (tileAfter === TILE.SHRINE) {
      const activated = this.forestMap.activateShrine(targetX, targetY);
      if (activated) {
        this.shrinesActivated++;
        this.player.flashes = Math.min(this.player.maxFlashes, this.player.flashes + 1);
        window.soundFX?.playShrine();
        this.addLog('🏛️ Ancient shrine awakened! An expanse of forest is revealed & +1 Flare granted.');
      } else {
        this.addLog('The ancient stone shrine stands quiet, its sacred light already released.');
      }
    }

    // Exit check
    if (targetX === this.forestMap.exitPos.x && targetY === this.forestMap.exitPos.y) {
      this.endGame('won');
      return;
    }

    // Check fuel death
    if (this.player.fuel <= 0) {
      this.endGame('lost', 'fuel');
      return;
    }

    // Process creatures' turns and visibility
    this.processTurnEnd();
  }

  executeWaitAction() {
    if (this.state !== 'playing') return;
    this.lastInputTime = Date.now();

    this.player.steps++;
    this.player.drainFuel(1);
    this.addLog('You stand motionless, listening to the murmurs of the forest.');

    if (this.player.fuel <= 0) {
      this.endGame('lost', 'fuel');
      return;
    }

    this.processTurnEnd();
  }

  executeFlashAction() {
    if (this.state !== 'playing') return;
    this.lastInputTime = Date.now();

    if (this.player.flashes <= 0) {
      this.addLog('⚠️ No Lantern Flares remaining! Seek an ancient shrine to recharge.');
      return;
    }

    this.player.flashes--;
    this.player.drainFuel(2);
    this.player.steps++;

    this.particleSystem.triggerFlashBurst(this.player.x, this.player.y, 5);
    window.soundFX?.playFlare();

    let stunnedCount = 0;
    for (const c of this.creatures) {
      const dist = Math.hypot(c.x - this.player.x, c.y - this.player.y);
      if (dist <= 5.5) {
        c.stun(3);
        stunnedCount++;
      }
    }

    if (stunnedCount > 0) {
      this.addLog(`⚡ Blinding lantern flare! Stunned ${stunnedCount} shadow stalker(s) for 3 turns.`);
    } else {
      this.addLog('⚡ The lantern flares with radiant white brilliance into the night.');
    }

    if (this.player.fuel <= 0) {
      this.endGame('lost', 'fuel');
      return;
    }

    this.processTurnEnd();
  }

  processTurnEnd() {
    // 1. Update line of sight visibility
    this.forestMap.updateVisibility(this.player.x, this.player.y, this.player.fuel);

    // 2. Creature movement
    let alertSoundPlayed = false;

    for (const creature of this.creatures) {
      const result = creature.update(this.forestMap, this.player, this.creatures);

      if (result.becameAlert && !alertSoundPlayed) {
        window.soundFX?.playCreatureAlert();
        this.addLog('👁️ A shadow stalker catches your scent and begins stalking you!');
        alertSoundPlayed = true;
      }

      // Check if creature caught the player
      if (creature.x === this.player.x && creature.y === this.player.y) {
        this.endGame('lost', 'creature');
        return;
      }
    }

    // 3. Low fuel warning
    if (this.player.fuel <= 15) {
      this.addLog('⚠️ Your lantern light is sputtering low! Find fireflies immediately.');
    }

    // 4. Refresh HUD
    this.updateHUD();
  }

  addLog(message) {
    this.logs.unshift(message);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    if (this.elements.statusMsgText) {
      this.elements.statusMsgText.textContent = message;
    }
    this.renderLogs();
  }

  renderLogs() {
    if (!this.elements.logFeed) return;
    this.elements.logFeed.innerHTML = this.logs
      .map((log, index) => {
        const opacity = 1 - index * 0.22;
        return `<div class="log-item ${index === 0 ? 'log-new' : ''}" style="opacity: ${opacity}">${log}</div>`;
      })
      .join('');
  }

  updateHUD() {
    // Fuel gauge
    const fuelPercent = Math.round((this.player.fuel / this.player.maxFuel) * 100);
    if (this.elements.fuelFill) {
      this.elements.fuelFill.style.width = `${fuelPercent}%`;

      if (fuelPercent <= 20) {
        this.elements.fuelFill.className = 'fuel-fill critical';
      } else if (fuelPercent <= 45) {
        this.elements.fuelFill.className = 'fuel-fill warning';
      } else {
        this.elements.fuelFill.className = 'fuel-fill normal';
      }
    }

    if (this.elements.fuelValue) {
      this.elements.fuelValue.textContent = `${fuelPercent}%`;
    }

    // Counters
    if (this.elements.stepsValue) {
      this.elements.stepsValue.textContent = this.player.steps;
    }
    if (this.elements.firefliesValue) {
      this.elements.firefliesValue.textContent = this.firefliesCollected;
    }
    if (this.elements.flashesValue) {
      this.elements.flashesValue.textContent = this.player.flashes;
    }

    // Stealth indicator
    if (this.elements.stealthBadge) {
      this.elements.stealthBadge.style.display = this.player.inGrove ? 'inline-flex' : 'none';
    }
  }

  showHelp() {
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      this.state = 'paused';
    }
    this.elements.helpDialog.showModal();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.elements.pauseDialog.showModal();
    } else if (this.state === 'paused') {
      this.resumeGame();
    }
  }

  resumeGame() {
    this.elements.pauseDialog.close();
    this.state = 'playing';
  }

  endGame(outcome, reason = null) {
    this.state = outcome;
    this.lossReason = reason;
    this.elapsedSeconds = Math.round((Date.now() - this.runStartTime) / 1000);

    const minutes = Math.floor(this.elapsedSeconds / 60);
    const seconds = (this.elapsedSeconds % 60).toString().padStart(2, '0');

    if (outcome === 'won') {
      window.soundFX?.playWin();
      this.elements.endTitle.textContent = 'Dawn Breaks — You Escaped!';
      this.elements.endTitle.className = 'dialog-title win';
      this.elements.endIcon.textContent = '🌟';
      this.elements.endMessage.textContent = 'You navigated the treacherous darkness, kept your lantern lit, and safely emerged through the ancient Forest Gate.';
    } else {
      window.soundFX?.playDefeat();
      this.elements.endTitle.textContent = 'Lost in the Woods';
      this.elements.endTitle.className = 'dialog-title loss';
      this.elements.endIcon.textContent = reason === 'creature' ? '🐾' : '🕯️';
      if (reason === 'creature') {
        this.elements.endMessage.textContent = 'A roaming shadow stalker caught you in the darkness. Use groves to hide or save your lantern flare for emergencies.';
      } else {
        this.elements.endMessage.textContent = 'Your lantern flickered and died. Without light, the encroaching darkness swallowed the trail.';
      }
    }

    this.elements.endStats.innerHTML = `
      <div class="stat-card"><span class="stat-num">${this.player.steps}</span><span class="stat-lbl">Steps Taken</span></div>
      <div class="stat-card"><span class="stat-num">${this.firefliesCollected}</span><span class="stat-lbl">Fireflies Gathered</span></div>
      <div class="stat-card"><span class="stat-num">${this.shrinesActivated}</span><span class="stat-lbl">Shrines Awakened</span></div>
      <div class="stat-card"><span class="stat-num">${minutes}:${seconds}</span><span class="stat-lbl">Run Duration</span></div>
    `;

    this.elements.endDialog.showModal();
  }

  loop(timestamp) {
    if (!this.lastFrameTime) this.lastFrameTime = timestamp;
    const dt = Math.min(0.1, (timestamp - this.lastFrameTime) / 1000);
    this.lastFrameTime = timestamp;

    // Update smooth interpolations
    this.player.updateInterpolation(dt);
    for (const c of this.creatures) {
      c.updateInterpolation(dt);
    }
    this.particleSystem.update(dt, this.reduceMotion);

    // Render current frame
    this.renderer.render({
      forestMap: this.forestMap,
      player: this.player,
      creatures: this.creatures,
      particleSystem: this.particleSystem
    }, dt);

    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    this.renderer.resize();
    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new LanternRunGame();
  game.start();
  window.lanternGame = game;
});
