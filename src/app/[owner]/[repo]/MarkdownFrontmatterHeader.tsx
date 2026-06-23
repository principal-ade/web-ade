'use client';

import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Link as LinkIcon,
  Tag,
} from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { fmString, fmStringList } from '@principal-ade/markdown-utils';

/**
 * Keys we render with dedicated, styled treatment in the header. Everything
 * else in the front matter falls through to the generic key/value list so no
 * metadata is silently dropped.
 *
 * The front matter parsing lives in `@principal-ade/markdown-utils`
 * (`parseFrontmatter` / `fmString` / `fmStringList`) so it stays shared and
 * React-free; this component is just the web-ade presentation of it. Ported
 * from the electron-app's MarkdownPanel header.
 */
const KNOWN_KEYS = new Set([
  'title',
  'description',
  'type',
  'volatility',
  'as_of',
  'timestamp',
  'tags',
  'sources',
  'resource',
]);

// Indices into the theme's `fontSizes` scale ([12, 14, 16, 18, 20, 24, 32, …]).
const SIZE_TITLE = 6; // 32
const SIZE_BODY = 2; // 16
const SIZE_SMALL = 1; // 14

interface MarkdownFrontmatterHeaderProps {
  data: Record<string, unknown>;
}

/** Map a volatility value to a semantic theme color. */
const volatilityColor = (
  volatility: string,
  theme: ReturnType<typeof useTheme>['theme'],
): string => {
  switch (volatility.toLowerCase()) {
    case 'perishable':
    case 'fast':
      return theme.colors.warning;
    case 'slow':
      return theme.colors.info;
    default:
      return theme.colors.textMuted;
  }
};

/** A small pill. `color` drives text/border; background stays the header's. */
const Badge: React.FC<{
  color: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ color, children, icon }) => {
  const { theme } = useTheme();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontFamily: theme.fonts.body,
        fontSize: theme.fontSizes[SIZE_SMALL],
        fontWeight: theme.fontWeights.semibold,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </span>
  );
};

const isHttp = (value: string): boolean => /^https?:\/\//i.test(value);

/**
 * Renders parsed YAML front matter as a styled document header: title,
 * type/volatility/date badges, a description lead, tag chips, and source
 * links. Designed to sit directly above the rendered markdown body in the repo
 * file viewer. Renders nothing when there's no meaningful metadata.
 */
export const MarkdownFrontmatterHeader: React.FC<
  MarkdownFrontmatterHeaderProps
> = ({ data }) => {
  const { theme } = useTheme();

  const title = fmString(data.title);
  const description = fmString(data.description);
  const type = fmString(data.type);
  const volatility = fmString(data.volatility);
  // Prefer an explicit freshness date; fall back to a generic timestamp.
  const date = fmString(data.as_of) ?? fmString(data.timestamp);
  const tags = fmStringList(data.tags);
  // `resource` is a single canonical link; `sources` is a citation list.
  const sources = [
    ...fmStringList(data.resource),
    ...fmStringList(data.sources),
  ];

  // Surface any front matter keys we don't render explicitly so nothing is
  // silently hidden from the reader.
  const extras = useMemo(
    () =>
      Object.entries(data)
        .filter(([key, value]) => {
          if (KNOWN_KEYS.has(key)) return false;
          return (
            fmString(value) !== undefined || fmStringList(value).length > 0
          );
        })
        .map(([key, value]) => {
          const list = fmStringList(value);
          return [key, list.length > 1 ? list.join(', ') : fmString(value)] as [
            string,
            string | undefined,
          ];
        })
        .filter((entry): entry is [string, string] => !!entry[1]),
    [data],
  );

  // Everything other than the title collapses beneath it. Collapsed by default
  // so the reader sees a clean document title and opts into the metadata.
  const [expanded, setExpanded] = useState(false);

  const hasMetadata = !!(
    type ||
    volatility ||
    date ||
    description ||
    tags.length ||
    sources.length ||
    extras.length
  );
  if (!title && !hasMetadata) return null;

  const metadataBody = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Badge row */}
      {(type || volatility || date) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {type && (
            <Badge color={theme.colors.accent}>{type.toUpperCase()}</Badge>
          )}
          {volatility && (
            <Badge color={volatilityColor(volatility, theme)}>
              {volatility}
            </Badge>
          )}
          {date && (
            <Badge color={theme.colors.textMuted} icon={<Calendar size={11} />}>
              {date}
            </Badge>
          )}
        </div>
      )}

      {description && (
        <p
          style={{
            margin: 0,
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[SIZE_BODY],
            fontWeight: theme.fontWeights.body,
            lineHeight: theme.lineHeights.body,
            color: theme.colors.textSecondary,
          }}
        >
          {description}
        </p>
      )}

      {tags.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <Tag size={12} color={theme.colors.textTertiary} />
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                backgroundColor: theme.colors.backgroundDark,
                color: theme.colors.textSecondary,
                fontFamily: theme.fonts.body,
                fontSize: theme.fontSizes[SIZE_SMALL],
                fontWeight: theme.fontWeights.body,
                lineHeight: 1.6,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            marginTop: 2,
          }}
        >
          {sources.map((source) => {
            const url = source.match(/https?:\/\/\S+/)?.[0];
            return (
              <div
                key={source}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  color: theme.colors.textTertiary,
                }}
              >
                <LinkIcon
                  size={11}
                  color={theme.colors.textTertiary}
                  style={{ flexShrink: 0, transform: 'translateY(1px)' }}
                />
                {url && isHttp(url) ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: theme.colors.primary,
                      fontFamily: theme.fonts.body,
                      fontSize: theme.fontSizes[SIZE_SMALL],
                      fontWeight: theme.fontWeights.body,
                      wordBreak: 'break-word',
                    }}
                  >
                    {source}
                  </a>
                ) : (
                  <span
                    style={{
                      fontFamily: theme.fonts.body,
                      fontSize: theme.fontSizes[SIZE_SMALL],
                      fontWeight: theme.fontWeights.body,
                      wordBreak: 'break-word',
                    }}
                  >
                    {source}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {extras.length > 0 && (
        <dl
          style={{
            margin: 0,
            marginTop: 2,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '2px 10px',
          }}
        >
          {extras.map(([key, value]) => (
            <React.Fragment key={key}>
              <dt
                style={{
                  color: theme.colors.textTertiary,
                  fontFamily: theme.fonts.body,
                  fontSize: theme.fontSizes[SIZE_SMALL],
                  fontWeight: theme.fontWeights.semibold,
                }}
              >
                {key}
              </dt>
              <dd
                style={{
                  margin: 0,
                  color: theme.colors.textSecondary,
                  fontFamily: theme.fonts.body,
                  fontSize: theme.fontSizes[SIZE_SMALL],
                  fontWeight: theme.fontWeights.body,
                }}
              >
                {value}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </div>
  );

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: theme.fonts.heading,
    fontSize: theme.fontSizes[SIZE_TITLE],
    fontWeight: theme.fontWeights.bold,
    lineHeight: theme.lineHeights.heading,
    color: theme.colors.text,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <header
      style={{
        padding: '20px 24px 16px',
        borderBottom: `1px solid ${theme.colors.border}`,
        backgroundColor: theme.colors.backgroundSecondary,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {title ? (
        hasMetadata ? (
          // Title doubles as the toggle for the rest of the front matter.
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <h1 style={titleStyle}>{title}</h1>
            {expanded ? (
              <ChevronDown
                size={20}
                color={theme.colors.textTertiary}
                style={{ flexShrink: 0 }}
              />
            ) : (
              <ChevronRight
                size={20}
                color={theme.colors.textTertiary}
                style={{ flexShrink: 0 }}
              />
            )}
          </button>
        ) : (
          <h1 style={titleStyle}>{title}</h1>
        )
      ) : null}

      {/* No title to collapse under → show the metadata inline. */}
      {(!title || expanded) && metadataBody}
    </header>
  );
};
