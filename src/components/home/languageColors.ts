// Subset of GitHub's language colors, shared by the home repo-list views.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  Ruby: '#701516',
  PHP: '#4F5D95',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Scala: '#c22d40',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00',
};

export function getLanguageColor(language: string): string {
  return LANGUAGE_COLORS[language] || '#8b949e';
}
