#!/usr/bin/env node
/**
 * Auto-resume harness for autonomous phase execution.
 *
 * Operates at phase level: each agent session handles one complete phase.
 * Claude owns the task loop within a session; the harness manages:
 *   - Usage-window scheduling (10 PM – 7 AM)
 *   - Rate-limit detection + resume
 *   - Phase-boundary detection via BUILD-TODO.md parsing
 *   - Reflection injection at phase end and on resume after rate limit
 *   - Autonomous-blocker detection (only manual verification remains)
 *   - Discord notification when human input is required
 *   - State persistence for crash recovery
 *
 * External controls:
 *   touch .autocode/SUSPEND    # pause after current session ends
 *   rm   .autocode/SUSPEND     # resume
 *
 * Logs:
 *   Stdout (real-time) + ./log/harness-YYYY-MM-DD.log (persistent)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// External dependencies (mocked in tests via jest.mock())
// ---------------------------------------------------------------------------

let RateLimitError = class RateLimitError extends Error {
  constructor(...args) {
    super(...args);
    this.name = 'RateLimitError';
  }
};

try { ({ RateLimitError } = require('@anthropic-ai/sdk')); } catch (_) { /* use fallback */ }

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TODO_PATH = path.join('doc', 'BUILD-TODO.md');
const STATE_PATH = path.join('.autocode', 'state', 'harness.json');
const SUSPEND_PATH = path.join('.autocode', 'SUSPEND');
const SECRETS_DIR = 'secrets';
const LOG_DIR = 'log';

// Hours (local) during which execution is allowed: 10 PM – 7 AM
const ALLOWED_HOURS = new Set([21, 22, 23, 0, 1, 2, 3, 4, 5, 6]);
//FIXME: added 21 because the container timezone is PDT instead of CDT - need to set local TZ in devcontainer.json

// ---------------------------------------------------------------------------
// Failsafe constants — prevent runaway API usage
// ---------------------------------------------------------------------------

// Circuit breaker: halt after this many consecutive sessions with no clean terminal signal.
const MAX_CONSECUTIVE_FAILURES = 3;

// Minimum wall-clock seconds between end of one session and start of next.
const MIN_SESSION_GAP_SECS = 30;

// Hard ceiling on total agent sessions (including reflection passes) per harness invocation.
const MAX_SESSIONS_PER_RUN = 99;

// Sessions that complete faster than this are flagged as suspect.
const MIN_HEALTHY_SESSION_SECS = 10;

// Exponential backoff on consecutive unexpected session ends.
// Wait = min(BACKOFF_BASE * 2^(n-1), BACKOFF_MAX)
const BACKOFF_BASE_SECS = 60;
const BACKOFF_MAX_SECS = 600; // 10 minutes

// Markers that identify a task as requiring human/external action.
const MANUAL_MARKERS = [
  'Manual test',
  'manual test',
  'real Discord',
  'real SerpApi',
  'real API',
  'real credentials',
  'real search profile',
  'manual integration test',
  'done by user',
];

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

// Module-level logger — no handlers until _setupLogging() is called.
// This keeps test imports silent (no file creation, no stdout noise).
const log = {
  _handlers: [],

  _format(level, msg, ...args) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let i = 0;
    const formatted = String(msg).replace(/%(?:\.\d+)?[sdof]/g, () => {
      const arg = args[i++];
      return arg !== undefined ? arg : '';
    });
    return `${ts}  ${level.padEnd(8)}  ${formatted}`;
  },

  _write(level, msg, ...args) {
    if (this._handlers.length === 0) return;
    const line = this._format(level, msg, ...args);
    for (const h of this._handlers) h(line);
  },

  debug(msg, ...args) { this._write('DEBUG', msg, ...args); },
  info(msg, ...args) { this._write('INFO', msg, ...args); },
  warning(msg, ...args) { this._write('WARNING', msg, ...args); },
  error(msg, ...args) { this._write('ERROR', msg, ...args); },
};

function _setupLogging() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `harness-${new Date().toISOString().slice(0, 10)}.log`);
  const stream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf-8' });
  log._handlers.push(line => stream.write(line + '\n'));
  log._handlers.push(line => process.stdout.write(line + '\n'));
  log.info('Logging to %s', logFile);
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function loadState(statePath = STATE_PATH) {
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    log.debug('Loaded state: %s', JSON.stringify(state));
    return state;
  }
  log.debug('No state file found, starting fresh');
  return { session_id: null, current_phase: null };
}

function saveState(state, statePath = STATE_PATH) {
  fs.mkdirSync(path.dirname(path.resolve(statePath)), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  log.debug('State saved: %s', JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// BUILD-TODO.md parsing
// ---------------------------------------------------------------------------

const PHASE_RE = /^## Phase (\d+)/;
const TASK_RE = /^\s*- (\[[~ox -]\])\s+(.*)/;
const VERIFY_RE = /\*\*Verify:\*\*\s*(.*)/i;

function _parsePhases(content) {
  const phases = [];
  let current = null;

  for (const line of content.split('\n')) {
    const phaseMatch = PHASE_RE.exec(line);
    if (phaseMatch) {
      if (current) phases.push(current);
      current = {
        header: line.replace(/^#+\s*/, '').trim(),
        number: phaseMatch[1],
        tasks: [],
      };
      continue;
    }

    if (current === null) continue;

    const taskMatch = TASK_RE.exec(line);
    if (taskMatch) {
      const status = taskMatch[1];
      const desc = taskMatch[2];
      const verifyMatch = VERIFY_RE.exec(desc);
      const verifyText = verifyMatch ? verifyMatch[1] : '';
      const isManual = MANUAL_MARKERS.some(m => verifyText.toLowerCase().includes(m.toLowerCase()));
      current.tasks.push({
        raw: line,
        status,
        description: desc,
        verify_text: verifyText,
        is_manual: isManual,
      });
    }
  }

  if (current) phases.push(current);
  return phases;
}

function getNextPhase(todoPath = TODO_PATH) {
  const content = fs.readFileSync(todoPath, 'utf-8');
  const phases = _parsePhases(content);

  for (const phase of phases) {
    const incomplete = phase.tasks.filter(t => t.status === '[ ]');
    if (incomplete.length === 0) continue;
    const autonomous = incomplete.filter(t => !t.is_manual);
    if (autonomous.length > 0) {
      log.debug('Phase %s has %d autonomous task(s) remaining', phase.number, autonomous.length);
      return phase;
    }
  }
  return null;
}

function phaseIsBlocked(phase) {
  const remaining = phase.tasks.filter(t => t.status === '[ ]');
  return remaining.length > 0 && remaining.every(t => t.is_manual);
}

function detectStateAfterSession(phase, todoPath = TODO_PATH) {
  const content = fs.readFileSync(todoPath, 'utf-8');
  const phases = _parsePhases(content);
  const updated = phases.find(p => p.number === phase.number);

  if (!updated) {
    log.info('Phase %s no longer found in BUILD-TODO.md — treating as complete', phase.number);
    return 'phase_complete';
  }

  const remaining = updated.tasks.filter(t => t.status === '[ ]');
  let result;
  if (remaining.length === 0) {
    result = 'phase_complete';
  } else if (remaining.every(t => t.is_manual)) {
    result = 'blocked';
    log.info(
      'Phase %s: %d manual-only task(s) remain (deferred): %s',
      phase.number,
      remaining.length,
      JSON.stringify(remaining.map(t => t.description.slice(0, 60))),
    );
  } else {
    result = 'interrupted';
    const autonomousLeft = remaining.filter(t => !t.is_manual);
    log.info(
      'Phase %s: %d autonomous task(s) still incomplete: %s',
      phase.number,
      autonomousLeft.length,
      JSON.stringify(autonomousLeft.map(t => t.description.slice(0, 60))),
    );
  }

  log.info('Post-session state for phase %s: %s', phase.number, result);
  return result;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function isAllowedHour() {
  return ALLOWED_HOURS.has(new Date().getHours());
}

function isSuspended(suspendPath = SUSPEND_PATH) {
  return fs.existsSync(suspendPath);
}

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function waitUntil(resetAt, _sleep = sleep) {
  const now = new Date();
  const waitSeconds = Math.max(0, (resetAt.getTime() - now.getTime()) / 1000) + 10;
  log.info(
    'Rate limit: sleeping %.0fs until %s',
    Math.round(waitSeconds),
    resetAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
  );
  await _sleep(waitSeconds);
}

// ---------------------------------------------------------------------------
// Discord notifications
// ---------------------------------------------------------------------------

async function notifyDiscord(message, secretsDir = SECRETS_DIR) {
  const webhookPath = path.join(secretsDir, 'discord_webhook_url');
  if (!fs.existsSync(webhookPath)) {
    log.debug('Discord notify skipped (no webhook secret): %s', message);
    return;
  }
  const webhookUrl = fs.readFileSync(webhookPath, 'utf-8').trim();
  if (!webhookUrl) {
    log.debug('Discord notify skipped (empty webhook url)');
    return;
  }
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `[autocode harness] ${message}` }),
    });
    log.info('Discord notified: %s', message);
  } catch (exc) {
    log.warning('Discord notify failed: %s', exc);
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const AUTONOMOUS_PREAMBLE = `\
You are running in fully autonomous mode. Rules:
- Follow the TDD cycle in CLAUDE.md for every task.
- Skip manual verification steps — rely on unit/integration test coverage instead.
  Mark tasks that require only manual verification as [-] with reason "deferred: requires manual verification".
- Do NOT pause and ask the user for input.
- Commit TASKLOG + BUILD-TODO.md atomically with the implementation (single commit per task cycle).
- When all autonomous tasks in the current phase are done, output exactly this line so the harness can detect completion:
  PHASE_COMPLETE
- If you encounter a task that cannot proceed without external information not available in the codebase, output:
  BLOCKED: <one-line reason>`;

function buildPhasePrompt(phase, isResume) {
  const phaseHeader = phase.header;
  if (isResume) {
    return `${AUTONOMOUS_PREAMBLE}

You are RESUMING execution of: ${phaseHeader}

Check doc/BUILD-TODO.md for remaining [ ] tasks in this phase. Continue the TDD cycle from where you left off.
Before picking up the next task, perform a lightweight reflection scan (per implementation.md §7.5) and commit any lessons to doc/LESSONS.md.
`;
  }
  return `${AUTONOMOUS_PREAMBLE}

Begin executing: ${phaseHeader}

1. Initialize or continue the TASKLOG for this phase.
2. Check doc/LESSONS.md for any deferred items matching this domain.
3. Execute each [ ] task in phase order using the full TDD cycle.
4. Output PHASE_COMPLETE when all autonomous tasks are done.
`;
}

function buildReflectionPrompt(context) {
  return `Perform a reflection pass now (${context}).

Follow the Lightweight Reflection Scan in implementation.md §7.5:
- Scan for approach pivots, corrective multi-edits, unplanned steps, repeated errors.
- Apply in-place edits to autocode guidelines if the lesson is clear.
- Defer to doc/LESSONS.md otherwise.
- Commit any changes with: docs(reflection): <summary>

After committing, output: REFLECTION_COMPLETE
`;
}

// ---------------------------------------------------------------------------
// Session event loop
// ---------------------------------------------------------------------------

/**
 * Run one agent query session, streaming events until done.
 *
 * agentFactory (for tests): (prompt, options) => AsyncIterable<SDKMessage>
 * Production path uses query() from @anthropic-ai/claude-agent-sdk directly.
 *
 * Returns: [outcome, sessionId]
 *   outcome: "phase_complete" | "blocked:<reason>" | "reflection_complete" | "error"
 */
async function runSession(prompt, sessionId, state, agentFactory = null) {
  log.info('Session starting — session_id=%s', sessionId || 'NEW');

  const options = {
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
  };
  if (sessionId) options.resume = sessionId;

  let queryIterable;
  if (agentFactory !== null) {
    queryIterable = agentFactory(prompt, options);
  } else {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    queryIterable = query({ prompt, options });
  }

  let outcome = 'error';
  let currentSessionId = sessionId;
  let sessionIdLogged = false;

  for await (const event of queryIterable) {
    // Capture session ID from the first event that provides it
    if (event.session_id) {
      if (!sessionIdLogged) {
        currentSessionId = event.session_id;
        log.info('Session established — session_id=%s', currentSessionId);
        sessionIdLogged = true;
      } else {
        currentSessionId = event.session_id;
      }
    }

    state.session_id = currentSessionId;
    // Call through module.exports so jest.spyOn can intercept in tests
    module.exports.saveState(state);

    if (event.type === 'assistant') {
      // Extract text from content blocks
      const text = (event.message?.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
      process.stdout.write(text);

      if (text.includes('PHASE_COMPLETE')) {
        log.info('PHASE_COMPLETE signal received — session_id=%s', currentSessionId);
        outcome = 'phase_complete';
        break;
      }
      if (text.includes('BLOCKED:')) {
        const reason = text.split('BLOCKED:')[1].split('\n')[0].trim();
        log.warning('BLOCKED signal received: %s — session_id=%s', reason, currentSessionId);
        outcome = `blocked:${reason}`;
        break;
      }
      if (text.includes('REFLECTION_COMPLETE')) {
        log.info('REFLECTION_COMPLETE signal received — session_id=%s', currentSessionId);
        outcome = 'reflection_complete';
        break;
      }
    } else if (event.type === 'result') {
      log.info('result event (subtype=%s) — session_id=%s', event.subtype, currentSessionId);
      outcome = 'phase_complete';
      break;
    } else if (event.type === 'rate_limit_event') {
      const err = new RateLimitError('Rate limited by claude.ai');
      if (event.rate_limit_info?.resetsAt) {
        err.reset_at = new Date(event.rate_limit_info.resetsAt * 1000);
      }
      throw err;
    }
  }

  log.info('Session ended — outcome=%s  session_id=%s', outcome, currentSessionId);
  return [outcome, currentSessionId];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function runOrchestrator() {
  _setupLogging();
  const state = loadState();
  log.info(
    'Harness starting — state=%s  limits=[max_sessions=%d, max_failures=%d, min_gap=%ds, backoff=%d–%ds]',
    JSON.stringify(state),
    MAX_SESSIONS_PER_RUN,
    MAX_CONSECUTIVE_FAILURES,
    MIN_SESSION_GAP_SECS,
    BACKOFF_BASE_SECS,
    BACKOFF_MAX_SECS,
  );

  let consecutiveFailures = 0;
  let totalSessions = 0;
  let lastSessionEnd = null;

  while (true) {
    if (isSuspended()) {
      log.info('Suspended (SUSPEND file present). Sleeping 10m.');
      await sleep(600);
      continue;
    }

    if (!isAllowedHour()) {
      log.info('Outside allowed hours (%dh). Sleeping 10m.', new Date().getHours());
      await sleep(600);
      continue;
    }

    if (totalSessions >= MAX_SESSIONS_PER_RUN) {
      const msg = `Session cap reached (${totalSessions}/${MAX_SESSIONS_PER_RUN}). Stopping to prevent runaway API usage.`;
      log.warning(msg);
      await notifyDiscord(msg);
      break;
    }

    let phase;
    if (state.current_phase === null || state.current_phase === undefined) {
      phase = getNextPhase(TODO_PATH);
      if (phase === null) {
        log.info('All autonomous tasks complete — no further phases to run.');
        await notifyDiscord('All autonomous phases complete. Manual verification phases remain.');
        break;
      }
      state.current_phase = phase.number;
      state.session_id = null;
      saveState(state);
      log.info('Selected phase %s: %s', phase.number, phase.header);
    } else {
      const content = fs.readFileSync(TODO_PATH, 'utf-8');
      const phases = _parsePhases(content);
      phase = phases.find(p => p.number === state.current_phase) || null;
      if (phase === null) {
        log.warning('Phase %s not found in BUILD-TODO.md — resetting current_phase', state.current_phase);
        state.current_phase = null;
        saveState(state);
        continue;
      }
    }

    const isResume = state.session_id !== null && state.session_id !== undefined;
    log.info(
      '=== Phase %s %s: %s ===',
      phase.number,
      isResume ? `RESUMING (session=${state.session_id})` : 'STARTING',
      phase.header,
    );

    if (lastSessionEnd !== null) {
      const elapsed = (Date.now() - lastSessionEnd.getTime()) / 1000;
      if (elapsed < MIN_SESSION_GAP_SECS) {
        const gap = MIN_SESSION_GAP_SECS - elapsed;
        log.info('Enforcing minimum session gap: sleeping %.0fs', Math.round(gap));
        await sleep(gap);
      }
    }

    if (isResume) {
      log.info('Injecting pre-resume reflection pass (session=%s)', state.session_id);
      totalSessions += 1;
      try {
        const [_outcome, _sid] = await runSession(
          buildReflectionPrompt('resuming after rate limit'),
          state.session_id,
          state,
        );
        state.session_id = _sid;
        saveState(state);
        lastSessionEnd = new Date();
        log.info('Pre-resume reflection outcome: %s', _outcome);
      } catch (exc) {
        log.warning('Pre-resume reflection failed (non-fatal): %s', exc);
        lastSessionEnd = new Date();
      }
    }

    const prompt = buildPhasePrompt(phase, isResume);
    const sessionStart = new Date();
    totalSessions += 1;
    log.info(
      'Launching session %d/%d (consecutive_failures=%d)',
      totalSessions,
      MAX_SESSIONS_PER_RUN,
      consecutiveFailures,
    );

    let outcome, newSessionId;
    try {
      [outcome, newSessionId] = await runSession(prompt, state.session_id, state);
      state.session_id = newSessionId;
      saveState(state);
    } catch (exc) {
      if (exc instanceof RateLimitError) {
        const resetAt = exc.reset_at ? new Date(exc.reset_at) : new Date();
        log.warning(
          'Rate limited — session_id=%s  reset_at=%s',
          state.session_id,
          resetAt.toISOString(),
        );
        lastSessionEnd = new Date();
        await waitUntil(resetAt);
        continue;
      }
      log.error('Critical error: %s', exc);
      await notifyDiscord(`Harness crashed: ${exc}. Check log/harness-*.log.`);
      break;
    } finally {
      lastSessionEnd = new Date();
    }

    const sessionDuration = (lastSessionEnd.getTime() - sessionStart.getTime()) / 1000;
    log.info('Session duration: %.1fs', sessionDuration.toFixed(1));
    if (sessionDuration < MIN_HEALTHY_SESSION_SECS) {
      log.warning(
        'Session completed in %.1fs (< %ds minimum) — likely an error or empty response. Counting as failure.',
        sessionDuration.toFixed(1),
        MIN_HEALTHY_SESSION_SECS,
      );
      consecutiveFailures += 1;
    }

    let sessionState;
    try {
      sessionState = detectStateAfterSession(phase);
    } catch (exc) {
      log.error('Failed to read post-session BUILD-TODO.md state: %s', exc);
      consecutiveFailures += 1;
      sessionState = 'interrupted';
    }

    if (outcome === 'phase_complete' || sessionState === 'phase_complete') {
      consecutiveFailures = 0;
      log.info('Phase %s complete. Running phase-end reflection pass...', phase.number);
      totalSessions += 1;
      try {
        const [reflOutcome] = await runSession(
          buildReflectionPrompt(`phase ${phase.number} complete`),
          state.session_id,
          state,
        );
        lastSessionEnd = new Date();
        log.info('Phase-end reflection outcome: %s', reflOutcome);
      } catch (exc) {
        log.warning('Phase-end reflection failed (non-fatal): %s', exc);
        lastSessionEnd = new Date();
      }

      state.current_phase = null;
      state.session_id = null;
      saveState(state);
      log.info('Phase %s archived. Selecting next phase...', phase.number);

    } else if (sessionState === 'blocked' || (outcome && outcome.startsWith('blocked:'))) {
      consecutiveFailures = 0;
      const reason = outcome && outcome.startsWith('blocked:')
        ? outcome.split('blocked:')[1]
        : 'manual verification required';
      const msg = `Phase ${phase.number} blocked — human input needed: ${reason}`;
      log.warning('BLOCKED: %s', msg);
      await notifyDiscord(msg);
      break;

    } else {
      consecutiveFailures += 1;
      const backoff = Math.min(
        BACKOFF_BASE_SECS * Math.pow(2, consecutiveFailures - 1),
        BACKOFF_MAX_SECS,
      );

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const msg = (
          `Circuit breaker: ${consecutiveFailures} consecutive sessions without a ` +
          `clean terminal signal. Stopping to prevent runaway API usage. ` +
          `session_id=${state.session_id}`
        );
        log.error(msg);
        await notifyDiscord(msg);
        break;
      }

      log.warning(
        'Session ended without terminal signal — failure %d/%d. Backing off %.0fs before retry. session_id=%s',
        consecutiveFailures,
        MAX_CONSECUTIVE_FAILURES,
        Math.round(backoff),
        state.session_id,
      );
      await sleep(backoff);
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Re-exported for tests
  RateLimitError,
  // Constants
  MANUAL_MARKERS,
  MAX_CONSECUTIVE_FAILURES,
  MIN_SESSION_GAP_SECS,
  MAX_SESSIONS_PER_RUN,
  MIN_HEALTHY_SESSION_SECS,
  BACKOFF_BASE_SECS,
  BACKOFF_MAX_SECS,
  ALLOWED_HOURS,
  // Functions
  log,
  loadState,
  saveState,
  _parsePhases,
  getNextPhase,
  phaseIsBlocked,
  detectStateAfterSession,
  isAllowedHour,
  isSuspended,
  sleep,
  waitUntil,
  notifyDiscord,
  buildPhasePrompt,
  buildReflectionPrompt,
  runSession,
  runOrchestrator,
};

if (require.main === module) {
  runOrchestrator().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
