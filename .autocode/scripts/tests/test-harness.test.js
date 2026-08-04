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
    id: null,
    status,
    description,
    verify: isManual ? 'Manual test' : '',
    is_manual: isManual,
  };
}

// Locate a shipped adapter in either the canonical repo layout (<root>/task-tracking/<name>)
// or an installed project (.autocode/task-tracking/<name>).
function findAdapterDir(name, entrypoint) {
  return [`../../../../task-tracking/${name}`, `../../task-tracking/${name}`]
    .map(rel => path.resolve(__dirname, rel))
    .find(dir => fs.existsSync(path.join(dir, entrypoint)));
}

const MARKDOWN_ADAPTER_DIR = findAdapterDir('markdown', 'phase-status.js');
const GITHUB_ADAPTER_DIR = findAdapterDir('github-issues', 'phase-status.sh');
const HAS_JQ = (() => {
  try {
    require('child_process').execFileSync('jq', ['--version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
})();

/**
 * Write a throwaway adapter that prints a fixed phase model, and return its ACTIVE path.
 * Exercises the harness's machine interface without depending on any real adapter.
 */
function makeFakeAdapter(model, { name = 'fake', omitCommand = false } = {}) {
  const tmpDir = makeTmpDir();
  const trackingDir = path.join(tmpDir, 'task-tracking');
  const adapterDir = path.join(trackingDir, name);
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.writeFileSync(
    path.join(adapterDir, 'harness.json'),
    JSON.stringify({
      adapter: name,
      phaseStatusCommand: omitCommand ? null : ['node', 'phase-status.js'],
      concurrency: 'single-writer',
    }),
  );
  fs.writeFileSync(
    path.join(adapterDir, 'phase-status.js'),
    `process.stdout.write(${JSON.stringify(JSON.stringify(model))});\n`,
  );
  const activePath = path.join(trackingDir, 'ACTIVE');
  fs.writeFileSync(activePath, name + '\n');
  return { tmpDir, activePath, adapterDir };
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
// Task-tracking adapter resolution + machine interface
// ---------------------------------------------------------------------------

describe('resolveAdapter', () => {
  test('reads the adapter name from ACTIVE and loads its harness.json', () => {
    const { tmpDir, activePath, adapterDir } = makeFakeAdapter({ phases: [] });
    const adapter = harness.resolveAdapter(activePath);
    expect(adapter.name).toBe('fake');
    expect(adapter.dir).toBe(adapterDir);
    expect(adapter.config.phaseStatusCommand).toEqual(['node', 'phase-status.js']);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('throws an actionable error when no adapter is bound', () => {
    const tmpDir = makeTmpDir();
    const missing = path.join(tmpDir, 'task-tracking', 'ACTIVE');
    expect(() => harness.resolveAdapter(missing)).toThrow(/setup\.sh --tracker/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('throws when the adapter declares no phaseStatusCommand', () => {
    const { tmpDir, activePath } = makeFakeAdapter({ phases: [] }, { omitCommand: true });
    expect(() => harness.resolveAdapter(activePath)).toThrow(/cannot drive the autonomous harness/);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('readPhases', () => {
  test('executes the adapter command and returns the phase model', () => {
    const model = {
      phases: [
        { number: '4', header: 'Phase 4 - Test', tasks: [
          { id: '4.1', status: 'open', description: 'Create paginator', verify: 'Unit test' },
        ] },
      ],
    };
    const { tmpDir, activePath } = makeFakeAdapter(model);
    const phases = harness.readPhases(harness.resolveAdapter(activePath));
    expect(phases).toHaveLength(1);
    expect(phases[0].number).toBe('4');
    expect(phases[0].tasks[0].id).toBe('4.1');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('classifies manual tasks from adapter-supplied verify text', () => {
    const model = {
      phases: [
        { number: '5', header: 'Phase 5 - Test', tasks: [
          { id: '5.1', status: 'open', description: 'Send notification', verify: 'real discord webhook test' },
          { id: '5.2', status: 'open', description: 'Create paginator', verify: 'Unit test - slices correctly' },
        ] },
      ],
    };
    const { tmpDir, activePath } = makeFakeAdapter(model);
    const phases = harness.readPhases(harness.resolveAdapter(activePath));
    expect(phases[0].tasks[0].is_manual).toBe(true);
    expect(phases[0].tasks[1].is_manual).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('isManualTask', () => {
  test('no verify text is not manual', () => {
    expect(harness.isManualTask({ verify: '' })).toBe(false);
  });

  test('manual markers are matched case-insensitively', () => {
    expect(harness.isManualTask({ verify: 'real discord webhook test' })).toBe(true);
    expect(harness.isManualTask({ verify: 'Manual test - interactive mode' })).toBe(true);
  });

  test('non-manual verify text is not flagged', () => {
    expect(harness.isManualTask({ verify: 'Unit test - paginator slices correctly' })).toBe(false);
  });

  test('an explicit manual flag from the adapter wins', () => {
    expect(harness.isManualTask({ manual: true, verify: 'Unit test' })).toBe(true);
    expect(harness.isManualTask({ manual: false, verify: 'Manual test' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markdown adapter: phase-status.js
//
// Behavior-preservation coverage for the parser extracted out of this harness.
// Skipped when the markdown adapter is not present (another adapter may be bound).
// ---------------------------------------------------------------------------

// Skipping here is legitimate only when a non-markdown adapter is bound. If the suite is being
// run from a partial checkout, the skip hides the behavior-preservation coverage for the parser
// extracted out of the harness — so say so loudly. `make test` guards against this case.
if (!MARKDOWN_ADAPTER_DIR) {
  console.warn(
    '\n[test-harness] markdown adapter not found — skipping its phase-status tests.\n' +
    '               Expected task-tracking/markdown/phase-status.js relative to this suite.\n' +
    '               If you meant to test the markdown adapter, run `make test` from the\n' +
    '               autocode repository root with the whole repo present.\n',
  );
}

const describeMarkdown = MARKDOWN_ADAPTER_DIR ? describe : describe.skip;

describeMarkdown('markdown adapter phase-status', () => {
  const phaseStatus = MARKDOWN_ADAPTER_DIR
    ? require(path.join(MARKDOWN_ADAPTER_DIR, 'phase-status.js'))
    : null;

  test('empty content returns empty list', () => {
    expect(phaseStatus.parsePhases('')).toEqual([]);
  });

  test('content with no phase headers returns empty', () => {
    expect(phaseStatus.parsePhases('# Title\nSome text\n- [ ] a task')).toEqual([]);
  });

  test('single phase header captured', () => {
    const phases = phaseStatus.parsePhases('## Phase 4 — Review\n');
    expect(phases).toHaveLength(1);
    expect(phases[0].number).toBe('4');
    expect(phases[0].header).toContain('Review');
  });

  test('glyphs map onto the contract status values', () => {
    const content = [
      '## Phase 4 — Test',
      '',
      '- [ ] planned',
      '- [o] implemented',
      '- [x] verified',
      '- [-] skipped',
      '- [~] in progress',
    ].join('\n');
    const statuses = phaseStatus.parsePhases(content)[0].tasks.map(t => t.status);
    expect(statuses).toEqual(['open', 'done', 'done', 'deferred', 'in_progress']);
  });

  test('task without verify emits empty verify text', () => {
    const phases = phaseStatus.parsePhases('## Phase 4 — Test\n- [ ] Create pagination.py\n');
    expect(phases[0].tasks[0].verify).toBe('');
  });

  test('verify text is extracted for harness classification', () => {
    const content = (
      '## Phase 4 — Test\n' +
      '- [ ] Launch review **Verify:** Manual test — make review in interactive mode\n'
    );
    expect(phaseStatus.parsePhases(content)[0].tasks[0].verify).toContain('Manual test');
  });

  test('task IDs are extracted when present', () => {
    const content = '## Phase 1 — Test\n- [ ] **Task 1.2**: Add email validation\n';
    expect(phaseStatus.parsePhases(content)[0].tasks[0].id).toBe('1.2');
  });

  test('multiple phases parsed in order', () => {
    expect(phaseStatus.parsePhases(MULTI_PHASE).map(p => p.number)).toEqual(['3', '4', '5']);
  });

  test('tasks assigned to correct phase', () => {
    const phase4 = phaseStatus.parsePhases(MULTI_PHASE).find(p => p.number === '4');
    expect(phase4.tasks).toHaveLength(2);
  });

  test('parsed output feeds harness classification end to end', () => {
    const content = (
      '## Phase 5 — Test\n' +
      '- [ ] Send notification **Verify:** real discord webhook test\n'
    );
    const task = phaseStatus.parsePhases(content)[0].tasks[0];
    expect(harness.isManualTask(task)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getNextPhase
// ---------------------------------------------------------------------------

const MODEL_ALL_DONE = [
  makePhase('4', [makeTask('done', 'Create pagination.py'), makeTask('deferred', 'Skipped')]),
];

const MODEL_BLOCKED = [
  makePhase('4', [makeTask('done', 'Create pagination.py'), makeTask('open', 'Review', true)]),
];

const MODEL_AUTONOMOUS = [
  makePhase('4', [makeTask('open', 'Create pagination.py'), makeTask('done', 'Create review.py')]),
];

const MODEL_MULTI = [
  makePhase('3', [makeTask('done', 'Implement scorer')]),
  makePhase('4', [makeTask('open', 'Create pagination.py')]),
  makePhase('5', [makeTask('open', 'Wire notify', true)]),
];

describe('getNextPhase', () => {
  test('returns null when all tasks done', () => {
    expect(harness.getNextPhase(MODEL_ALL_DONE)).toBeNull();
  });

  test('returns null when only manual tasks remain', () => {
    expect(harness.getNextPhase(MODEL_BLOCKED)).toBeNull();
  });

  test('returns phase with autonomous tasks', () => {
    const phase = harness.getNextPhase(MODEL_AUTONOMOUS);
    expect(phase).not.toBeNull();
    expect(phase.number).toBe('4');
  });

  test('skips completed phases, returns first with autonomous work', () => {
    // Phase 3 is complete, Phase 4 has autonomous tasks, Phase 5 is manual-only
    const phase = harness.getNextPhase(MODEL_MULTI);
    expect(phase).not.toBeNull();
    expect(phase.number).toBe('4');
  });

  test('in_progress tasks do not count as remaining work', () => {
    const model = [makePhase('4', [makeTask('in_progress', 'Half done')])];
    expect(harness.getNextPhase(model)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// phaseIsBlocked
// ---------------------------------------------------------------------------

describe('phaseIsBlocked', () => {
  test('no remaining tasks returns false', () => {
    const phase = makePhase('4', [makeTask('done', 'done')]);
    expect(harness.phaseIsBlocked(phase)).toBe(false);
  });

  test('all remaining manual returns true', () => {
    const phase = makePhase('4', [
      makeTask('done', 'done'),
      makeTask('open', 'verify', true),
    ]);
    expect(harness.phaseIsBlocked(phase)).toBe(true);
  });

  test('mix of manual and autonomous returns false', () => {
    const phase = makePhase('4', [
      makeTask('open', 'autonomous'),
      makeTask('open', 'verify', true),
    ]);
    expect(harness.phaseIsBlocked(phase)).toBe(false);
  });

  test('all remaining autonomous returns false', () => {
    const phase = makePhase('4', [makeTask('open', 'autonomous')]);
    expect(harness.phaseIsBlocked(phase)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectStateAfterSession
// ---------------------------------------------------------------------------

describe('detectStateAfterSession', () => {
  test('phase no longer reported returns phase_complete', () => {
    const phases = [makePhase('5', [makeTask('done', 'done')])];
    expect(harness.detectStateAfterSession(makePhase('4', []), phases)).toBe('phase_complete');
  });

  test('no remaining tasks returns phase_complete', () => {
    expect(harness.detectStateAfterSession(makePhase('4', []), MODEL_ALL_DONE)).toBe('phase_complete');
  });

  test('only manual remaining returns blocked', () => {
    expect(harness.detectStateAfterSession(makePhase('4', []), MODEL_BLOCKED)).toBe('blocked');
  });

  test('autonomous tasks remaining returns interrupted', () => {
    expect(harness.detectStateAfterSession(makePhase('4', []), MODEL_AUTONOMOUS)).toBe('interrupted');
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

// ---------------------------------------------------------------------------
// github-issues adapter: phase-status.sh
//
// Exercises the adapter's machine interface end to end against a fixture, with no
// GitHub access and no credentials, by injecting a fake `gh` via the GH env var.
// Skipped when the adapter is absent (another adapter may be bound) or jq is missing.
// ---------------------------------------------------------------------------

const canTestGithub = Boolean(GITHUB_ADAPTER_DIR) && HAS_JQ;

if (!canTestGithub) {
  console.warn(
    `\n[test-harness] skipping github-issues adapter tests` +
    ` (adapter ${GITHUB_ADAPTER_DIR ? 'found' : 'NOT found'}, jq ${HAS_JQ ? 'found' : 'NOT found'}).\n` +
    `               jq is required by phase-status.sh — see that adapter's conventions.md.\n`,
  );
}

const describeGithub = canTestGithub ? describe : describe.skip;

describeGithub('github-issues adapter phase-status', () => {
  const GH_FIXTURE = [
    { number: 41, title: 'Task 1.1: Scaffold', body: '**Test:** builds',
      labels: [{ name: 'autocode:task' }], state: 'CLOSED',
      milestone: { title: 'Phase 1: Foundation' } },
    { number: 42, title: 'Task 1.10: Late task', body: '**Test:** t',
      labels: [{ name: 'autocode:task' }], state: 'OPEN',
      milestone: { title: 'Phase 1: Foundation' } },
    { number: 43, title: 'Task 1.9: Earlier task', body: '**Test:** t',
      labels: [{ name: 'autocode:task' }], state: 'OPEN',
      milestone: { title: 'Phase 1: Foundation' } },
    { number: 44, title: 'Task 2.1: Implemented only', body: '**Test:** t',
      labels: [{ name: 'autocode:task' }, { name: 'status:implemented' }], state: 'OPEN',
      milestone: { title: 'Phase 2: Core' } },
    { number: 45, title: 'Task 2.2: In flight', body: '**Test:** t',
      labels: [{ name: 'autocode:task' }, { name: 'status:in-progress' }], state: 'OPEN',
      milestone: { title: 'Phase 2: Core' } },
    { number: 46, title: 'Task 3.1: Needs a human',
      body: '**Test:** t\n**Verify:** real Discord webhook test',
      labels: [{ name: 'autocode:task' }, { name: 'status:deferred' }], state: 'OPEN',
      milestone: { title: 'Phase 3: Notify' } },
    { number: 47, title: 'Task 3.2: Manual verify, still open',
      body: '**Verify:** Manual test - interactive mode',
      labels: [{ name: 'autocode:task' }], state: 'OPEN',
      milestone: { title: 'Phase 3: Notify' } },
    { number: 48, title: 'Unrelated issue', body: 'not autocode',
      labels: [], state: 'OPEN', milestone: { title: 'Roadmap' } },
    { number: 49, title: 'Task 9.9: No milestone', body: 'x',
      labels: [{ name: 'autocode:task' }], state: 'OPEN', milestone: null },
  ];

  let tmpDir;
  let phases;

  beforeAll(() => {
    tmpDir = makeTmpDir();

    // Fake gh: ignores its arguments and prints the fixture.
    const fakeGh = path.join(tmpDir, 'fake-gh');
    fs.writeFileSync(fakeGh, '#!/bin/sh\ncat "$FAKE_GH_FIXTURE"\n');
    fs.chmodSync(fakeGh, 0o755);
    fs.writeFileSync(path.join(tmpDir, 'fixture.json'), JSON.stringify(GH_FIXTURE));

    // Minimal installed-project layout so resolveAdapter() finds the adapter.
    const trackingDir = path.join(tmpDir, 'task-tracking');
    fs.mkdirSync(trackingDir, { recursive: true });
    fs.cpSync(GITHUB_ADAPTER_DIR, path.join(trackingDir, 'github-issues'), { recursive: true });
    fs.writeFileSync(path.join(trackingDir, 'ACTIVE'), 'github-issues\n');

    const adapter = harness.resolveAdapter(path.join(trackingDir, 'ACTIVE'));
    const prevGh = process.env.GH;
    const prevFixture = process.env.FAKE_GH_FIXTURE;
    process.env.GH = fakeGh;
    process.env.FAKE_GH_FIXTURE = path.join(tmpDir, 'fixture.json');
    try {
      phases = harness.readPhases(adapter);
    } finally {
      if (prevGh === undefined) delete process.env.GH; else process.env.GH = prevGh;
      if (prevFixture === undefined) delete process.env.FAKE_GH_FIXTURE;
      else process.env.FAKE_GH_FIXTURE = prevFixture;
    }
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('declares itself multi-writer', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(GITHUB_ADAPTER_DIR, 'harness.json'), 'utf-8'));
    expect(cfg.concurrency).toBe('multi-writer');
    expect(cfg.phaseStatusCommand).toEqual(['sh', 'phase-status.sh']);
  });

  test('groups issues into numbered phases by milestone', () => {
    expect(phases.map(p => p.number)).toEqual(['1', '2', '3']);
    expect(phases[0].header).toBe('Phase 1: Foundation');
  });

  test('drops issues with no milestone or a non-phase milestone', () => {
    const allIds = phases.flatMap(p => p.tasks.map(t => t.id));
    expect(allIds).not.toContain('9.9');
    expect(phases.map(p => p.header)).not.toContain('Roadmap');
  });

  test('maps issue state and labels onto contract status values', () => {
    const byId = Object.fromEntries(phases.flatMap(p => p.tasks).map(t => [t.id, t.status]));
    expect(byId['1.1']).toBe('done');          // closed
    expect(byId['1.9']).toBe('open');          // open, no status label
    expect(byId['2.1']).toBe('done');          // status:implemented
    expect(byId['2.2']).toBe('in_progress');   // status:in-progress
    expect(byId['3.1']).toBe('deferred');      // status:deferred
  });

  test('sorts task IDs segment-wise so 1.10 follows 1.9', () => {
    expect(phases[0].tasks.map(t => t.id)).toEqual(['1.1', '1.9', '1.10']);
  });

  test('exposes the issue number for traceability', () => {
    expect(phases[0].tasks.find(t => t.id === '1.1').issue).toBe(41);
  });

  test('emits verify text for harness manual-task classification', () => {
    const p3 = phases.find(p => p.number === '3');
    expect(p3.tasks.find(t => t.id === '3.2').is_manual).toBe(true);
    expect(phases[0].tasks.find(t => t.id === '1.9').is_manual).toBe(false);
  });

  test('harness scheduling decisions work unchanged against this adapter', () => {
    expect(harness.getNextPhase(phases).number).toBe('1');
    expect(harness.phaseIsBlocked(phases.find(p => p.number === '3'))).toBe(true);
    expect(harness.phaseIsBlocked(phases.find(p => p.number === '1'))).toBe(false);
    expect(harness.detectStateAfterSession({ number: '1' }, phases)).toBe('interrupted');
    expect(harness.detectStateAfterSession({ number: '2' }, phases)).toBe('phase_complete');
    expect(harness.detectStateAfterSession({ number: '3' }, phases)).toBe('blocked');
  });
});
