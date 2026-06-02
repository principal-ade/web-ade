import { describe, it, expect } from 'vitest';
import {
  validateStatus,
  validateCreateRequest,
  validateUpdateRequest,
} from '../validation';
import {
  MAX_STATUS_LABEL_CHARS,
  MAX_STATUS_NOTE_CHARS,
} from '../constants';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('validateStatus', () => {
  it('accepts a bare state', () => {
    expect(validateStatus({ state: 'active' })).toEqual({ state: 'active' });
    expect(validateStatus({ state: 'needs-attention' })).toEqual({
      state: 'needs-attention',
    });
  });

  it('rejects a missing or unknown state', () => {
    expect(() => validateStatus({})).toThrow(/state must be one of/);
    expect(() => validateStatus({ state: 'archived' })).toThrow(
      /state must be one of/,
    );
    expect(() => validateStatus('done')).toThrow(/status must be an object/);
  });

  it('trims a label and drops an empty one', () => {
    expect(validateStatus({ state: 'done', label: '  done for now  ' })).toEqual(
      { state: 'done', label: 'done for now' },
    );
    expect(validateStatus({ state: 'done', label: '   ' })).toEqual({
      state: 'done',
    });
  });

  it('caps label length', () => {
    expect(() =>
      validateStatus({ state: 'done', label: 'x'.repeat(MAX_STATUS_LABEL_CHARS + 1) }),
    ).toThrow(/label exceeds/);
  });

  it('keeps a waitingOn with note + ISO until + ref', () => {
    const status = validateStatus({
      state: 'waiting',
      waitingOn: {
        note: 'design sign-off',
        until: '2026-07-01T00:00:00.000Z',
        ref: { kind: 'pr', value: '1234', title: 'the PR' },
      },
    });
    expect(status).toEqual({
      state: 'waiting',
      waitingOn: {
        note: 'design sign-off',
        until: '2026-07-01T00:00:00.000Z',
        ref: { kind: 'pr', value: '1234', title: 'the PR' },
      },
    });
  });

  it('collapses an all-empty waitingOn to undefined', () => {
    expect(
      validateStatus({ state: 'waiting', waitingOn: { note: '   ' } }),
    ).toEqual({ state: 'waiting' });
  });

  it('rejects a non-ISO until', () => {
    expect(() =>
      validateStatus({ state: 'waiting', waitingOn: { until: 'soon' } }),
    ).toThrow(/until must be an ISO 8601 date/);
  });

  it('rejects an unknown ref kind and a missing ref value', () => {
    expect(() =>
      validateStatus({
        state: 'waiting',
        waitingOn: { ref: { kind: 'slack', value: 'x' } },
      }),
    ).toThrow(/ref.kind must be one of/);
    expect(() =>
      validateStatus({
        state: 'waiting',
        waitingOn: { ref: { kind: 'url' } },
      }),
    ).toThrow(/ref.value is required/);
  });

  it('caps note length', () => {
    expect(() =>
      validateStatus({
        state: 'waiting',
        waitingOn: { note: 'x'.repeat(MAX_STATUS_NOTE_CHARS + 1) },
      }),
    ).toThrow(/note exceeds/);
  });
});

describe('validateCreateRequest with status', () => {
  it('omits status when absent', () => {
    const out = validateCreateRequest({ title: 'T', trailIds: [UUID] });
    expect(out.status).toBeUndefined();
  });

  it('validates status when present', () => {
    const out = validateCreateRequest({
      title: 'T',
      status: { state: 'needs-attention', label: 'revisit' },
    });
    expect(out.status).toEqual({ state: 'needs-attention', label: 'revisit' });
  });

  it('rejects an invalid status on create', () => {
    expect(() =>
      validateCreateRequest({ title: 'T', status: { state: 'nope' } }),
    ).toThrow(/state must be one of/);
  });
});

describe('validateUpdateRequest with status', () => {
  it('allows a status-only update', () => {
    expect(validateUpdateRequest({ status: { state: 'done' } })).toEqual({
      status: { state: 'done' },
    });
  });

  it('still rejects an empty update', () => {
    expect(() => validateUpdateRequest({})).toThrow(/no fields to update/);
  });
});
