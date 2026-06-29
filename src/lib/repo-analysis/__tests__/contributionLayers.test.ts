import { describe, it, expect } from 'vitest';
import {
  analysisContributors,
  mergeContributors,
  mergeOwnership,
  type ContributionAnalysis,
  type EmailIdentity,
} from '../contributionLayers';

/**
 * Identity-merge cases drawn from the real `pingdotgg/t3code` blame map — the
 * use case that drove the design. Emails/ids are the actual ones in that repo.
 */

// path → lines, one tiny owned slice per email so union/stats are checkable.
const ANALYSIS: ContributionAnalysis = {
  byEmail: {
    // --- Julius: noreply + two verified + two local-machine (5 emails) ---
    '51714798+juliusmarminge@users.noreply.github.com': { 'a.ts': 10 },
    'jmarminge@gmail.com': { 'b.ts': 5 },
    'julius0216@outlook.com': { 'a.ts': 3 }, // same file as noreply → sums
    'julius@mac.lan': { 'c.ts': 7 }, // orphan, folds by name
    'julius@macmini.local': { 'd.ts': 2 }, // orphan, folds by name
    // --- justsomelegs: one id, two different display names ---
    '145564979+justsomelegs@users.noreply.github.com': { 'e.ts': 4 },
    'legs@personal.dev': { 'f.ts': 6 }, // verified → same id 145564979, name "legs"
    // --- name-collision guard: two real people both named "Sam" ---
    'sama@x.com': { 'g.ts': 1 }, // id 111
    'samb@y.com': { 'h.ts': 1 }, // id 222
    'sam@local.lan': { 'i.ts': 1 }, // orphan "Sam" → ambiguous → standalone
    // --- pure-orphan same-name cluster (no GitHub presence at all) ---
    'ghost1@unknownhost.name': { 'j.ts': 1 },
    'ghost2@nowhere.lan': { 'k.ts': 1 },
  },
  totalLines: {
    'a.ts': 20, 'b.ts': 5, 'c.ts': 7, 'd.ts': 2, 'e.ts': 4, 'f.ts': 6,
    'g.ts': 1, 'h.ts': 1, 'i.ts': 1, 'j.ts': 1, 'k.ts': 1,
  },
  contributors: [
    { name: 'Julius Marminge', email: '51714798+juliusmarminge@users.noreply.github.com', commits: 1 },
    { name: 'Julius Marminge', email: 'jmarminge@gmail.com', commits: 1 },
    { name: 'julius', email: 'julius0216@outlook.com', commits: 1 },
    { name: 'Julius Marminge', email: 'julius@mac.lan', commits: 1 },
    { name: 'Julius Marminge', email: 'julius@macmini.local', commits: 1 },
    { name: 'justsomelegs', email: '145564979+justsomelegs@users.noreply.github.com', commits: 1 },
    { name: 'legs', email: 'legs@personal.dev', commits: 1 },
    { name: 'Sam', email: 'sama@x.com', commits: 1 },
    { name: 'Sam', email: 'samb@y.com', commits: 1 },
    { name: 'Sam', email: 'sam@local.lan', commits: 1 },
    { name: 'Ghost', email: 'ghost1@unknownhost.name', commits: 1 },
    { name: 'Ghost', email: 'ghost2@nowhere.lan', commits: 1 },
  ],
};

// The API overlay (`getCommitAuthorsByEmail`) for the verified, non-noreply
// emails. Local-machine emails resolve to nothing, as on real GitHub.
const OVERLAY: Record<string, EmailIdentity> = {
  'jmarminge@gmail.com': { login: 'juliusmarminge', id: 51714798 },
  'julius0216@outlook.com': { login: 'juliusmarminge', id: 51714798 },
  'legs@personal.dev': { login: 'justsomelegs', id: 145564979 },
  'sama@x.com': { login: 'sam-one', id: 111 },
  'samb@y.com': { login: 'sam-two', id: 222 },
};

const identityOf = (email: string) => OVERLAY[email.toLowerCase()];

function merge() {
  return mergeContributors(ANALYSIS, analysisContributors(ANALYSIS), identityOf);
}

describe('mergeContributors — t3code identity cases', () => {
  it("merges Julius's 5 emails into one person (id + name fallback)", () => {
    const julius = merge().find((p) => p.githubId === 51714798);
    expect(julius).toBeDefined();
    expect(julius!.emails.sort()).toEqual(
      [
        '51714798+juliusmarminge@users.noreply.github.com',
        'jmarminge@gmail.com',
        'julius0216@outlook.com',
        'julius@mac.lan',
        'julius@macmini.local',
      ].sort(),
    );
    expect(julius!.login).toBe('juliusmarminge');
    // 4 distinct files (a,b,c,d); a.ts = 10 + 3 summed.
    expect(julius!.stats.files).toBe(4);
    expect(julius!.stats.lines).toBe(10 + 3 + 5 + 7 + 2);
    expect(julius!.commits).toBe(5);
  });

  it('merges two display names sharing one id (justsomelegs/legs)', () => {
    const legs = merge().find((p) => p.githubId === 145564979);
    expect(legs).toBeDefined();
    expect(legs!.emails.sort()).toEqual(
      ['145564979+justsomelegs@users.noreply.github.com', 'legs@personal.dev'].sort(),
    );
  });

  it('leaves a name-ambiguous orphan standalone (two real "Sam"s)', () => {
    const people = merge();
    // The two real Sams stay distinct…
    expect(people.find((p) => p.githubId === 111)?.emails).toEqual(['sama@x.com']);
    expect(people.find((p) => p.githubId === 222)?.emails).toEqual(['samb@y.com']);
    // …and the orphan sam@local.lan did NOT fold into either.
    const orphanSam = people.find((p) => p.emails.includes('sam@local.lan'));
    expect(orphanSam!.githubId).toBeUndefined();
    expect(orphanSam!.emails).toEqual(['sam@local.lan']);
  });

  it('clusters same-name pure orphans with no GitHub presence', () => {
    const ghost = merge().find((p) => p.emails.includes('ghost1@unknownhost.name'));
    expect(ghost!.emails.sort()).toEqual(['ghost1@unknownhost.name', 'ghost2@nowhere.lan'].sort());
    expect(ghost!.githubId).toBeUndefined();
    expect(ghost!.name).toBe('Ghost');
  });

  it('mergeOwnership unions files and sums same-path lines', () => {
    const owned = mergeOwnership(ANALYSIS, [
      '51714798+juliusmarminge@users.noreply.github.com',
      'julius0216@outlook.com',
    ]);
    expect(owned['a.ts']).toBe(13);
  });
});
