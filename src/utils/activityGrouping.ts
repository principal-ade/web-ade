import type { RepoActivitySummary, ActivityCommit } from '@/hooks/useGitHubActivityFeed';

export interface HourlyRepoCard {
  /** Unique key for this card (repo + hour) */
  key: string;
  /** Hour of day (0-23) */
  hour: number;
  /** Representative date for this hour */
  date: Date;
  /** Hour label to display */
  hourLabel: string;
  /** Whether this is the most recent hour (shows greeting) */
  isFirst: boolean;
  /** Repository summary with only commits from this hour */
  summary: RepoActivitySummary;
}

function getGreetingForHour(hour: number): string {
  if (hour >= 0 && hour < 6) return 'Night Owls';
  if (hour >= 6 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

/**
 * Groups repository activity by hour, creating one card per repo-hour combination.
 * This reduces the number of commits per card and groups them chronologically.
 */
export function groupSummariesByHour(summaries: RepoActivitySummary[]): HourlyRepoCard[] {
  // Map: dateKey -> Map<repoFullName, commits[]>
  const hourMap = new Map<
    string,
    {
      hour: number;
      date: Date;
      repos: Map<string, { summary: RepoActivitySummary; commits: ActivityCommit[] }>;
    }
  >();

  // Process each summary and group commits by hour
  for (const summary of summaries) {
    for (const commit of summary.commits) {
      const commitDate = new Date(commit.date);
      const hour = commitDate.getHours();
      const dateKey = `${commitDate.getFullYear()}-${commitDate.getMonth()}-${commitDate.getDate()}-${hour}`;

      if (!hourMap.has(dateKey)) {
        const hourDate = new Date(commitDate);
        hourDate.setMinutes(0, 0, 0);
        hourMap.set(dateKey, {
          hour,
          date: hourDate,
          repos: new Map(),
        });
      }

      const group = hourMap.get(dateKey)!;

      if (!group.repos.has(summary.fullName)) {
        group.repos.set(summary.fullName, {
          summary,
          commits: [],
        });
      }

      group.repos.get(summary.fullName)!.commits.push(commit);
    }
  }

  // Convert to flat array of cards
  const cards: HourlyRepoCard[] = [];

  for (const [dateKey, group] of hourMap) {
    for (const [repoFullName, repoData] of group.repos) {
      // Sort commits within this hour by date (most recent first)
      const sortedCommits = repoData.commits.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const latestCommitAt = new Date(sortedCommits[0]?.date ?? group.date);

      cards.push({
        key: `${dateKey}-${repoFullName}`,
        hour: group.hour,
        date: group.date,
        hourLabel: formatHourLabel(group.hour),
        isFirst: false,
        summary: {
          ...repoData.summary,
          commits: sortedCommits,
          commitCount: sortedCommits.length,
          latestCommitAt,
        },
      });
    }
  }

  // Sort by date (most recent first), then by repo name for stability
  cards.sort((a, b) => {
    const timeDiff = b.date.getTime() - a.date.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.summary.fullName.localeCompare(b.summary.fullName);
  });

  // Mark first card and update its label to greeting
  if (cards.length > 0) {
    cards[0]!.isFirst = true;
    cards[0]!.hourLabel = getGreetingForHour(cards[0]!.hour);
  }

  return cards;
}
