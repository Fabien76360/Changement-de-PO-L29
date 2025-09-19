
/*
 * SMED Helper — Vue opérateurs fluide, chrono discret et analyse efficace
 * Code vanilla JS, aucune dépendance externe. Tout est commenté pour faciliter la maintenance.
 */
(function () {
  const STORAGE_KEY = 'smedConfig_v4';
  const LEGACY_KEY = 'smedConfig_v3';
  const TIMER_TICK = 500;

  // --- Données de démonstration -------------------------------------------------
  const DEFAULT_CONFIG = {
    version: 'v4',
    operators: [
      { id: 'op1', name: 'Opérateur 1' },
      { id: 'op2', name: 'Opérateur 2' },
      { id: 'op3', name: 'Opérateur 3' }
    ],
    phases: [
      {
        id: 'prep',
        name: 'Préparation du changement',
        external: true,
        ops: [
          { id: 'prep_op1', label: 'Rassembler l’outillage dédié', operatorId: 'op1', targetMin: 5 },
          { id: 'prep_op2', label: 'Préparer les documents de gamme', operatorId: 'op2', targetMin: 4 },
          { id: 'prep_op3', label: 'Vérifier la disponibilité matières', operatorId: 'op3', targetMin: 6 }
        ]
      },
      {
        id: 'p1',
        name: 'Phase 1 — Arrêt ligne',
        ops: [
          { id: 'p1_op1', label: 'Informer l’équipe et sécuriser la zone', operatorId: 'op1', targetMin: 3 },
          { id: 'p1_op2', label: 'Vidanger les circuits actifs', operatorId: 'op2', targetMin: 6 },
          { id: 'p1_op3', label: 'Sortir les éléments usagés', operatorId: 'op3', targetMin: 5 },
          { id: 'p1_op4', label: 'Contrôler le blocage énergie', operatorId: 'op1', targetMin: 4 }
        ]
      },
      {
        id: 'p2',
        name: 'Phase 2 — Montage nouveau format',
        ops: [
          { id: 'p2_op1', label: 'Installer les outillages spécifiques', operatorId: 'op1', targetMin: 7 },
          { id: 'p2_op2', label: 'Positionner les réglages machine', operatorId: 'op2', targetMin: 8 },
          { id: 'p2_op3', label: 'Mettre en place les sécurités', operatorId: 'op3', targetMin: 5 },
          { id: 'p2_op4', label: 'Raccorder les alimentations', operatorId: 'op2', targetMin: 6 }
        ]
      },
      {
        id: 'p3',
        name: 'Phase 3 — Reprise de production',
        ops: [
          { id: 'p3_op1', label: 'Effectuer les contrôles qualité', operatorId: 'op1', targetMin: 6 },
          { id: 'p3_op2', label: 'Valider les essais production', operatorId: 'op2', targetMin: 5 },
          { id: 'p3_op3', label: 'Mettre à jour les documents de suivi', operatorId: 'op3', targetMin: 4 },
          { id: 'p3_op4', label: 'Communiquer la reprise à l’équipe', operatorId: 'op1', targetMin: 3 }
        ]
      }
    ]
  };

  const DEFAULT_SAMPLE_RESULTS = {
    generatedAt: new Date().toISOString(),
    results: {
      p1_op1: { actualMs: minutesToMs(3.2) },
      p1_op2: { actualMs: minutesToMs(6.6) },
      p1_op3: { actualMs: minutesToMs(5.5) },
      p1_op4: { actualMs: minutesToMs(3.8) },
      p2_op1: { actualMs: minutesToMs(7.5) },
      p2_op2: { actualMs: minutesToMs(9.1) },
      p2_op3: { actualMs: minutesToMs(4.3) },
      p2_op4: { actualMs: minutesToMs(6.2) },
      p3_op1: { actualMs: minutesToMs(6.4) },
      p3_op2: { actualMs: minutesToMs(5.6) },
      p3_op3: { actualMs: minutesToMs(4.5) },
      p3_op4: { actualMs: minutesToMs(3.1) }
    }
  };

  // --- État applicatif ----------------------------------------------------------
  const state = {
    config: clone(DEFAULT_CONFIG),
    lastRun: clone(DEFAULT_SAMPLE_RESULTS),
    sessionResults: {},
    prepStatus: {},
    run: {
      running: false,
      hasStarted: false,
      startedAt: null,
      elapsedMs: 0,
      timerHandle: null,
      perOperator: {}
    },
    analysisSort: { key: 'phase', direction: 'asc' }
  };

  // --- Raccourcis DOM -----------------------------------------------------------
  const timerDisplay = document.getElementById('timerDisplay');
  const timerStartPause = document.getElementById('timerStartPause');
  const timerReset = document.getElementById('timerReset');
  const tabButtons = Array.from(document.querySelectorAll('.tab'));
  const views = {
    operations: document.getElementById('view-operations'),
    settings: document.getElementById('view-settings'),
    analysis: document.getElementById('view-analysis')
  };
  const lanesContainer = document.getElementById('lanes');
  const objectivesContainer = document.getElementById('operationsSummary');
  const prepSection = document.getElementById('prepSection');
  const settingsPanel = document.getElementById('settingsPanel');
  const analysisFilterOperator = document.getElementById('analysisFilterOperator');
  const analysisFilterPhase = document.getElementById('analysisFilterPhase');
  const analysisRefreshBtn = document.getElementById('analysisRefresh');
  const analysisTable = document.getElementById('analysisTable');
  const analysisTop = document.getElementById('analysisTop');
  const exportCsvBtn = document.getElementById('exportCsv');
  const exportJsonBtn = document.getElementById('exportJson');

  // --- Initialisation -----------------------------------------------------------
  loadFromStorage();
  initPrepStatus();
  initPerOperatorState();
  renderTabs();
  renderOperationsView();
  renderSettings();
  populateAnalysisFilters();
  renderAnalysis();
  updateTimerDisplay();
  updateTimerControls();

  // --- Gestion du chrono -------------------------------------------------------
  timerStartPause.addEventListener('click', () => {
    if (state.run.running) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  timerReset.addEventListener('click', () => {
    if (!state.run.running && state.run.elapsedMs === 0 && !state.run.hasStarted) {
      return;
    }
    resetTimer();
    renderOperationsView();
  });

  function startTimer() {
    if (!state.run.hasStarted) {
      if (!isPreparationComplete()) {
        const proceed = window.confirm('Quelques actions externes restent à valider. Démarrer quand même ?');
        if (!proceed) {
          return;
        }
      }
      // Démarrage initial : réinitialise la session et lance la première étape
      state.sessionResults = {};
      initPerOperatorState();
      state.run.hasStarted = true;
    }
    state.run.running = true;
    state.run.startedAt = Date.now() - state.run.elapsedMs;
    if (state.run.timerHandle) {
      clearInterval(state.run.timerHandle);
    }
    state.run.timerHandle = setInterval(tick, TIMER_TICK);
    updateTimerControls();
    // S’assure que les étapes actives ont un point de départ temporel
    ensureStepStartTimes();
    renderOperationsView();
  }

  function pauseTimer() {
    if (!state.run.running) return;
    state.run.elapsedMs = Date.now() - state.run.startedAt;
    state.run.running = false;
    if (state.run.timerHandle) {
      clearInterval(state.run.timerHandle);
      state.run.timerHandle = null;
    }
    updateTimerControls();
  }

  function resetTimer() {
    pauseTimer();
    state.run.elapsedMs = 0;
    state.run.hasStarted = false;
    state.run.perOperator = {};
    state.sessionResults = {};
    initPrepStatus();
    updateTimerDisplay();
    updateTimerControls();
    renderOperationsView();
  }

  function tick() {
    if (!state.run.running) return;
    state.run.elapsedMs = Date.now() - state.run.startedAt;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = formatHMS(state.run.elapsedMs);
  }

  function updateTimerControls() {
    timerStartPause.textContent = state.run.running ? '⏸' : '▶';
    timerStartPause.setAttribute('aria-label', state.run.running ? 'Mettre en pause le chrono' : 'Démarrer le chrono');
  }

  function ensureStepStartTimes() {
    const perOperator = state.run.perOperator;
    state.config.operators.forEach(op => {
      const opState = perOperator[op.id] || { currentOpId: null, stepStartElapsed: null };
      if (!opState.currentOpId) {
        const first = getFirstPendingOperation(op.id);
        opState.currentOpId = first ? first.id : null;
        opState.stepStartElapsed = state.run.elapsedMs;
      } else if (typeof opState.stepStartElapsed !== 'number') {
        opState.stepStartElapsed = state.run.elapsedMs;
      }
      perOperator[op.id] = opState;
    });
  }

  // --- Vue opérations ----------------------------------------------------------
  function renderOperationsView() {
    renderObjectivesSummary();
    renderPreparation();
    renderLanes();
  }

  function renderObjectivesSummary() {
    const items = [];
    let globalTarget = 0;
    let globalActual = 0;
    let globalActualCount = 0;
    state.config.phases
      .filter(phase => !phase.external)
      .forEach(phase => {
        const target = phase.ops.reduce((acc, op) => acc + Number(op.targetMin || 0), 0);
        const actualData = phase.ops
          .map(op => state.sessionResults[op.id]?.actualMs)
          .filter(val => typeof val === 'number');
        const actual = actualData.reduce((acc, val) => acc + val, 0);
        items.push({
          name: phase.name,
          target,
          actual: actualData.length ? actual : null
        });
        globalTarget += target;
        if (actualData.length) {
          globalActual += actual;
          globalActualCount++;
        }
      });

    const hasActual = globalActualCount > 0;
    const html = items
      .map(item => {
        const targetText = `${formatMinutes(item.target)} objectif`;
        const actualText = item.actual != null ? `${formatMinutesMs(item.actual)} réalisé` : 'En attente';
        return `
          <article class="kpi">
            <span>${item.name}</span>
            <strong>${targetText}</strong>
            <div class="step__meta">${actualText}</div>
          </article>
        `;
      })
      .concat([
        `
        <article class="kpi">
          <span>Total global</span>
          <strong>${formatMinutes(globalTarget)} objectif</strong>
          <div class="step__meta">${hasActual ? `${formatMinutesMs(globalActual)} réalisé` : 'En attente'}</div>
        </article>
      `
      ])
      .join('');

    objectivesContainer.innerHTML = html;
  }

  function renderPreparation() {
    const phase = state.config.phases.find(p => p.external);
    if (!phase) {
      prepSection.innerHTML = '';
      return;
    }
    const total = phase.ops.length;
    const ready = phase.ops.filter(op => state.prepStatus[op.id]).length;
    const allReady = total === 0 || ready === total;
    const disabledStart = !allReady || state.run.running || state.run.hasStarted;
    const disablePrepActions = state.run.hasStarted;

    const items = phase.ops
      .map(op => {
        const isReady = !!state.prepStatus[op.id];
        const operatorName = getOperatorName(op.operatorId);
        return `
          <div class="prep-item" data-op="${op.id}">
            <div class="prep-item__info">
              <strong>${op.label}</strong>
              <div class="step__meta">
                <span>${operatorName}</span>
                <span>Objectif ${formatMinutes(op.targetMin)}</span>
              </div>
            </div>
            <div class="prep-item__actions">
              <span class="status-chip">${isReady ? 'Prête' : 'À préparer'}</span>
              <button type="button" class="btn secondary-btn prep-toggle" ${disablePrepActions ? 'disabled' : ''}>${isReady ? 'Annuler' : 'Marquer prête'}</button>
            </div>
          </div>
        `;
      })
      .join('');

    prepSection.innerHTML = `
      <h2>Préparation du changement</h2>
      <p>Validez tranquillement chaque action externe avant de lancer le chrono.</p>
      <div class="prep-list">${items}</div>
      <button type="button" class="btn" id="startChangeBtn" ${disabledStart ? 'disabled' : ''}>Démarrer le changement</button>
      <div class="step__meta">${ready}/${total} prêtes</div>
    `;
  }

  prepSection.addEventListener('click', event => {
    const toggleBtn = event.target.closest('.prep-toggle');
    if (toggleBtn && !state.run.hasStarted) {
      const opId = event.target.closest('.prep-item')?.dataset.op;
      if (!opId) return;
      state.prepStatus[opId] = !state.prepStatus[opId];
      renderPreparation();
      return;
    }
    if (event.target.id === 'startChangeBtn') {
      startTimer();
      renderPreparation();
    }
  });

  function renderLanes() {
    const html = state.config.operators.map(operator => renderLane(operator)).join('');
    lanesContainer.innerHTML = html;
  }

  function renderLane(operator) {
    const sequence = getInternalOperationsForOperator(operator.id);
    const total = sequence.length;
    const completed = sequence.filter(op => state.sessionResults[op.id]).length;
    const progressPercent = total === 0 ? 0 : Math.round((completed / total) * 100);
    const progressText = `${completed}/${total} étapes`;
    const opState = state.run.perOperator[operator.id];
    const activeOpId = opState?.currentOpId || getFirstPendingOperation(operator.id)?.id || null;

    const stepsHtml = sequence
      .map(op => {
        const opResult = state.sessionResults[op.id];
        const isDone = !!opResult;
        const isActive = !isDone && op.id === activeOpId;
        const phase = getPhaseById(op.phaseId);
        const actualText = isDone ? formatMinutesMs(opResult.actualMs) : '—';
        const deltaText = isDone ? formatDelta(opResult.actualMs, op.targetMin) : '';
        const button = isDone
          ? '<span class="status-chip">Terminé</span>'
          : `<button type="button" class="btn complete-step" data-op="${op.id}" ${isActive && state.run.hasStarted ? '' : 'disabled'}>${isActive ? 'Terminer l’étape' : 'En attente'}</button>`;
        const classes = ['step'];
        if (isActive) classes.push('step--active');
        if (isDone) classes.push('step--done');
        return `
          <article class="${classes.join(' ')}" data-op="${op.id}">
            <span class="step__phase">${phase?.name || 'Phase'}</span>
            <div class="step__title">${op.label}</div>
            <div class="step__meta">
              <span>Objectif ${formatMinutes(op.targetMin)}</span>
              <span>Réel ${actualText}</span>
              ${deltaText ? `<span>${deltaText}</span>` : ''}
            </div>
            <div class="step__actions">${button}</div>
          </article>
        `;
      })
      .join('');

    return `
      <section class="lane" data-operator="${operator.id}">
        <div class="lane-header">
          <h3>${operator.name}</h3>
          <span class="step__meta">${progressText}</span>
        </div>
        <div class="lane-progress" aria-hidden="true"><div class="lane-progress__bar" style="width:${progressPercent}%"></div></div>
        <div class="step-list">${stepsHtml || '<p>Aucune opération assignée.</p>'}</div>
      </section>
    `;
  }

  lanesContainer.addEventListener('click', event => {
    const btn = event.target.closest('.complete-step');
    if (!btn) return;
    const opId = btn.dataset.op;
    handleCompleteOperation(opId);
  });

  function handleCompleteOperation(opId) {
    const operation = findOperationById(opId);
    if (!operation) return;
    const operatorId = operation.operatorId;
    const opState = state.run.perOperator[operatorId];
    const elapsed = state.run.elapsedMs;
    const startElapsed = opState?.stepStartElapsed ?? elapsed;
    const durationMs = Math.max(0, elapsed - startElapsed);
    state.sessionResults[opId] = {
      actualMs: durationMs,
      completedAt: new Date().toISOString()
    };
    if (opState) {
      advanceOperator(operatorId);
    }
    renderOperationsView();
    renderAnalysis();
    checkRunCompletion();
  }

  function advanceOperator(operatorId) {
    const opState = state.run.perOperator[operatorId];
    if (!opState) return;
    const next = getFirstPendingOperation(operatorId);
    opState.currentOpId = next ? next.id : null;
    opState.stepStartElapsed = next ? state.run.elapsedMs : null;
  }

  function checkRunCompletion() {
    const allOps = getAllInternalOperations();
    const done = allOps.every(op => state.sessionResults[op.id]);
    if (done && allOps.length) {
      pauseTimer();
      state.lastRun = {
        generatedAt: new Date().toISOString(),
        results: clone(state.sessionResults)
      };
      saveToStorage();
      renderAnalysis();
    }
  }

  // --- Paramètres --------------------------------------------------------------
  function renderSettings() {
    settingsPanel.innerHTML = '';
    settingsPanel.appendChild(renderOperatorsCard());
    state.config.phases.forEach(phase => {
      const card = document.createElement('section');
      card.className = 'phase-card';
      card.dataset.phaseId = phase.id;
      const phaseTotal = phase.ops.reduce((acc, op) => acc + Number(op.targetMin || 0), 0);
      card.innerHTML = `
        <header>
          <h3>${phase.name}${phase.external ? ' (externe)' : ''}</h3>
          <span class="step__meta">Cible phase : ${formatMinutes(phaseTotal)}</span>
        </header>
        <div class="op-list">
          ${phase.ops.map((op, index) => renderOperationRow(phase, op, index)).join('') || '<p>Aucune opération pour le moment.</p>'}
        </div>
        <button type="button" class="btn secondary-btn add-op" data-phase="${phase.id}" ${phase.external && state.run.hasStarted ? 'disabled' : ''}>Ajouter une opération</button>
      `;
      settingsPanel.appendChild(card);
    });
    const globalTotal = state.config.phases.filter(p => !p.external).reduce((acc, phase) => acc + phase.ops.reduce((pAcc, op) => pAcc + Number(op.targetMin || 0), 0), 0);
    const totals = document.createElement('div');
    totals.className = 'totals';
    totals.textContent = `Total global objectif : ${formatMinutes(globalTotal)}`;
    settingsPanel.appendChild(totals);
  }

  function renderOperatorsCard() {
    const card = document.createElement('section');
    card.className = 'phase-card';
    card.innerHTML = `
      <header>
        <h3>Équipe opérateurs</h3>
        <span class="step__meta">Ajustez les noms (jusqu’à 4 opérateurs).</span>
      </header>
      <div class="op-list">
        ${state.config.operators
          .map(op => `
            <div class="op-row op-row--operator" data-operator="${op.id}">
              <input type="text" class="operator-name" value="${op.name}" aria-label="Nom opérateur" />
              <div class="op-row-actions">
                <button type="button" class="btn secondary-btn remove-operator" ${state.config.operators.length <= 1 ? 'disabled' : ''}>Supprimer</button>
              </div>
            </div>
          `)
          .join('')}
      </div>
      <button type="button" class="btn secondary-btn" id="addOperator" ${state.config.operators.length >= 4 ? 'disabled' : ''}>Ajouter un opérateur</button>
    `;
    return card;
  }

  function renderOperationRow(phase, op, index) {
    const operatorOptions = state.config.operators
      .map(operator => `<option value="${operator.id}" ${operator.id === op.operatorId ? 'selected' : ''}>${operator.name}</option>`)
      .join('');
    return `
      <div class="op-row" data-op="${op.id}" data-index="${index}">
        <input type="text" class="op-label" value="${op.label}" aria-label="Libellé de l’opération" />
        <select class="op-operator" aria-label="Opérateur assigné">${operatorOptions}</select>
        <input type="number" class="op-target" min="0" step="0.1" value="${Number(op.targetMin || 0)}" aria-label="Temps cible (min)" />
        <div class="op-row-actions">
          <button type="button" class="btn secondary-btn move-up">↑</button>
          <button type="button" class="btn secondary-btn move-down">↓</button>
          <button type="button" class="btn secondary-btn delete-op">Supprimer</button>
        </div>
      </div>
    `;
  }

  settingsPanel.addEventListener('input', event => {
    const operatorRow = event.target.closest('.op-row--operator');
    if (operatorRow) {
      const operatorId = operatorRow.dataset.operator;
      const operator = state.config.operators.find(op => op.id === operatorId);
      if (operator) {
        operator.name = event.target.value || operator.name;
        renderOperationsView();
        renderSettings();
        populateAnalysisFilters();
        renderAnalysis();
        saveToStorage();
      }
      return;
    }

    const row = event.target.closest('.op-row');
    if (!row) return;
    const phaseId = row.closest('.phase-card')?.dataset.phaseId;
    const opId = row.dataset.op;
    const phase = getPhaseById(phaseId);
    if (!phase) return;
    const operation = phase.ops.find(op => op.id === opId);
    if (!operation) return;

    if (event.target.classList.contains('op-label')) {
      operation.label = event.target.value;
    } else if (event.target.classList.contains('op-target')) {
      operation.targetMin = Number(event.target.value || 0);
    } else if (event.target.classList.contains('op-operator')) {
      operation.operatorId = event.target.value;
    }

    renderOperationsView();
    renderSettings();
    populateAnalysisFilters();
    renderAnalysis();
    saveToStorage();
  });

  settingsPanel.addEventListener('click', event => {
    const addOperatorBtn = event.target.closest('#addOperator');
    if (addOperatorBtn) {
      addOperator();
      return;
    }
    const removeOperatorBtn = event.target.closest('.remove-operator');
    if (removeOperatorBtn) {
      const row = removeOperatorBtn.closest('.op-row--operator');
      const operatorId = row?.dataset.operator;
      if (operatorId) {
        removeOperator(operatorId);
      }
      return;
    }

    const card = event.target.closest('.phase-card');
    if (!card) return;
    const phaseId = card.dataset.phaseId;
    const phase = getPhaseById(phaseId);
    if (!phase) return;

    if (event.target.classList.contains('add-op')) {
      addOperation(phaseId);
      return;
    }

    const row = event.target.closest('.op-row');
    if (!row) return;
    const opId = row.dataset.op;
    const index = Number(row.dataset.index);

    if (event.target.classList.contains('delete-op')) {
      phase.ops = phase.ops.filter(op => op.id !== opId);
      state.sessionResults = stripResults(state.sessionResults, opId);
      state.lastRun.results = stripResults(state.lastRun.results || {}, opId);
      if (phase.external) {
        delete state.prepStatus[opId];
      }
      renderAll();
      saveToStorage();
      return;
    }

    if (event.target.classList.contains('move-up')) {
      moveOperation(phase, index, Math.max(0, index - 1));
      return;
    }

    if (event.target.classList.contains('move-down')) {
      moveOperation(phase, index, Math.min(phase.ops.length - 1, index + 1));
      return;
    }
  });

  function addOperator() {
    if (state.config.operators.length >= 4) return;
    const id = generateId('op');
    state.config.operators.push({ id, name: `Opérateur ${state.config.operators.length + 1}` });
    initPerOperatorState();
    renderAll();
    saveToStorage();
  }

  function removeOperator(operatorId) {
    if (state.config.operators.length <= 1) return;
    state.config.operators = state.config.operators.filter(op => op.id !== operatorId);
    const fallback = state.config.operators[0];
    state.config.phases.forEach(phase => {
      phase.ops.forEach(op => {
        if (op.operatorId === operatorId) {
          op.operatorId = fallback.id;
        }
      });
    });
    initPerOperatorState();
    renderAll();
    saveToStorage();
  }

  function addOperation(phaseId) {
    const phase = getPhaseById(phaseId);
    if (!phase) return;
    const id = generateId('op');
    const defaultOperator = state.config.operators[0]?.id || 'op1';
    phase.ops.push({ id, label: 'Nouvelle opération', operatorId: defaultOperator, targetMin: 1 });
    if (phase.external) {
      state.prepStatus[id] = false;
    }
    renderAll();
    saveToStorage();
  }

  function moveOperation(phase, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [item] = phase.ops.splice(fromIndex, 1);
    phase.ops.splice(toIndex, 0, item);
    renderAll();
    saveToStorage();
  }

  function stripResults(results, removedId) {
    const newResults = {};
    Object.keys(results || {}).forEach(id => {
      if (id !== removedId) {
        newResults[id] = results[id];
      }
    });
    return newResults;
  }

  function renderAll() {
    renderSettings();
    renderOperationsView();
    populateAnalysisFilters();
    renderAnalysis();
  }

  // --- Analyse -----------------------------------------------------------------
  analysisFilterOperator.addEventListener('change', renderAnalysis);
  analysisFilterPhase.addEventListener('change', renderAnalysis);
  analysisRefreshBtn.addEventListener('click', renderAnalysis);

  Array.from(analysisTable.querySelectorAll('th')).forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (state.analysisSort.key === key) {
        state.analysisSort.direction = state.analysisSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.analysisSort.key = key;
        state.analysisSort.direction = 'asc';
      }
      renderAnalysis();
    });
  });

  function populateAnalysisFilters() {
    const operatorValue = analysisFilterOperator.value;
    const phaseValue = analysisFilterPhase.value;

    analysisFilterOperator.innerHTML = ['<option value="all">Tous</option>']
      .concat(state.config.operators.map(op => `<option value="${op.id}">${op.name}</option>`))
      .join('');
    setSelectValue(analysisFilterOperator, operatorValue, 'all');

    analysisFilterPhase.innerHTML = ['<option value="all">Toutes</option>']
      .concat(state.config.phases.filter(p => !p.external).map(phase => `<option value="${phase.id}">${phase.name}</option>`))
      .join('');
    setSelectValue(analysisFilterPhase, phaseValue, 'all');
  }

  function renderAnalysis() {
    const dataset = buildAnalysisDataset();
    renderTopDelays(dataset.operations);
    renderAnalysisTable(dataset);
  }

  function buildAnalysisDataset() {
    const operatorFilter = analysisFilterOperator.value || 'all';
    const phaseFilter = analysisFilterPhase.value || 'all';
    const operations = [];

    state.config.phases
      .filter(phase => !phase.external)
      .forEach(phase => {
        phase.ops.forEach(op => {
          if (operatorFilter !== 'all' && op.operatorId !== operatorFilter) return;
          if (phaseFilter !== 'all' && phase.id !== phaseFilter) return;
          const result = state.sessionResults[op.id] || state.lastRun.results?.[op.id] || null;
          operations.push({
            id: op.id,
            label: op.label,
            operatorId: op.operatorId,
            operatorName: getOperatorName(op.operatorId),
            phaseId: phase.id,
            phaseName: phase.name,
            targetMin: Number(op.targetMin || 0),
            actualMs: result?.actualMs ?? null
          });
        });
      });

    const sortKey = state.analysisSort.key;
    const direction = state.analysisSort.direction === 'asc' ? 1 : -1;
    const collator = new Intl.Collator('fr');

    operations.sort((a, b) => {
      switch (sortKey) {
        case 'label':
          return collator.compare(a.label, b.label) * direction;
        case 'operator':
          return collator.compare(a.operatorName, b.operatorName) * direction;
        case 'target':
          return (a.targetMin - b.targetMin) * direction;
        case 'actual':
          return ((a.actualMs ?? Infinity) - (b.actualMs ?? Infinity)) * direction;
        case 'delta':
          return (computeDeltaMs(a) - computeDeltaMs(b)) * direction;
        case 'achievement':
          return (computeAchievement(a) - computeAchievement(b)) * direction;
        default:
          return collator.compare(a.phaseName, b.phaseName) * direction;
      }
    });

    const phases = aggregateByPhase(operations);
    const global = aggregateGlobal(operations);

    return { operations, phases, global };
  }

  function renderTopDelays(operations) {
    const delays = operations
      .map(item => {
        const deltaMin = msToMinutes(computeDeltaMs(item));
        return { ...item, deltaMin };
      })
      .filter(item => item.actualMs != null && item.deltaMin > 0)
      .sort((a, b) => b.deltaMin - a.deltaMin)
      .slice(0, 3);

    if (!delays.length) {
      analysisTop.innerHTML = '<p>Aucun retard significatif — bravo !</p>';
      return;
    }

    const list = delays
      .map((item, index) => `<li>${index + 1}. ${item.phaseName} · ${item.label} (+${item.deltaMin.toFixed(1)} min)</li>`)
      .join('');
    analysisTop.innerHTML = `<h3>Top 3 retards à analyser</h3><ul>${list}</ul>`;
  }

  function renderAnalysisTable(dataset) {
    const tbody = analysisTable.querySelector('tbody');
    const tfoot = analysisTable.querySelector('tfoot');
    const maxDelta = Math.max(1, ...dataset.operations.map(item => Math.abs(msToMinutes(computeDeltaMs(item))) || 0));

    tbody.innerHTML = dataset.operations
      .map(item => {
        const actualMin = item.actualMs != null ? msToMinutes(item.actualMs) : null;
        const deltaMin = item.actualMs != null ? msToMinutes(computeDeltaMs(item)) : null;
        const achievement = item.actualMs != null ? computeAchievement(item) : null;
        return `
          <tr>
            <td>${item.label}</td>
            <td>${item.phaseName}</td>
            <td>${item.operatorName}</td>
            <td>${item.targetMin.toFixed(1)}</td>
            <td>${actualMin != null ? actualMin.toFixed(1) : '—'}</td>
            <td>${renderDeltaCell(deltaMin, maxDelta)}</td>
            <td>${achievement != null ? `${achievement.toFixed(0)} %` : '—'}</td>
          </tr>
        `;
      })
      .join('');

    const phaseRows = dataset.phases
      .map(phase => {
        const delta = phase.actualMin != null ? phase.actualMin - phase.targetMin : null;
        return `
          <tr class="row-phase">
            <td>${phase.name}</td>
            <td>${phase.name}</td>
            <td>${phase.operatorName || '—'}</td>
            <td>${phase.targetMin.toFixed(1)}</td>
            <td>${phase.actualMin != null ? phase.actualMin.toFixed(1) : '—'}</td>
            <td>${delta != null ? renderDeltaCell(delta, maxDelta) : renderDeltaCell(null, maxDelta)}</td>
            <td>${phase.achievement != null ? `${phase.achievement.toFixed(0)} %` : '—'}</td>
          </tr>
        `;
      })
      .join('');

    const globalDelta = dataset.global.actualMin != null ? dataset.global.actualMin - dataset.global.targetMin : null;
    const globalRow = `
      <tr class="row-global">
        <td>Total global</td>
        <td>—</td>
        <td>—</td>
        <td>${dataset.global.targetMin.toFixed(1)}</td>
        <td>${dataset.global.actualMin != null ? dataset.global.actualMin.toFixed(1) : '—'}</td>
        <td>${renderDeltaCell(globalDelta, maxDelta)}</td>
        <td>${dataset.global.achievement != null ? `${dataset.global.achievement.toFixed(0)} %` : '—'}</td>
      </tr>
    `;

    tfoot.innerHTML = phaseRows + globalRow;
  }

  function renderDeltaCell(deltaMin, maxDelta) {
    if (deltaMin == null || isNaN(deltaMin)) {
      return '—';
    }
    const clamped = Math.min(Math.abs(deltaMin) / maxDelta, 1);
    const width = (clamped * 50).toFixed(1);
    const directionClass = deltaMin >= 0 ? 'bar-ecart__fill--positive' : 'bar-ecart__fill--negative';
    const label = `${deltaMin >= 0 ? '+' : ''}${deltaMin.toFixed(1)}`;
    return `
      <div>
        <div>${label}</div>
        <div class="bar-ecart">
          <div class="bar-ecart__fill ${directionClass}" style="width:${width}%"></div>
        </div>
      </div>
    `;
  }

  exportCsvBtn.addEventListener('click', () => {
    const dataset = buildAnalysisDataset();
    const rows = [['Phase', 'Opérateur', 'Opération', 'Objectif (min)', 'Réel (min)', 'Écart (min)', '% Atteinte']];
    dataset.operations.forEach(item => {
      const actualMin = item.actualMs != null ? msToMinutes(item.actualMs).toFixed(1) : '';
      const deltaMin = item.actualMs != null ? msToMinutes(computeDeltaMs(item)).toFixed(1) : '';
      const achievement = item.actualMs != null ? `${computeAchievement(item).toFixed(0)}` : '';
      rows.push([
        item.phaseName,
        item.operatorName,
        item.label,
        item.targetMin.toFixed(1),
        actualMin,
        deltaMin,
        achievement
      ]);
    });
    const csv = rows.map(cols => cols.map(s => """ + s.replace(/"/g, '""') + """).join(';')).join('
');
    downloadFile(csv, 'text/csv', `analyse_smed_${timestamp()}.csv`);
  });

  exportJsonBtn.addEventListener('click', () => {
    const dataset = buildAnalysisDataset();
    const rows = dataset.operations.map(item => {
      const actualMin = item.actualMs != null ? msToMinutes(item.actualMs) : null;
      const deltaMin = item.actualMs != null ? msToMinutes(computeDeltaMs(item)) : null;
      const achievement = item.actualMs != null ? computeAchievement(item) : null;
      return {
        id: item.id,
        phaseId: item.phaseId,
        phaseName: item.phaseName,
        operatorId: item.operatorId,
        operatorName: item.operatorName,
        label: item.label,
        targetMin: item.targetMin,
        actualMin,
        deltaMin,
        achievement
      };
    });
    downloadFile(JSON.stringify(rows, null, 2), 'application/json', `analyse_smed_${timestamp()}.json`);
  });

  function aggregateByPhase(operations) {
    const phasesMap = {};
    operations.forEach(item => {
      const key = item.phaseId;
      if (!phasesMap[key]) {
        phasesMap[key] = {
          id: item.phaseId,
          name: item.phaseName,
          targetMin: 0,
          actualMin: 0,
          actualCount: 0
        };
      }
      phasesMap[key].targetMin += item.targetMin;
      if (item.actualMs != null) {
        phasesMap[key].actualMin += msToMinutes(item.actualMs);
        phasesMap[key].actualCount += 1;
      }
    });
    return Object.values(phasesMap).map(phase => {
      const achievement = phase.actualCount
        ? Math.max(0, Math.min(200, (phase.targetMin / Math.max(phase.actualMin, 0.01)) * 100))
        : null;
      return {
        id: phase.id,
        name: phase.name,
        targetMin: phase.targetMin,
        actualMin: phase.actualCount ? phase.actualMin : null,
        achievement
      };
    });
  }

  function aggregateGlobal(operations) {
    const target = operations.reduce((acc, item) => acc + item.targetMin, 0);
    const actualValues = operations.filter(item => item.actualMs != null);
    const actual = actualValues.reduce((acc, item) => acc + msToMinutes(item.actualMs), 0);
    const achievement = actualValues.length ? Math.max(0, Math.min(200, (target / Math.max(actual, 0.01)) * 100)) : null;
    return {
      targetMin: target,
      actualMin: actualValues.length ? actual : null,
      achievement
    };
  }

  // --- Onglets ------------------------------------------------------------------
  function renderTabs() {
    tabButtons.forEach(btn => {
      const isActive = btn.classList.contains('tab--active');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        tabButtons.forEach(b => {
          const isActive = b === btn;
          b.classList.toggle('tab--active', isActive);
          b.setAttribute('aria-selected', isActive ? 'true' : 'false');
          b.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        Object.keys(views).forEach(key => {
          views[key].classList.toggle('view--active', key === tab);
        });
        if (tab === 'analysis') {
          renderAnalysis();
        }
      });
    });
  }

  // --- Persistance --------------------------------------------------------------
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.config) {
          state.config = normalizeConfig(parsed.config);
          state.lastRun = parsed.lastRun ? { ...DEFAULT_SAMPLE_RESULTS, ...parsed.lastRun } : clone(DEFAULT_SAMPLE_RESULTS);
          return;
        }
      }
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const migrated = migrateLegacy(JSON.parse(legacyRaw));
        state.config = normalizeConfig(migrated.config);
        state.lastRun = migrated.lastRun || clone(DEFAULT_SAMPLE_RESULTS);
        saveToStorage();
        return;
      }
    } catch (error) {
      console.warn('Impossible de charger la configuration, utilisation des valeurs par défaut.', error);
    }
    state.config = clone(DEFAULT_CONFIG);
    state.lastRun = clone(DEFAULT_SAMPLE_RESULTS);
  }

  function saveToStorage() {
    const payload = {
      version: 'v4',
      config: state.config,
      lastRun: state.lastRun
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Sauvegarde impossible', error);
    }
  }

  function migrateLegacy(oldData) {
    if (!oldData) {
      return { config: clone(DEFAULT_CONFIG), lastRun: clone(DEFAULT_SAMPLE_RESULTS) };
    }
    const operators = Array.isArray(oldData.operators)
      ? oldData.operators.map((name, index) => ({ id: `op${index + 1}`, name }))
      : clone(DEFAULT_CONFIG.operators);
    const phases = Array.isArray(oldData.phases)
      ? oldData.phases.map((phase, idx) => ({
          id: phase.id || `phase_${idx + 1}`,
          name: phase.name || `Phase ${idx + 1}`,
          external: !!phase.external,
          ops: Array.isArray(phase.ops)
            ? phase.ops.map((op, opIndex) => ({
                id: op.id || generateId('op'),
                label: op.label || `Opération ${opIndex + 1}`,
                operatorId: operators[op.operatorIndex || 0]?.id || 'op1',
                targetMin: Number(op.targetMin || 1)
              }))
            : []
        }))
      : clone(DEFAULT_CONFIG.phases);
    return { config: { version: 'v4', operators, phases }, lastRun: oldData.lastRun || clone(DEFAULT_SAMPLE_RESULTS) };
  }

  function normalizeConfig(config) {
    const normalized = clone(config);
    normalized.operators = (config.operators || clone(DEFAULT_CONFIG.operators)).map((op, index) => ({
      id: op.id || `op${index + 1}`,
      name: op.name || `Opérateur ${index + 1}`
    }));
    normalized.phases = (config.phases || clone(DEFAULT_CONFIG.phases)).map((phase, index) => ({
      id: phase.id || `phase_${index + 1}`,
      name: phase.name || `Phase ${index + 1}`,
      external: !!phase.external,
      ops: (phase.ops || []).map((op, opIndex) => ({
        id: op.id || generateId('op'),
        label: op.label || `Opération ${opIndex + 1}`,
        operatorId: normalized.operators.find(operator => operator.id === op.operatorId)?.id || normalized.operators[0]?.id || 'op1',
        targetMin: Number(op.targetMin || 0)
      }))
    }));
    return normalized;
  }

  // --- Helpers -----------------------------------------------------------------
  function initPrepStatus() {
    const prepPhase = state.config.phases.find(phase => phase.external);
    state.prepStatus = {};
    if (prepPhase) {
      prepPhase.ops.forEach(op => {
        state.prepStatus[op.id] = false;
      });
    }
  }

  function isPreparationComplete() {
    const prepPhase = state.config.phases.find(phase => phase.external);
    if (!prepPhase) return true;
    return prepPhase.ops.every(op => state.prepStatus[op.id]);
  }

  function initPerOperatorState() {
    state.run.perOperator = {};
    state.config.operators.forEach(op => {
      state.run.perOperator[op.id] = { currentOpId: null, stepStartElapsed: null };
    });
  }

  function getOperatorName(operatorId) {
    return state.config.operators.find(op => op.id === operatorId)?.name || 'Opérateur';
  }

  function getPhaseById(phaseId) {
    return state.config.phases.find(phase => phase.id === phaseId);
  }

  function getInternalOperationsForOperator(operatorId) {
    const operations = [];
    state.config.phases
      .filter(phase => !phase.external)
      .forEach(phase => {
        phase.ops.forEach(op => {
          if (op.operatorId === operatorId) {
            operations.push({ ...op, phaseId: phase.id });
          }
        });
      });
    return operations;
  }

  function getAllInternalOperations() {
    const ops = [];
    state.config.phases
      .filter(phase => !phase.external)
      .forEach(phase => {
        phase.ops.forEach(op => {
          ops.push({ ...op, phaseId: phase.id });
        });
      });
    return ops;
  }

  function getFirstPendingOperation(operatorId) {
    return getInternalOperationsForOperator(operatorId).find(op => !state.sessionResults[op.id]);
  }

  function findOperationById(opId) {
    for (const phase of state.config.phases) {
      for (const op of phase.ops) {
        if (op.id === opId) {
          return { ...op, phaseId: phase.id };
        }
      }
    }
    return null;
  }

  function computeDeltaMs(item) {
    if (item.actualMs == null) return 0;
    return item.actualMs - minutesToMs(item.targetMin);
  }

  function computeAchievement(item) {
    if (item.actualMs == null) return 0;
    const targetMs = minutesToMs(item.targetMin);
    if (targetMs === 0) return 100;
    return Math.max(0, Math.min(200, (targetMs / Math.max(item.actualMs, 1)) * 100));
  }

  function formatHMS(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map(unit => String(unit).padStart(2, '0'))
      .join(':');
  }

  function formatMinutes(value) {
    return `${Number(value || 0).toFixed(1)} min`;
  }

  function formatMinutesMs(ms) {
    return `${msToMinutes(ms).toFixed(1)} min`;
  }

  function formatDelta(actualMs, targetMin) {
    const delta = msToMinutes(actualMs) - Number(targetMin || 0);
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)} min`;
  }

  function minutesToMs(minutes) {
    return Number(minutes || 0) * 60 * 1000;
  }

  function msToMinutes(ms) {
    return Number(ms || 0) / 60000;
  }

  function generateId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function setSelectValue(select, value, fallback) {
    const options = Array.from(select.options || []);
    const exists = options.some(option => option.value === value);
    select.value = exists ? value : fallback;
  }

  function timestamp() {
    return new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
  }

  function downloadFile(content, mimeType, filename) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // --- Tests manuels (à exécuter dans le navigateur) ---------------------------
  /*
    Tests conseillés :
    - Chrono : cliquer sur ▶ puis ⏸ et ⟲, vérifier l’affichage HH:MM:SS et la persistance du badge.
    - Passage d’étapes : lancer le changement, terminer plusieurs opérations par opérateur et observer le surlignage et la progression.
    - Totaux objectifs : modifier les temps cibles dans Paramètres et vérifier la mise à jour dans la vue Gamme et l’analyse.
    - Top 3 retards : simuler des durées plus longues, vérifier l’ordre et la mise à jour des barres d’écart.
    - Exports : générer les fichiers CSV et JSON depuis l’onglet Analyse.
    - Migration : importer un objet localStorage "smedConfig_v3" simple et recharger pour vérifier la conversion automatique.
  */
})();
