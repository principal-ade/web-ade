'use client';

/**
 * CardPreview Component
 *
 * Displays the generated card image with sharing options.
 * Shows users exactly what will appear when they share on Twitter.
 */

import React, { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import Link from 'next/link';

interface CardPreviewProps {
  owner: string;
  repo: string;
  imageUrl: string;
  shareUrl: string;
}

export default function CardPreview({ owner, repo, imageUrl, shareUrl }: CardPreviewProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShareTwitter = () => {
    const text = `Check out ${owner}/${repo}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${owner}-${repo}-card.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: theme.colors.background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 20px',
      }}
    >
      {/* Header */}
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          marginBottom: '32px',
        }}
      >
        <Link
          href="/"
          style={{
            color: theme.colors.textMuted,
            textDecoration: 'none',
            fontSize: `${theme.fontSizes[1]}px`,
            fontFamily: theme.fonts.body,
          }}
        >
          &larr; Back to home
        </Link>
        <h1
          style={{
            fontSize: `${theme.fontSizes[4]}px`,
            fontWeight: theme.fontWeights.bold,
            color: theme.colors.text,
            marginTop: '16px',
            marginBottom: '8px',
            fontFamily: theme.fonts.heading,
          }}
        >
          {owner}/{repo}
        </h1>
        <p
          style={{
            fontSize: `${theme.fontSizes[1]}px`,
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
          }}
        >
          Share this card on Twitter - the preview below shows exactly what others will see.
        </p>
      </div>

      {/* Card Preview */}
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          aspectRatio: '1200 / 628',
          backgroundColor: theme.colors.surface,
          borderRadius: '12px',
          overflow: 'hidden',
          border: `1px solid ${theme.colors.border}`,
          position: 'relative',
        }}
      >
        {!imageLoaded && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                border: `3px solid ${theme.colors.border}`,
                borderTopColor: theme.colors.primary,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}
        <img
          src={imageUrl}
          alt={`${owner}/${repo} card`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
          onLoad={() => setImageLoaded(true)}
        />
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginTop: '24px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={handleShareTwitter}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: '#1DA1F2',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: `${theme.fontSizes[1]}px`,
            fontWeight: theme.fontWeights.medium,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1a8cd8')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1DA1F2')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </button>

        <button
          onClick={handleCopyLink}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: theme.colors.surface,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '8px',
            fontSize: `${theme.fontSizes[1]}px`,
            fontWeight: theme.fontWeights.medium,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = theme.colors.background)}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = theme.colors.surface)}
        >
          {copied ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Link
            </>
          )}
        </button>

        <button
          onClick={handleDownload}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: theme.colors.surface,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '8px',
            fontSize: `${theme.fontSizes[1]}px`,
            fontWeight: theme.fontWeights.medium,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = theme.colors.background)}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = theme.colors.surface)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PNG
        </button>
      </div>

      {/* Instructions */}
      <div
        style={{
          marginTop: '40px',
          padding: '24px',
          backgroundColor: theme.colors.surface,
          borderRadius: '12px',
          border: `1px solid ${theme.colors.border}`,
          maxWidth: '600px',
          width: '100%',
        }}
      >
        <h2
          style={{
            fontSize: `${theme.fontSizes[2]}px`,
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            marginBottom: '12px',
            fontFamily: theme.fonts.heading,
          }}
        >
          How it works
        </h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: '20px',
            color: theme.colors.textMuted,
            fontSize: `${theme.fontSizes[1]}px`,
            fontFamily: theme.fonts.body,
            lineHeight: 1.8,
          }}
        >
          <li>Click &quot;Share on X&quot; to compose a tweet with this card</li>
          <li>When you post the link, Twitter will show the card preview above</li>
          <li>Or download the PNG to share anywhere else</li>
        </ul>
      </div>
    </div>
  );
}
