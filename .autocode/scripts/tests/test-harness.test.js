/**
 * Tests for auto-resume-harness.js
 *
 * External deps (claude-agent-sdk, @anthropic-ai/sdk) are mocked before module
 * load so the test suite can run without those packages installed.
 */

'use strict';

// ---------------------------------------------------------------------------
// Bootstrap: mock external packages before loading the harness module
// ---------------------------------------------------------------------------

jest.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: jest.fn() }), { virtual: true });
jest.mock('@anthropic-ai/sdk', () => ({
  RateLimitError: class RateLimitError extends Error {
    constructor(...args) { super(...args); this.name = 'RateLimitError'; }
  },
}), { virtual: true });

const fs = require('fs');
const os = require('os');
const path = require('path');
const harness = require('../auto-resume-harness');

const { RateLimitError } = harness;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHASE4_AUTONOMOUS = `\
## Phase 4 — Review, Feedback, and Stats

### 4.1 — Pagination utility
- [ ] Create pagination.py **Verify:** Unit test — paginator correctly slices a list
- [ ] **Verify:** Unit test — paginator correctly slices a list

### 4.2 — Interactive review session
- [o] Create review.py
`;

const PHASE4_BLOCKED = `\
## Phase 4 — Review, Feedback, and Stats

### 4.1 — Pagination utility
- [o] Create pagination.py
- [ ] **Verify:** Manual test — make review in interactive mode
`;

const PHASE4_ALL_DONE = `\
## Phase 4 — Review, Feedback, and Stats

- [o] Create pagination.py
- [x] Verified
- [-] Skipped for reason
`;

const MULTI_PHASE = `\
## Phase 3 — Scoring Pipeline

- [o] Implement scorer
- [x] Verified scorer

## Phase 4 — Review, Feedback, and Stats

- [ ] Create pagination.py **Verify:** Unit test — paginator slices correctly
- [ ] Create review.py

## Phase 5 — Notifications

- [ ] Wire notify **Verify:** real Discord webhook test
`;

function makeTask(status, description, isManual = false) {
  return {
    raw: `- ${status} ${description}`,
    status,
    description,
    verify_text: isManual ? 'Manual test' : '',
    is_manual: isManual,
  };
}

function makePhase(number, tasks) {
  return {
    header: `Phase ${number} — Test`,
    number,
    tasks,
  };
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
}

/**
 * Build an SDK-shaped event for use in runSession tests.
 *
 * eventType:
 *   'assistant'      – SDKAssistantMessage (text in message.content)
 *   'result'         – SDKResultMessage (maps to task_completed)
 *   'rate_limit_event' – SDKRateLimitEvent
 */
function makeEvent(eventType, text = '', sessionId = 'sess-abc') {
  if (eventType === 'assistant') {
    return {
      type: 'assistant',
      session_id: sessionId,
      message: { content: text ? [{ type: 'text', text }] : [] },
      uuid: 'test-uuid',
      parent_tool_use_id: null,
    };
  }
  if (eventType === 'result') {
    return { type: 'result', subtype: 'success', session_id: sessionId, uuid: 'test-uuid' };
  }
  if (eventType === 'rate_limit_event') {
    return {
      type: 'rate_limit_event',
      session_id: sessionId,
      rate_limit_info: { status: 'rejected', resetsAt: Math.floor(Date.now() / 1000) + 300 },
      uuid: 'test-uuid',
    };
  }
  return { type: eventType, session_id: sessionId, text };
}

/**
 * Build an agentFactory for runSession tests.
 * agentFactory signature: (prompt, options) => AsyncIterable<SDKMessage>
 */
function makeFactory(events, sessionId = 'sess-abc') {
  return (prompt, options) => {
    const enriched = events.map(e => e.session_id ? e : { ...e, session_id: sessionId });
    return (async function* () {
      for (const event of enriched) yield event;
    })();
  };
}

// ---------------------------------------------------------------------------
// _parsePhases
// ---------------------------------------------------------------------------

describe('_parsePhases', () => {
  test('empty content returns empty list', () => {
    expect(harness._parsePhases('')).toEqual([]);
  });

  test('content with no phase headers returns empty', () => {
    const content = '# Title\nSome text\n- [ ] a task';
    expect(harness._parsePhases(content)).toEqual([]);
  });

  test('single phase header captured', () => {
    const content = '## Phase 4 — Review\n';
    const phases = harness._parsePhases(content);
    expect(phases).toHaveLength(1);
    expect(phases[0].number).toBe('4');
    expect(phases[0].header).toContain('Review');
  });

  test('task statuses all captured', () => {
    const content = [
      '## Phase 4 — Test',
      '',
      '- [ ] planned',
      '- [o] implemented',
      '- [x] verified',
      '- [-] skipped',
      '- [~] in progress',
    ].join('\n');
    const phases = harness._parsePhases(content);
    const statuses = phases[0].tasks.map(t => t.status);
    expect(statuses).toEqual(['[ ]', '[o]', '[x]', '[-]', '[~]']);
  });

  test('task without verify not marked manual', () => {
    const content = '## Phase 4 — Test\n- [ ] Create pagination.py\n';
    const phases = harness._parsePhases(content);
    expect(phases[0].tasks[0].is_manual).toBe(false);
    expect(phases[0].tasks[0].verify_text).toBe('');
  });

  test('verify line with manual marker flagged', () => {
    const content = (
      '## Phase 4 — Test\n' +
      '- [ ] Launch review **Verify:** Manual test — make review in interactive mode\n'
    );
    const phases = harness._parsePhases(content);
    const task = phases[0].tasks[0];
    expect(task.is_manual).toBe(true);
    expect(task.verify_text).toContain('Manual test');
  });

  test('verify line without manual marker not flagged', () => {
    const content = (
      '## Phase 4 — Test\n' +
      '- [ ] Create paginator **Verify:** Unit test — paginator slices correctly\n'
    );
    const phases = harness._parsePhases(content);
    expect(phases[0].tasks[0].is_manual).toBe(false);
  });

  test('multiple phases parsed in order', () => {
    const phases = harness._parsePhases(MULTI_PHASE);
    const numbers = phases.map(p => p.number);
    expect(numbers).toEqual(['3', '4', '5']);
  });

  test('tasks assigned to correct phase', () => {
    const phases = harness._parsePhases(MULTI_PHASE);
    const phase4 = phases.find(p => p.number === '4');
    expect(phase4.tasks).toHaveLength(2);
  });

  test('manual markers case insensitive', () => {
    const content = (
      '## Phase 5 — Test\n' +
      '- [ ] Send notification **Verify:** real discord webhook test\n'
    );
    const phases = harness._parsePhases(content);
    expect(phases[0].tasks[0].is_manual).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getNextPhase
// ---------------------------------------------------------------------------

describe('getNextPhase', () => {
  test('returns null when all tasks done', () => {
    const tmpDir = makeTmpDir();
    const todo = path.join(tmpDir, 'BUILD-TODO.md');
    fs.writeFileSync(todo, PHASE4_ALL_DONE);
    expect(harness.getNextPhase(todo)).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('returns null when only manual tasks remain', () => {
    const tmpDir = makeTmpDir();
    const todo = path.join(tmpDir, 'BUILD-TODO.md');
    fs.writeFileSync(todo, PHASE4_BLOCKED);
    expect(harness.getNextPhase(todo)).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('returns phase with autonomous tasks', () => {
    const tmpDir = makeTmpDir();
    const todo = path.join(tmpDir, 'BUILD-TODO.md');
    fs.writeFileSync(todo, PHASE4_AUTONOMOUS);
    const phase = harness.getNextPhase(todo);
    expect(phase).not.toBeNull();
    expect(phase.number).toBe('4');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('skips completed phases, returns first with autonomous work', () => {
    const tmpDir = makeTmpDir();
    const todo = path.join(tmpDir, 'BUILD-TODO.md');
    fs.writeFileSync(todo, MULTI_PHASE);
    // Phase 3 is complete, Phase 4 has autonomous tasks, Phase 5 is manual-only
    const phase = harness.getNextPhase(todo);
    expect(phase).not.toBeNull();
    expect(phase.number).toBe('4');
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// phaseIsBlocked
// ---------------------------------------------------------------------------

describe('phaseIsBlocked', () => {
  test('no remaining tasks returns false', () => {
    const phase = makePhase('4', [makeTask('[o]', 'done')]);
    expect(harness.phaseIsBlocked(phase)).toBe(false);
  });

  test('all remaining manual returns true', () => {
    const phase = makePhase('4', [
      makeTask('[o]', 'done'),
      makeTask('[ ]', 'verify', true),
    ]);
    expect(harness.phaseIsBlocked(phase)).toBe(true);
  });

  test('mix of manual and autonomous returns false', () => {
    const phase = makePhase('4', [
      makeTask('[ ]', 'autonomous'),
      makeTask('[ ]', 'verify', true),
    ]);
    expect(harness.phaseIsBlocked(phase)).toBe(false);
  });

  test('all remaining autonomous returns false', () => {
    const phase = makePhase('4', [makeTask('[ ]', 'autonomous')]);
    expect(harness.phaseIsBlocked(phase)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectStateAfterSession
// ---------------------------------------------------------------------------

describe('detectStateAfterSession', () => {
  test('phase not in TODO returns phase_complete', () => {
    const tmpDir = makeTmpDir();
    const todo = path.join(tmpDir, 'BUILD-TODO.md');
    fs.writeFileSync(todo, '## Phase 5 — Notifications\n- [o] done\n');
    const phase = makePhase('4', []);
    expect(harness.detectStateAfterSession(phase, todo)).toBe('phase_complete');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('no remaining tasks returns phase_complete', () => {
    const tmpDir = makeTmpDir();
    const todo = path.join(tmpDir, 'BUILD-TODO.md');
    fs.writeFileSync(todo, PHASE4_ALL_DONE);
    const phase = makePhase('4', []);
    expect(harness.detectStateAfterSession(phase, todo)).toBe('phase_complete');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('only manual remaining returns blocked', () => {
    const tmpDir = makeTmpDir();
    const todo = path.join(tmpDir, 'BUILD-TODO.md');
    fs.writeFileSync(todo, PHASE4_BLOCKED);
    const phase = makePhase('4', []);
    expect(harness.detectStateAfterSession(phase, todo)).toBe('blocked');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('autonomous tasks remaining returns interrupted', () => {
    const tmpDir = makeTmpDir();
    const todo = path.join(tmpDir, 'BUILD-TODO.md');
    fs.writeFileSync(todo, PHASE4_AUTONOMOUS);
    const phase = makePhase('4', []);
    expect(harness.detectStateAfterSession(phase, todo)).toBe('interrupted');
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// isAllowedHour / isSuspended
// ---------------------------------------------------------------------------

describe('scheduling', () => {
  describe('isAllowedHour', () => {
    afterEach(() => jest.useRealTimers());

    test('returns true for late night (hour 23)', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T23:00:00'));
      expect(harness.isAllowedHour()).toBe(true);
    });

    test('returns false for daytime (hour 14)', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T14:00:00'));
      expect(harness.isAllowedHour()).toBe(false);
    });
  });

  describe('isSuspended', () => {
    test('returns true when file exists', () => {
      const tmpDir = makeTmpDir();
      const flag = path.join(tmpDir, 'SUSPEND');
      fs.writeFileSync(flag, '');
      expect(harness.isSuspended(flag)).toBe(true);
      fs.rmSync(tmpDir, { recursive: true });
    });

    test('returns false when file absent', () => {
      const tmpDir = makeTmpDir();
      const flag = path.join(tmpDir, 'SUSPEND');
      expect(harness.isSuspended(flag)).toBe(false);
      fs.rmSync(tmpDir, { recursive: true });
    });
  });
});

// ---------------------------------------------------------------------------
// waitUntil
// ---------------------------------------------------------------------------

describe('waitUntil', () => {
  test('waits correct duration for future time', async () => {
    const future = new Date(Date.now() + 100 * 1000);
    const mockSleep = jest.fn().mockResolvedValue(undefined);
    await harness.waitUntil(future, mockSleep);
    const calledWith = mockSleep.mock.calls[0][0];
    expect(calledWith).toBeGreaterThanOrEqual(105);
    expect(calledWith).toBeLessThanOrEqual(115);
  });

  test('uses buffer only for past time', async () => {
    const past = new Date(Date.now() - 100 * 1000);
    const mockSleep = jest.fn().mockResolvedValue(undefined);
    await harness.waitUntil(past, mockSleep);
    const calledWith = mockSleep.mock.calls[0][0];
    expect(calledWith).toBe(10);
  });

  test('calls sleep once for any future time', async () => {
    const future = new Date(Date.now() + 50 * 1000);
    const mockSleep = jest.fn().mockResolvedValue(undefined);
    await harness.waitUntil(future, mockSleep);
    expect(mockSleep).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// loadState / saveState
// ---------------------------------------------------------------------------

describe('stateIO', () => {
  test('loadState returns defaults when file missing', () => {
    const tmpDir = makeTmpDir();
    const stateFile = path.join(tmpDir, 'harness.json');
    const state = harness.loadState(stateFile);
    expect(state).toEqual({ session_id: null, current_phase: null });
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('loadState parses existing file', () => {
    const tmpDir = makeTmpDir();
    const stateFile = path.join(tmpDir, 'harness.json');
    fs.writeFileSync(stateFile, JSON.stringify({ session_id: 'abc', current_phase: '4' }));
    const state = harness.loadState(stateFile);
    expect(state).toEqual({ session_id: 'abc', current_phase: '4' });
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('saveState creates parent dirs', () => {
    const tmpDir = makeTmpDir();
    const stateFile = path.join(tmpDir, 'nested', 'dir', 'harness.json');
    harness.saveState({ session_id: 'x' }, stateFile);
    expect(fs.existsSync(stateFile)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('save/load round trip', () => {
    const tmpDir = makeTmpDir();
    const stateFile = path.join(tmpDir, 'harness.json');
    const original = { session_id: 'sess-123', current_phase: '5' };
    harness.saveState(original, stateFile);
    const loaded = harness.loadState(stateFile);
    expect(loaded).toEqual(original);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// notifyDiscord
// ---------------------------------------------------------------------------

describe('notifyDiscord', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('no webhook file does not throw', async () => {
    const tmpDir = makeTmpDir();
    await harness.notifyDiscord('test message', tmpDir);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('empty webhook url does not throw', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'discord_webhook_url'), '');
    await harness.notifyDiscord('test message', tmpDir);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('valid webhook sends POST request', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'discord_webhook_url'),
      'https://discord.com/api/webhooks/test',
    );
    await harness.notifyDiscord('hello', tmpDir);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://discord.com/api/webhooks/test');
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    expect(payload.content).toContain('hello');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('http failure does not throw', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'discord_webhook_url'),
      'https://discord.com/api/webhooks/test',
    );
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));
    await harness.notifyDiscord('hello', tmpDir);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// buildPhasePrompt / buildReflectionPrompt
// ---------------------------------------------------------------------------

describe('promptBuilders', () => {
  const phase = makePhase('4', []);

  test('fresh prompt contains "Begin executing"', () => {
    const prompt = harness.buildPhasePrompt(phase, false);
    expect(prompt).toContain('Begin executing');
    expect(prompt).toContain('Phase 4');
  });

  test('resume prompt contains "RESUMING"', () => {
    const prompt = harness.buildPhasePrompt(phase, true);
    expect(prompt).toContain('RESUMING');
    expect(prompt).toContain('Phase 4');
  });

  test('both prompts contain PHASE_COMPLETE', () => {
    expect(harness.buildPhasePrompt(phase, false)).toContain('PHASE_COMPLETE');
    expect(harness.buildPhasePrompt(phase, true)).toContain('PHASE_COMPLETE');
  });

  test('reflection prompt contains context', () => {
    const prompt = harness.buildReflectionPrompt('phase 4 complete');
    expect(prompt).toContain('phase 4 complete');
  });

  test('reflection prompt contains REFLECTION_COMPLETE signal', () => {
    const prompt = harness.buildReflectionPrompt('any context');
    expect(prompt).toContain('REFLECTION_COMPLETE');
  });
});

// ---------------------------------------------------------------------------
// runSession
// ---------------------------------------------------------------------------

describe('runSession', () => {
  let saveStateSpy;

  beforeEach(() => {
    saveStateSpy = jest.spyOn(harness, 'saveState').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('PHASE_COMPLETE signal returns phase_complete', async () => {
    const state = { session_id: null, current_phase: '4' };
    const factory = makeFactory([makeEvent('assistant', 'Work done.\nPHASE_COMPLETE\n')]);
    const [outcome] = await harness.runSession('prompt', null, state, factory);
    expect(outcome).toBe('phase_complete');
  });

  test('BLOCKED signal extracts reason', async () => {
    const state = { session_id: null, current_phase: '4' };
    const factory = makeFactory([makeEvent('assistant', 'BLOCKED: need Discord creds\n')]);
    const [outcome] = await harness.runSession('prompt', null, state, factory);
    expect(outcome).toBe('blocked:need Discord creds');
  });

  test('REFLECTION_COMPLETE signal returns reflection_complete', async () => {
    const state = { session_id: null, current_phase: '4' };
    const factory = makeFactory([makeEvent('assistant', 'REFLECTION_COMPLETE')]);
    const [outcome] = await harness.runSession('prompt', null, state, factory);
    expect(outcome).toBe('reflection_complete');
  });

  test('result event returns phase_complete', async () => {
    const state = { session_id: null, current_phase: '4' };
    const factory = makeFactory([makeEvent('result')]);
    const [outcome] = await harness.runSession('prompt', null, state, factory);
    expect(outcome).toBe('phase_complete');
  });

  test('no terminal signal returns error', async () => {
    const state = { session_id: null, current_phase: '4' };
    const factory = makeFactory([makeEvent('assistant', 'just some text')]);
    const [outcome] = await harness.runSession('prompt', null, state, factory);
    expect(outcome).toBe('error');
  });

  test('session_id captured from event on each iteration', async () => {
    const state = { session_id: null, current_phase: '4' };
    const factory = makeFactory([
      makeEvent('assistant', 'processing...', 'sess-xyz'),
      makeEvent('assistant', 'PHASE_COMPLETE', 'sess-xyz'),
    ], 'sess-xyz');
    await harness.runSession('prompt', null, state, factory);
    expect(saveStateSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    const savedState = saveStateSpy.mock.calls[0][0];
    expect(savedState.session_id).toBe('sess-xyz');
  });

  test('session_id returned from final event', async () => {
    const state = { session_id: null, current_phase: '4' };
    const factory = makeFactory([makeEvent('assistant', 'PHASE_COMPLETE', 'sess-ret')], 'sess-ret');
    const [, returnedSid] = await harness.runSession('prompt', null, state, factory);
    expect(returnedSid).toBe('sess-ret');
  });
});
