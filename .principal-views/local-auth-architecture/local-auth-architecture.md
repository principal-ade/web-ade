# Local Authentication Architecture

## Overview

This document explains how authentication works when running web-ade locally with a local auth server. The architecture uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) for secure authentication via GitHub through WorkOS.

## Components

### web-ade (localhost:3001)
The main Next.js application that users interact with. It handles:
- Initiating the login flow
- Generating PKCE challenges
- Storing tokens in HTTP-only cookies
- Managing user sessions

### Auth Server (localhost:3002)
A separate Next.js application that handles OAuth coordination:
- Communicates with WorkOS API
- Manages OAuth redirects
- Exchanges authorization codes for tokens
- Provides token refresh endpoints

### External Services
- **WorkOS**: OAuth provider that handles the authentication flow
- **GitHub**: Identity provider where users authenticate

## Authentication Flow

1. **User initiates login** - Clicks login button in web-ade
2. **PKCE generation** - web-ade generates a cryptographic code_verifier and code_challenge
3. **OAuth start** - web-ade calls auth-server to begin OAuth flow
4. **User consent** - Browser redirects to GitHub for authorization
5. **OAuth callback** - GitHub redirects back to auth-server with auth code
6. **Redirect to web-ade** - Auth-server redirects to web-ade callback
7. **Token exchange** - web-ade exchanges PKCE verifier for tokens (server-to-server)
8. **Cookie storage** - web-ade stores tokens in HTTP-only cookies

## Security Design Decisions

### Why PKCE?
PKCE prevents authorization code interception attacks. The code_verifier is stored server-side in an encrypted session and never exposed to the browser.

### Why HTTP-only Cookies?
Tokens are stored in HTTP-only cookies to prevent XSS attacks. JavaScript cannot access these cookies, so even if an attacker injects malicious scripts, they cannot steal authentication tokens.

### Why Server-to-Server Token Exchange?
The actual token exchange happens between web-ade's backend and the auth-server. This keeps tokens out of browser history, logs, and network inspector tools visible to users.

### Cookie Domain Behavior
Cookies are scoped by domain, not port. Both `localhost:3001` and `localhost:3002` share the same cookie jar. However, web-ade sets its own cookies after receiving tokens server-to-server, so there's no cross-origin cookie confusion.

## Local Development Setup

1. Start auth-server: `cd auth-server && npm run dev` (runs on port 3002)
2. Start web-ade: `npm run dev` (runs on port 3001)
3. Configure web-ade `.env.local`:
   ```
   LANDING_PAGE_URL=http://localhost:3002
   AUTH_SERVER_URL=http://localhost:3002
   ```

## Error Scenarios

- **Invalid state parameter**: CSRF protection failed, restart login flow
- **PKCE verification failed**: Session expired, restart login flow
- **Token exchange failed**: Auth server communication error, check auth server is running
- **Refresh token expired**: User must re-authenticate
