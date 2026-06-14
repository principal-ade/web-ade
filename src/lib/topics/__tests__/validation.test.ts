import { describe, it, expect } from 'vitest';
import {
  validateStatus,
  validateCreateRequest,
  validateUpdateRequest,
  validateSendRequest,
  validateVisibility,
} from '../validation';
import {
  MAX_INBOX_COMMENT_CHARS,
  MAX_INBOX_RECIPIENTS,
  MAX_STATUS_LABEL_CHARS,
  MAX_STATUS_NOTE_CHARS,
} from '../constants';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('validateStatus', () => {
  it('accepts a bare state', () => {
    expect(validateStatus({ state: 'working' })).toEqual({ state: 'working' });
    expect(validateStatus({ state: 'paused' })).toEqual({
      state: 'paused',
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
    expect(
      validateStatus({ state: 'done-for-now', label: '  done for now  ' }),
    ).toEqual({ state: 'done-for-now', label: 'done for now' });
    expect(validateStatus({ state: 'done-for-now', label: '   ' })).toEqual({
      state: 'done-for-now',
    });
  });

  it('caps label length', () => {
    expect(() =>
      validateStatus({
        state: 'done-for-now',
        label: 'x'.repeat(MAX_STATUS_LABEL_CHARS + 1),
      }),
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
      status: { state: 'paused', label: 'revisit' },
    });
    expect(out.status).toEqual({ state: 'paused', label: 'revisit' });
  });

  it('rejects an invalid status on create', () => {
    expect(() =>
      validateCreateRequest({ title: 'T', status: { state: 'nope' } }),
    ).toThrow(/state must be one of/);
  });
});

describe('validateUpdateRequest with status', () => {
  it('allows a status-only update', () => {
    expect(validateUpdateRequest({ status: { state: 'done-for-now' } })).toEqual({
      status: { state: 'done-for-now' },
    });
  });

  it('still rejects an empty update', () => {
    expect(() => validateUpdateRequest({})).toThrow(/no fields to update/);
  });
});

describe('validateVisibility', () => {
  it('accepts the two literals', () => {
    expect(validateVisibility('private')).toBe('private');
    expect(validateVisibility('public')).toBe('public');
  });

  it('rejects anything else', () => {
    expect(() => validateVisibility('hidden')).toThrow(
      /visibility must be 'private' or 'public'/,
    );
    expect(() => validateVisibility(undefined)).toThrow(/visibility must be/);
    expect(() => validateVisibility(true)).toThrow(/visibility must be/);
  });
});

describe('visibility on create/update', () => {
  it('omits visibility when not provided on create (absent = private)', () => {
    const out = validateCreateRequest({ title: 'T' });
    expect('visibility' in out).toBe(false);
  });

  it('keeps an explicit visibility on create', () => {
    expect(validateCreateRequest({ title: 'T', visibility: 'public' })).toEqual({
      title: 'T',
      description: '',
      trailIds: [],
      visibility: 'public',
    });
  });

  it('rejects a bad visibility on create', () => {
    expect(() =>
      validateCreateRequest({ title: 'T', visibility: 'nope' }),
    ).toThrow(/visibility must be/);
  });

  it('allows a visibility-only update', () => {
    expect(validateUpdateRequest({ visibility: 'private' })).toEqual({
      visibility: 'private',
    });
  });

  it('rejects a bad visibility on update', () => {
    expect(() => validateUpdateRequest({ visibility: 42 })).toThrow(
      /visibility must be/,
    );
  });
});

describe('validateSendRequest', () => {
  it('accepts a single recipient', () => {
    expect(validateSendRequest({ recipients: ['octocat'] })).toEqual({
      recipients: ['octocat'],
    });
  });

  it('keeps an optional trimmed comment', () => {
    expect(
      validateSendRequest({ recipients: ['octocat'], comment: '  look  ' }),
    ).toEqual({ recipients: ['octocat'], comment: 'look' });
  });

  it('drops an empty/whitespace comment', () => {
    expect(
      validateSendRequest({ recipients: ['octocat'], comment: '   ' }),
    ).toEqual({ recipients: ['octocat'] });
  });

  it('dedupes recipients case-insensitively, preserving first spelling', () => {
    expect(
      validateSendRequest({ recipients: ['Octocat', 'octocat', ' OCTOCAT '] }),
    ).toEqual({ recipients: ['Octocat'] });
  });

  it('rejects a non-object body', () => {
    expect(() => validateSendRequest('nope')).toThrow(
      /Request body must be an object/,
    );
  });

  it('rejects a missing or non-array recipients', () => {
    expect(() => validateSendRequest({})).toThrow(/recipients must be an array/);
    expect(() => validateSendRequest({ recipients: 'octocat' })).toThrow(
      /recipients must be an array/,
    );
  });

  it('rejects non-string recipient entries', () => {
    expect(() => validateSendRequest({ recipients: [123] })).toThrow(
      /recipients entries must be strings/,
    );
  });

  it('rejects an effectively-empty recipient list', () => {
    expect(() => validateSendRequest({ recipients: ['', '  '] })).toThrow(
      /at least one login/,
    );
  });

  it('caps the recipient count', () => {
    const many = Array.from(
      { length: MAX_INBOX_RECIPIENTS + 1 },
      (_, i) => `user${i}`,
    );
    expect(() => validateSendRequest({ recipients: many })).toThrow(
      /Too many recipients/,
    );
  });

  it('caps the comment length', () => {
    expect(() =>
      validateSendRequest({
        recipients: ['octocat'],
        comment: 'x'.repeat(MAX_INBOX_COMMENT_CHARS + 1),
      }),
    ).toThrow(/comment exceeds/);
  });

  it('rejects a non-string comment', () => {
    expect(() =>
      validateSendRequest({ recipients: ['octocat'], comment: 42 }),
    ).toThrow(/comment must be a string/);
  });
});
