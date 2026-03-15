# GitHub Visualization Tools

Reference for tools that create visual analytics for GitHub repositories.

## Stars Timeline Charts

Tools for visualizing star growth over time.

### Star History (Recommended)

- **Website**: https://star-history.com
- **Usage**: Enter repo URL, generates embeddable SVG
- **Embed in README**:
  ```markdown
  [![Star History Chart](https://api.star-history.com/svg?repos=owner/repo&type=Date)](https://star-history.com/#owner/repo&Date)
  ```

### Other Options

| Tool | Type | Notes |
|------|------|-------|
| Star History Chrome Extension | Browser extension | Adds chart to GitHub pages |
| caarlos0/starcharts | Self-hosted (Go) | Full control over styling |
| github-star-history | npm package | Programmatic generation |

### GitHub API for Stars

```javascript
// Use star+json media type to get starred_at timestamps
const response = await fetch(
  'https://api.github.com/repos/owner/repo/stargazers',
  {
    headers: {
      'Accept': 'application/vnd.github.star+json'
    }
  }
);
// Returns: [{ user: {...}, starred_at: "2024-01-15T..." }, ...]
```

---

## Contributor Visualizations

### Built-in GitHub (Insights Tab)

- `/graphs/contributors` - Commit activity per contributor over time
- `/graphs/commit-activity` - Weekly commit frequency
- `/pulse` - Recent activity summary

### Third-Party Tools

| Tool | Website | Use Case |
|------|---------|----------|
| OSS Insight | https://ossinsight.io | Deep analytics, contributor growth, geographic distribution |
| contrib.rocks | https://contrib.rocks | Avatar grid for READMEs |
| Repobeats | https://repobeats.axiom.co | Activity dashboard embeds |
| GitHub Readme Stats | https://github.com/anuraghazra/github-readme-stats | Stats cards |
| git-fame | `npx git-fame` | CLI contributor stats |

### Embedding Contributor Avatars

```markdown
<a href="https://github.com/owner/repo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=owner/repo" />
</a>
```

### GitHub API for Contributors

```javascript
// Basic contributor list with commit counts
const contributors = await fetch(
  'https://api.github.com/repos/owner/repo/contributors'
);

// Detailed weekly commit activity per contributor (for charting)
const stats = await fetch(
  'https://api.github.com/repos/owner/repo/stats/contributors'
);
// Returns: [{ author: {...}, weeks: [{ w: timestamp, a: additions, d: deletions, c: commits }] }]
```

---

## Notes

- **OSS Insight** is the most comprehensive for contributor analytics
- **Star History** is the de-facto standard for star charts
- GitHub's `/stats/*` endpoints may return 202 on first request while computing - retry after a few seconds
