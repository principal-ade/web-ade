# web-ade Authentication Design Document

**Version:** 2.0
**Date:** 2025-11-12
**Author:** Principal AI Engineering Team
**Status:** Draft - Revised for Next.js API Proxy Architecture

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Background](#background)
3. [System Architecture](#system-architecture)
4. [Authentication Flow](#authentication-flow)
5. [Component Design](#component-design)
6. [Security Considerations](#security-considerations)
7. [Implementation Plan](#implementation-plan)
8. [API Specifications](#api-specifications)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Considerations](#deployment-considerations)

---

## Executive Summary

This document outlines the authentication architecture for **web-ade**, a browser-based IDE built with Next.js 16. The design leverages a **centralized authentication server** (landing-page) to provide OAuth authentication via WorkOS/GitHub, followed by integration with the **messaging server** for real-time collaboration features.

### Key Design Decisions

- **Next.js API Proxy Layer**: All external API calls go through web-ade's Next.js backend
- **Centralized Auth Server**: Use `landing-page` as the OAuth provider (same pattern as electron-app)
- **OAuth Provider**: WorkOS with GitHub OAuth backend
- **Auth Flow**: PKCE-enhanced OAuth 2.0 for security (server-to-server)
- **Token Management**: HTTP-only cookies managed by Next.js server (never exposed to browser)
- **Real-time Integration**: JWT-based WebSocket authentication with messaging server

### Benefits

- **Enhanced Security**: Tokens never exposed to browser (XSS-proof)
- **No CORS Issues**: Browser only calls same-origin Next.js API routes
- **Simplified Architecture**: Standard Next.js patterns (API routes + server actions)
- **Single Source of Truth**: Centralized auth across all Principal AI apps
- **Better Monitoring**: All API calls logged and monitored server-side
- **Rate Limiting**: Easy to implement on API routes
- **Cross-Application SSO**: Consistent experience across electron-app, web-ade, and CLI

---

## Background

### Current State

**web-ade** currently has:
- Basic three-panel IDE layout (file tree, AI chat, terminal)
- Mock AI chat integration
- No authentication system
- No real-time collaboration features

### Existing Infrastructure

1. **landing-page** (`https://principal-ade.com`)
   - Next.js application with WorkOS OAuth integration
   - Endpoints: `/api/auth/workos/start`, `/callback`, `/token`, `/refresh`
   - Already used by electron-app for authentication

2. **messaging-server** (Control Tower)
   - WebSocket-based real-time collaboration server
   - JWT authentication with Bearer tokens
   - Endpoints: `/api/auth/exchange`, `/api/register`
   - WebSocket endpoint: `ws://localhost:3001/ws`

### Requirements

1. **Authentication**
   - Users must authenticate with GitHub via WorkOS
   - Tokens must be stored securely (XSS/CSRF protection)
   - Support token refresh for long-lived sessions

2. **Real-time Collaboration**
   - Connect to messaging server with authenticated WebSocket
   - Support presence tracking and collaborative editing
   - Handle reconnection and token expiration

3. **User Experience**
   - Seamless login flow (redirect to landing-page)
   - Persistent sessions across browser refreshes
   - Clear error messages and recovery paths

---

## System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Browser"
        A[React Components]
        B[Auth Context]
        C[WebSocket Client]
    end

    subgraph "web-ade Next.js Server"
        D[API Routes]
        E[HTTP-only Cookies]
        F[Token Management]
    end

    subgraph "landing-page (Auth Server)"
        G[WorkOS OAuth Routes]
        H[Token Exchange]
        I[Session Store]
    end

    subgraph "External Services"
        J[WorkOS]
        K[GitHub OAuth]
        L[GitHub API]
    end

    subgraph "messaging-server"
        M[WebSocket Server]
        N[JWT Auth]
        O[Collaboration Engine]
    end

    A --> B
    B -->|fetch /api/auth/*| D
    D -->|server-to-server| G
    G --> J
    J --> K
    K --> J
    J --> G
    G -->|tokens| D
    D -->|Set HTTP-only cookies| E
    E -->|Cookies on requests| D
    D -->|GitHub API calls| L
    D -->|Token exchange| M

    C -->|WebSocket + JWT| M
    M --> N
    N --> O

    style D fill:#4A90E2
    style E fill:#50C878
    style G fill:#FFB74D
    style M fill:#FF6B6B
```

### Component Overview

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **web-ade** | Next.js 16, React 19 | Browser-based IDE interface |
| **landing-page** | Next.js, WorkOS SDK | Centralized OAuth authentication server |
| **messaging-server** | Node.js, WebSocket | Real-time collaboration backend |
| **WorkOS** | SaaS | OAuth orchestration and user management |
| **GitHub** | OAuth Provider | Source of GitHub tokens and user identity |

---

## Authentication Flow

### Full OAuth Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant Browser as web-ade<br/>(Browser)
    participant NextAPI as web-ade<br/>(Next.js API)
    participant Landing as landing-page<br/>(Auth Server)
    participant WorkOS
    participant GitHub
    participant MsgServer as messaging-server

    Note over User,MsgServer: Phase 1: Authentication Start
    User->>Browser: Click "Login with GitHub"
    Browser->>NextAPI: POST /api/auth/login

    NextAPI->>NextAPI: Generate PKCE Challenge<br/>(code_verifier, code_challenge)
    NextAPI->>NextAPI: Generate random state
    NextAPI->>NextAPI: Store challenge+verifier<br/>in server session

    NextAPI->>Landing: POST /api/auth/workos/start<br/>{code_challenge, state, return_url}
    Landing->>Landing: Store session<br/>(challenge, state, 5min TTL)
    Landing->>WorkOS: Get authorization URL
    WorkOS-->>Landing: auth_url
    Landing-->>NextAPI: {auth_url}

    NextAPI-->>Browser: redirect(auth_url)

    Note over User,MsgServer: Phase 2: OAuth Authorization
    Browser->>Landing: Redirect to auth_url
    Landing->>WorkOS: Initiate OAuth
    WorkOS->>GitHub: OAuth consent screen
    User->>GitHub: Authorize app
    GitHub-->>WorkOS: Authorization code
    WorkOS-->>Landing: Callback with code

    Note over User,MsgServer: Phase 3: Token Exchange (Server-Side)
    Landing->>WorkOS: Exchange code for tokens
    WorkOS->>GitHub: Validate authorization
    GitHub-->>WorkOS: GitHub access token
    WorkOS-->>Landing: {access_token, refresh_token, user}

    Landing->>Landing: Store tokens in session<br/>(keyed by state)
    Landing->>GitHub: GET /user<br/>(verify user data)
    GitHub-->>Landing: User profile

    Landing->>Browser: Redirect to callback URL<br/>web-ade.com/auth/callback?state=xxx

    Note over User,MsgServer: Phase 4: Token Retrieval (PKCE - Server-Side)
    Browser->>NextAPI: GET /auth/callback?state=xxx
    NextAPI->>NextAPI: Retrieve code_verifier<br/>from server session
    NextAPI->>Landing: POST /api/auth/workos/token<br/>{state, code_verifier}
    Landing->>Landing: Validate PKCE:<br/>hash(code_verifier) == code_challenge
    Landing-->>NextAPI: {github_token, workos_token,<br/>refresh_token, user, expires_in}

    NextAPI->>NextAPI: Store tokens in<br/>HTTP-only cookies
    NextAPI-->>Browser: Set-Cookie + redirect to dashboard

    Browser->>Browser: Update AuthContext<br/>(user data only, no tokens)
    Browser->>User: Show authenticated UI

    Note over User,MsgServer: Phase 5: Messaging Server Connection
    Browser->>NextAPI: POST /api/messaging/connect<br/>{repoId, agentId}
    NextAPI->>NextAPI: Get GitHub token<br/>from HTTP-only cookie
    NextAPI->>MsgServer: POST /api/auth/exchange<br/>{githubToken, repoId, agentId}
    MsgServer->>MsgServer: Validate GitHub token<br/>Generate JWT sync token
    MsgServer-->>NextAPI: {syncToken, wsUrl, expiresIn}
    NextAPI-->>Browser: {syncToken, wsUrl}

    Browser->>MsgServer: WebSocket connect<br/>Authorization: Bearer {syncToken}
    MsgServer->>MsgServer: Validate JWT
    MsgServer-->>Browser: connection: {clientId, authenticated}

    Browser->>MsgServer: join_room: {room: "repo/123"}
    MsgServer-->>Browser: room_joined: {room, users}

    Note over User,MsgServer: ✓ Fully Authenticated & Connected
```

### PKCE Flow Detail

```mermaid
graph TD
    A[Generate Random Bytes<br/>32 bytes] --> B[Base64URL Encode<br/>code_verifier]
    B --> C[SHA-256 Hash]
    C --> D[Base64URL Encode<br/>code_challenge]

    D --> E[Send to Auth Server<br/>code_challenge only]
    B --> F[Store in Next.js Server<br/>session/memory]

    E --> G[landing-page stores challenge<br/>in session map]

    H[User completes OAuth] --> I[Callback hits Next.js API<br/>with state param]
    I --> J[Next.js retrieves<br/>code_verifier from session]
    J --> K[POST /token to landing-page<br/>state + code_verifier]

    G --> L[landing-page retrieves<br/>stored challenge]
    K --> L

    L --> M{Verify:<br/>hash verifier<br/>== challenge?}
    M -->|Yes| N[Issue Tokens to Next.js]
    M -->|No| O[Reject: Invalid PKCE]

    N --> P[Next.js sets HTTP-only cookies]

    style A fill:#E8F5E9
    style B fill:#E8F5E9
    style C fill:#E8F5E9
    style D fill:#E8F5E9
    style F fill:#90CAF9
    style P fill:#C8E6C9
    style O fill:#FFCDD2
```

### Token Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Unauthenticated

    Unauthenticated --> Authenticating: User clicks login
    Authenticating --> OAuth: Redirect to landing-page
    OAuth --> Callback: User authorizes
    Callback --> TokenExchange: PKCE verification
    TokenExchange --> Authenticated: Tokens stored

    Authenticated --> RefreshNeeded: Token expires soon<br/>(5 min before expiry)
    RefreshNeeded --> Refreshing: Call /refresh endpoint
    Refreshing --> Authenticated: New tokens issued
    Refreshing --> Unauthenticated: Refresh failed

    Authenticated --> Unauthenticated: User logs out
    Authenticated --> Unauthenticated: Token revoked

    Authenticated --> WebSocketConnecting: Connect to messaging server
    WebSocketConnecting --> WebSocketConnected: JWT valid
    WebSocketConnected --> Authenticated: Connection active
    WebSocketConnected --> Reconnecting: Connection lost
    Reconnecting --> WebSocketConnected: Reconnect success
    Reconnecting --> TokenExchange: Token expired
```

### Session Storage Architecture

```mermaid
graph LR
    subgraph "Browser (web-ade)"
        A[HTTP-only Cookies]
        B[Auth Context State]
    end

    subgraph "web-ade Next.js Server"
        C[Server Session]
        D[HTTP-only Cookies Storage]
    end

    subgraph "landing-page Server"
        E[In-Memory Map]
        F[Session Data]
    end

    A -->|Auto-sent with requests| D
    D -->|Contains| G[github_token<br/>workos_token<br/>refresh_token<br/>expires_at]

    B -->|User data only| H[user profile<br/>isAuthenticated<br/>NO TOKENS]

    C -->|Temporary| I[PKCE code_verifier<br/>state<br/>5 min TTL]

    E -->|5 min TTL| F
    F -->|Contains| J[code_challenge<br/>state<br/>tokens<br/>created_at]

    style A fill:#81C784
    style B fill:#FFE082
    style C fill:#90CAF9
    style D fill:#4CAF50
    style E fill:#90CAF9
```

---

## Component Design

### 1. Next.js API Routes (Server-Side)

**Files:**
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/callback/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/refresh/route.ts`
- `src/app/api/auth/me/route.ts`

```mermaid
classDiagram
    class AuthLoginAPI {
        +POST() Promise~Response~
        -generatePKCE() Object
        -storeSession(state, verifier) void
    }

    class AuthCallbackAPI {
        +GET(request) Promise~Response~
        -getSession(state) Object
        -exchangeToken(verifier, state) Promise~TokenResponse~
        -setAuthCookies(tokens) void
    }

    class AuthLogoutAPI {
        +POST() Promise~Response~
        -clearAuthCookies() void
    }

    class AuthMeAPI {
        +GET(request) Promise~Response~
        -getTokenFromCookie() string
        -fetchUserProfile() Promise~User~
    }

    class TokenResponse {
        +string github_access_token
        +string workos_access_token
        +string refresh_token
        +number expires_in
        +User user
    }

    class User {
        +string login
        +string email
        +string name
        +number id
    }

    AuthLoginAPI --> AuthCallbackAPI
    AuthCallbackAPI --> TokenResponse
    TokenResponse --> User
    AuthMeAPI --> User
```

**Key Endpoints:**

- `POST /api/auth/login`: Generates PKCE, redirects to OAuth
- `GET /api/auth/callback`: Exchanges PKCE verifier for tokens, sets HTTP-only cookies
- `POST /api/auth/logout`: Clears cookies and session
- `POST /api/auth/refresh`: Refreshes expired tokens
- `GET /api/auth/me`: Returns current user info (from cookie)

### 2. Auth Context Provider

**File:** `src/contexts/AuthContext.tsx`

```mermaid
graph TD
    A[AuthProvider Component] --> B[AuthState]

    B --> D[isAuthenticated: boolean]
    B --> E[user: User | null]
    B --> H[isLoading: boolean]

    A --> I[Methods]
    I --> J[login via /api/auth/login]
    I --> K[logout via /api/auth/logout]
    I --> L[fetchUser via /api/auth/me]

    M[useAuth Hook] --> A
    N[React Components] --> M

    style A fill:#4A90E2
    style B fill:#50C878
    style I fill:#FFB74D
```

**State Management (Browser-Side):**

1. **Initial Load**: Call `/api/auth/me` to check if authenticated (cookies sent automatically)
2. **Login**: Redirect to `/api/auth/login` (server handles PKCE + OAuth)
3. **Callback**: Server route handles token exchange, sets cookies, redirects to app
4. **Refresh**: Automatically call `/api/auth/refresh` before expiry
5. **Logout**: Call `/api/auth/logout` to clear cookies

**Important:** Browser state contains **NO TOKENS**, only user profile data and authentication status

### 3. Messaging Client

**File:** `src/lib/messaging/client.ts`

```mermaid
classDiagram
    class MessagingClient {
        -WebSocket ws
        -string githubToken
        -string syncToken
        -Map~string,Function~ messageHandlers

        +constructor(githubToken)
        +connect(repoId, agentId) Promise~void~
        +disconnect() void
        +joinRoom(roomId) void
        +leaveRoom(roomId) void
        +broadcastEvent(event) void
        +onMessage(type, handler) void
        -handleMessage(message) void
    }

    class ConnectionState {
        <<enumeration>>
        DISCONNECTED
        CONNECTING
        CONNECTED
        RECONNECTING
        ERROR
    }

    class MessageType {
        <<enumeration>>
        authenticate
        join_room
        leave_room
        broadcast_event
        request_lock
        release_lock
        ping
    }

    MessagingClient --> ConnectionState
    MessagingClient --> MessageType
```

**Connection Flow:**

```mermaid
sequenceDiagram
    participant Client as MessagingClient
    participant Exchange as /api/auth/exchange
    participant WS as WebSocket Server

    Client->>Exchange: POST {githubToken, repoId, agentId}
    Exchange->>Exchange: Validate GitHub token<br/>Generate JWT
    Exchange-->>Client: {syncToken, wsUrl}

    Client->>WS: Connect with Bearer token
    WS->>WS: Validate JWT
    WS-->>Client: connection message

    Client->>WS: join_room {room: "repo/123"}
    WS-->>Client: room_joined

    loop Heartbeat
        Client->>WS: ping
        WS-->>Client: pong
    end
```

### 4. UI Components

```mermaid
graph TD
    A[App Layout] --> B[AuthProvider]
    B --> C{isAuthenticated?}

    C -->|No| D[LoginButton]
    C -->|Yes| E[Authenticated UI]

    E --> F[UserMenu]
    E --> G[EditorLayout]
    E --> H[MessagingProvider]

    D --> I[onClick: login]

    F --> J[User Avatar]
    F --> K[Dropdown Menu]
    K --> L[Profile]
    K --> M[Settings]
    K --> N[Logout Button]

    H --> O[PresenceIndicator]
    H --> P[CollaboratorList]
    H --> Q[ActivityFeed]

    style C fill:#FFD700
    style D fill:#FF6B6B
    style E fill:#50C878
```

**Component Hierarchy:**

- `<AuthProvider>` - Root auth state
  - `<LoginButton>` - Unauthenticated view
  - `<AuthenticatedLayout>` - Protected routes
    - `<UserMenu>` - Profile and logout
    - `<MessagingProvider>` - Real-time context
      - `<EditorLayout>` - Main IDE interface
        - `<PresenceIndicator>` - Online users
        - `<CollaboratorList>` - Active collaborators

---

## Security Considerations

### Threat Model

```mermaid
graph TD
    A[web-ade Security] --> B[Browser Threats]
    A --> C[Network Threats]
    A --> D[Server Threats]

    B --> B1[XSS Attacks]
    B --> B2[CSRF Attacks]
    B --> B3[Token Theft]

    C --> C1[Man-in-the-Middle]
    C --> C2[Packet Sniffing]
    C --> C3[DNS Hijacking]

    D --> D1[Token Replay]
    D --> D2[Session Hijacking]
    D --> D3[PKCE Bypass]

    style B1 fill:#FFCDD2
    style B2 fill:#FFCDD2
    style B3 fill:#FFCDD2
    style C1 fill:#FFE082
    style C2 fill:#FFE082
    style C3 fill:#FFE082
    style D1 fill:#B39DDB
    style D2 fill:#B39DDB
    style D3 fill:#B39DDB
```

### Security Measures

#### 1. PKCE (Proof Key for Code Exchange)

**Protection Against:** Authorization code interception attacks

**Implementation:**
- Generate cryptographically random `code_verifier` (32 bytes)
- Create `code_challenge` = BASE64URL(SHA256(code_verifier))
- Send only challenge to auth server
- Server validates verifier on token exchange

**Why It Matters:** Even if an attacker intercepts the authorization code, they cannot exchange it for tokens without the original `code_verifier`.

#### 2. State Parameter Validation

**Protection Against:** CSRF attacks during OAuth callback

**Implementation:**
- Generate random state (16 bytes) before auth
- Store in sessionStorage
- Validate state matches on callback

**Attack Scenario Prevented:**
```
Attacker creates malicious auth URL → Victim clicks →
Without state validation: Attacker's account linked to victim's session ✗
With state validation: Request rejected (state mismatch) ✓
```

#### 3. Token Storage Options

**Option A: localStorage (Simple but vulnerable)**

```mermaid
graph LR
    A[Tokens in localStorage] --> B{XSS Attack}
    B -->|Script injected| C[Access localStorage]
    C --> D[Steal all tokens]
    D --> E[Attacker authenticated]

    style A fill:#FFCDD2
    style E fill:#FFCDD2
```

❌ **Vulnerable to:** XSS attacks (malicious scripts can read localStorage)

**Option B: HTTP-only Cookies (Recommended)**

```mermaid
graph LR
    A[Tokens in HTTP-only Cookies] --> B{XSS Attack}
    B -->|Script injected| C[Try access cookies]
    C --> D[Blocked by browser]

    style A fill:#C8E6C9
    style D fill:#C8E6C9
```

✓ **Protected from:** XSS (JavaScript cannot read HTTP-only cookies)
✓ **Secure flag:** Only sent over HTTPS
✓ **SameSite flag:** CSRF protection

**Recommended Configuration:**
```typescript
cookies().set('github_token', token, {
  httpOnly: true,      // No JS access
  secure: true,        // HTTPS only
  sameSite: 'lax',     // CSRF protection
  maxAge: 3600,        // 1 hour
  path: '/',
  domain: '.principal-ai.com' // Share across subdomains
});
```

#### 4. No CORS Issues (Same-Origin Architecture)

**Benefit:** Since all browser requests go to web-ade's Next.js server (same origin), CORS is not a concern.

```mermaid
graph TD
    A[Browser Request] --> B{Origin Check}
    B -->|Same Origin| C[✓ No CORS needed]
    B -->|Cross Origin| D[N/A - Never happens]

    C --> E[Next.js API Route]
    E --> F[Server-to-Server Call<br/>to landing-page]
    F --> G[No CORS for<br/>server-to-server]

    style C fill:#C8E6C9
    style E fill:#4A90E2
    style G fill:#C8E6C9
```

**Architecture Benefits:**
- ✅ **Browser → web-ade API**: Same origin (no CORS)
- ✅ **web-ade server → landing-page**: Server-to-server (no CORS)
- ✅ **web-ade server → GitHub API**: Server-to-server (no CORS)

**Note:** CORS is only configured on landing-page to allow web-ade's **server** IP/domain to call it, not the browser. This is optional and can use API keys or IP whitelisting instead.

#### 5. Token Expiration & Rotation

```mermaid
gantt
    title Token Lifecycle (1 hour access token)
    dateFormat HH:mm
    axisFormat %H:%M

    section Access Token
    Valid Period           :active, 00:00, 55m
    Warning Zone (5 min)   :crit, 00:55, 5m
    Expired                :done, 01:00, 5m

    section Refresh
    Auto Refresh Trigger   :milestone, 00:55, 0m
    New Token Issued       :milestone, 00:56, 0m
```

**Automatic Refresh Logic (Browser-Side):**
```typescript
// In AuthContext
useEffect(() => {
  const checkTokenExpiry = () => {
    // Browser doesn't know expiry time (tokens in HTTP-only cookies)
    // Instead, rely on API returning 401 when token expires
    // Or call /api/auth/refresh proactively every 50 minutes

    fetch('/api/auth/refresh', { method: 'POST' })
      .then(res => {
        if (res.ok) {
          console.log('Token refreshed successfully');
        } else if (res.status === 401) {
          // Refresh token expired, need to re-login
          logout();
        }
      });
  };

  // Proactive refresh every 50 minutes (tokens expire in 60 min)
  const interval = setInterval(checkTokenExpiry, 50 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```

#### 6. WebSocket Authentication

**Bearer Token Pattern:**
```mermaid
sequenceDiagram
    participant Client
    participant WS as WebSocket Server
    participant JWT as JWT Validator

    Client->>WS: Connect with<br/>Authorization: Bearer token
    WS->>JWT: Validate token
    JWT->>JWT: Check signature<br/>Check expiration<br/>Extract userId

    alt Token Valid
        JWT-->>WS: userId, permissions
        WS-->>Client: Connection accepted
    else Token Invalid
        JWT-->>WS: Validation failed
        WS->>Client: Close connection (401)
    end
```

**Security Measures:**
- JWT signature validation (HS256 or RS256)
- Expiration time check (1 hour default)
- Connection closure on auth failure (configurable)
- Heartbeat/ping for connection validation

### Security Checklist

**Server-Side (Next.js API Routes):**
- [ ] PKCE implemented with SHA-256 hashing (server-side)
- [ ] State parameter validated on callback
- [ ] Tokens stored in HTTP-only cookies (never exposed to browser)
- [ ] HTTPS enforced in production (Secure flag)
- [ ] SameSite cookies enabled (CSRF protection)
- [ ] Cookie domain properly configured
- [ ] Session management for PKCE verifiers (5 min TTL)
- [ ] Rate limiting on API routes (per IP and per session)
- [ ] Sensitive errors don't leak implementation details
- [ ] Logging of failed auth attempts

**Client-Side (Browser):**
- [ ] No tokens in localStorage, sessionStorage, or React state
- [ ] Token auto-refresh via `/api/auth/refresh`
- [ ] Automatic logout on 401 responses
- [ ] No CORS configuration needed (same-origin)

**External Services:**
- [ ] WebSocket connections use Bearer tokens (sync token from `/api/messaging/connect`)
- [ ] JWT signatures validated on messaging server
- [ ] landing-page server IP/domain whitelisting (optional)

---

## Implementation Plan

### Phase 1: Foundation (Week 1)

```mermaid
gantt
    title Phase 1: Auth Foundation
    dateFormat YYYY-MM-DD
    section Setup
    Environment configuration      :a1, 2025-11-12, 1d
    Install dependencies          :a2, after a1, 1d
    section Core Auth
    LandingPageAuthClient         :b1, after a2, 2d
    AuthContext & Provider        :b2, after b1, 2d
    section UI
    Login/Callback pages          :c1, after b2, 1d
    Basic testing                 :c2, after c1, 1d
```

**Tasks:**
1. Create `.env.local` with landing-page URL and session secret
2. Install dependencies: `iron-session` for server-side session management
3. Implement Next.js API Routes:
   - `/api/auth/login/route.ts` - PKCE generation, OAuth redirect
   - `/api/auth/callback/route.ts` - Token exchange, set HTTP-only cookies
   - `/api/auth/me/route.ts` - Return current user from cookie
   - `/api/auth/logout/route.ts` - Clear cookies
   - `/api/auth/refresh/route.ts` - Refresh tokens
4. Create utility functions:
   - `src/lib/auth/pkce.ts` - PKCE generation (server-side)
   - `src/lib/auth/session.ts` - Session management helpers
   - `src/lib/auth/cookies.ts` - Cookie helper functions
5. Create `AuthContext.tsx` (browser-side)
   - State management (user data only, NO tokens)
   - Call `/api/auth/me` on mount
   - Token refresh logic (calls `/api/auth/refresh`)
6. Build auth UI:
   - Login button component (calls `/api/auth/login`)
   - Auth callback page (redirects after server sets cookies)
7. Test OAuth flow end-to-end

**Implementation Status:**
- [x] Environment configuration (`.env.local`, `.env.example`)
- [x] Dependencies installed (`iron-session`)
- [x] Utility functions created:
  - [x] `src/lib/auth/pkce.ts` - PKCE generation with SHA-256
  - [x] `src/lib/auth/session.ts` - Iron-session management
  - [x] `src/lib/auth/cookies.ts` - HTTP-only cookie helpers
- [x] API Routes implemented:
  - [x] `POST /api/auth/login` - Initiates OAuth with PKCE
  - [x] `GET /api/auth/callback` - Token exchange and cookie setting
  - [x] `GET /api/auth/me` - User profile from GitHub API
  - [x] `POST /api/auth/logout` - Clear all cookies
  - [x] `POST /api/auth/refresh` - Token refresh
- [x] `AuthContext.tsx` created with auto-refresh logic
- [ ] Login button component (pending)
- [ ] Auth callback page route (pending)
- [ ] End-to-end testing (pending)

**Success Criteria:**
- [ ] User can click login and complete OAuth
- [x] Tokens stored in HTTP-only cookies (not accessible to browser JS)
- [x] Page refresh maintains auth state via `/api/auth/me`
- [x] Logout clears cookies properly
- [x] Browser never has access to GitHub token

### Phase 2: Messaging Integration (Week 2)

```mermaid
gantt
    title Phase 2: Real-time Messaging
    dateFormat YYYY-MM-DD
    section Messaging Client
    Token exchange implementation :a1, 2025-11-19, 2d
    WebSocket client class       :a2, after a1, 2d
    Message handling             :a3, after a2, 1d
    section Context
    MessagingContext provider    :b1, after a3, 2d
    Reconnection logic          :b2, after b1, 1d
```

**Tasks:**
1. Create Next.js API route:
   - `/api/messaging/connect/route.ts` - Proxy GitHub token exchange with messaging server
2. Create `MessagingClient.ts` (browser-side)
   - Call `/api/messaging/connect` to get sync token
   - WebSocket connection with Bearer token
   - Message handlers (join_room, broadcast_event, etc.)
3. Implement `MessagingContext.tsx`
   - Connection state management
   - Automatic reconnection
   - Room management
4. Add heartbeat/ping logic
5. Test connection lifecycle

**Success Criteria:**
- [ ] `/api/messaging/connect` exchanges GitHub token for sync token (server-side)
- [ ] Browser receives sync token (short-lived, OK to expose)
- [ ] WebSocket connects with Bearer auth
- [ ] Client can join/leave rooms
- [ ] Reconnection works after disconnect
- [ ] Heartbeat prevents idle timeouts

### Phase 3: UI Components (Week 3)

```mermaid
gantt
    title Phase 3: User Interface
    dateFormat YYYY-MM-DD
    section Components
    UserMenu & Avatar           :a1, 2025-11-26, 2d
    PresenceIndicator          :a2, after a1, 2d
    CollaboratorList           :a3, after a2, 1d
    section Integration
    EditorLayout integration   :b1, after a3, 2d
    Error handling & UI        :b2, after b1, 1d
```

**Tasks:**
1. Build `<UserMenu>` component
   - User avatar with dropdown
   - Profile information
   - Logout button
2. Create presence components
   - `<PresenceIndicator>` (online status)
   - `<CollaboratorList>` (active users)
3. Integrate with `<EditorLayout>`
4. Add error boundaries and loading states
5. Polish animations and transitions

**Success Criteria:**
- [ ] User menu displays authenticated user
- [ ] Logout works correctly
- [ ] Presence indicators show online users
- [ ] Error states have clear messaging
- [ ] Loading states prevent UI flicker

### Phase 4: Security & Production (Week 4)

```mermaid
gantt
    title Phase 4: Security Hardening
    dateFormat YYYY-MM-DD
    section Security
    HTTP-only cookie migration  :a1, 2025-12-03, 2d
    CORS configuration         :a2, after a1, 1d
    Rate limiting              :a3, after a2, 1d
    section Testing
    Security audit             :b1, after a3, 2d
    E2E testing               :b2, after b1, 2d
```

**Tasks:**
1. Production environment configuration
   - Ensure HTTPS enforced (Secure cookie flag)
   - Configure landing-page CORS for web-ade server (server-to-server calls)
   - Set proper cookie domain for production
2. Add rate limiting to Next.js API routes
   - `/api/auth/login` - 5 requests/minute per IP
   - `/api/auth/callback` - 10 requests/minute per IP
   - `/api/auth/refresh` - 20 requests/minute per session
3. Security audit
   - XSS testing (verify tokens not in DOM/JS)
   - CSRF testing (verify SameSite cookies)
   - Token replay testing
   - Cookie security flags verification
4. Create example GitHub API proxy routes
   - `/api/github/repos` - Example of proxying GitHub API calls
   - Demonstrate token usage from HTTP-only cookies
5. End-to-end testing
   - Auth flow
   - Token refresh
   - Logout
   - Messaging connection
   - GitHub API proxy calls

**Success Criteria:**
- [ ] Cookies properly configured in production (HttpOnly, Secure, SameSite)
- [ ] NO CORS issues (browser only calls same-origin Next.js API)
- [ ] Rate limiting prevents brute force
- [ ] Security audit passes (tokens never exposed to browser)
- [ ] E2E tests cover all auth paths
- [ ] Example GitHub API proxy working

---

## API Specifications

### web-ade Next.js API Routes (Client-Facing)

These are the endpoints that browser clients call. All external service calls happen server-side.

#### POST /api/auth/login

Initiates OAuth flow. Server generates PKCE challenge and redirects user.

**Request:**
```json
{}
```

**Response:**
```
HTTP 302 Redirect to landing-page OAuth URL
```

**Server-Side Actions:**
1. Generate PKCE code_verifier and code_challenge
2. Store verifier in server session (5 min TTL)
3. Call landing-page `/api/auth/workos/start`
4. Redirect user to OAuth URL

---

#### GET /api/auth/callback

Handles OAuth callback. Exchanges PKCE verifier for tokens and sets cookies.

**Request:**
```
GET /api/auth/callback?state=xxx&code=yyy
```

**Response:**
```
HTTP 302 Redirect to /dashboard
Set-Cookie: github_token=...; HttpOnly; Secure; SameSite=Lax
Set-Cookie: workos_token=...; HttpOnly; Secure; SameSite=Lax
Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Lax
```

**Server-Side Actions:**
1. Retrieve code_verifier from server session using state
2. Call landing-page `/api/auth/workos/token` with verifier
3. Receive tokens from landing-page
4. Set HTTP-only cookies
5. Redirect to dashboard

**Errors:**
- `400`: State mismatch or missing parameters
- `500`: Token exchange failed

---

#### GET /api/auth/me

Returns current authenticated user (from cookie).

**Request:**
```
GET /api/auth/me
Cookie: github_token=...; workos_token=...
```

**Response:**
```json
{
  "user": {
    "login": "johndoe",
    "email": "john@example.com",
    "name": "John Doe",
    "id": 12345,
    "avatar_url": "https://avatars.githubusercontent.com/u/12345"
  },
  "isAuthenticated": true
}
```

**Server-Side Actions:**
1. Read github_token from HTTP-only cookie
2. Call GitHub API `/user` endpoint
3. Return user profile

**Errors:**
- `401`: No valid token in cookie
- `500`: GitHub API error

---

#### POST /api/auth/refresh

Refreshes expired tokens.

**Request:**
```json
{}
```
_Cookies automatically sent_

**Response:**
```
HTTP 200 OK
Set-Cookie: github_token=...; HttpOnly; Secure; SameSite=Lax
Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Lax
```

**Server-Side Actions:**
1. Get refresh_token from HTTP-only cookie
2. Call landing-page `/api/auth/workos/refresh`
3. Update cookies with new tokens

**Errors:**
- `401`: Invalid or expired refresh token
- `500`: Refresh failed

---

#### POST /api/auth/logout

Clears authentication cookies.

**Request:**
```json
{}
```

**Response:**
```
HTTP 200 OK
Set-Cookie: github_token=; Max-Age=0
Set-Cookie: workos_token=; Max-Age=0
Set-Cookie: refresh_token=; Max-Age=0
```

---

#### POST /api/messaging/connect

Exchanges GitHub token for messaging server sync token.

**Request:**
```json
{
  "repoId": "principal-ai/web-ade",
  "agentId": "user-12345-device-abc"
}
```
_Cookies automatically sent_

**Response:**
```json
{
  "syncToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "wsUrl": "ws://localhost:3001/ws"
}
```

**Server-Side Actions:**
1. Get github_token from HTTP-only cookie
2. Call messaging-server `/api/auth/exchange`
3. Return sync token to browser for WebSocket connection

**Errors:**
- `401`: No valid GitHub token
- `500`: Messaging server error

---

#### GET /api/github/repos

Example GitHub API proxy endpoint.

**Request:**
```
GET /api/github/repos?per_page=30
Cookie: github_token=...
```

**Response:**
```json
[
  {
    "id": 123,
    "name": "web-ade",
    "full_name": "principal-ai/web-ade",
    "private": true
  }
]
```

**Server-Side Actions:**
1. Get github_token from HTTP-only cookie
2. Call `https://api.github.com/user/repos`
3. Return response to browser

---

### Landing Page Endpoints (Server-to-Server)

These endpoints are called by web-ade's Next.js server, not directly by the browser.

#### POST /api/auth/workos/start

Initiates OAuth flow with PKCE.

**Request:**
```json
{
  "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  "state": "xrandom16bytesxxx",
  "return_url": "https://web-ade.com/auth/callback"
}
```

**Response:**
```json
{
  "auth_url": "https://api.workos.com/sso/authorize?..."
}
```

**Errors:**
- `400`: Missing required parameters
- `500`: WorkOS API error

---

#### POST /api/auth/workos/token

Exchanges PKCE verifier for tokens.

**Request:**
```json
{
  "state": "xrandom16bytesxxx",
  "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
}
```

**Response:**
```json
{
  "github_access_token": "gho_16C7e42F292c6912E7710c838347Ae178B4a",
  "workos_access_token": "wos_01H1Q...",
  "refresh_token": "ref_01H1Q...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "login": "johndoe",
    "email": "john@example.com",
    "name": "John Doe",
    "id": 12345
  }
}
```

**Errors:**
- `400`: Authorization pending, invalid state, or invalid PKCE
- `404`: Session not found (expired)
- `500`: Token exchange failed

---

#### POST /api/auth/workos/refresh

Refreshes expired access token.

**Request:**
```json
{
  "refresh_token": "ref_01H1Q..."
}
```

**Response:**
```json
{
  "github_access_token": "gho_...",
  "workos_access_token": "wos_...",
  "refresh_token": "ref_...",
  "expires_in": 3600,
  "user": { ... }
}
```

**Errors:**
- `400`: Invalid or expired refresh token
- `500`: Refresh failed

---

### Messaging Server Endpoints

#### POST /api/auth/exchange

Exchanges GitHub token for messaging sync token.

**Request:**
```json
{
  "githubToken": "gho_16C7e42F292c6912E7710c838347Ae178B4a",
  "repoId": "principal-ai/web-ade",
  "agentId": "user-12345-device-abc"
}
```

**Response:**
```json
{
  "syncToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "wsUrl": "ws://localhost:3001/ws"
}
```

**Errors:**
- `401`: Invalid GitHub token
- `400`: Missing parameters

---

#### WebSocket /ws

Real-time collaboration WebSocket endpoint.

**Connection:**
```
ws://localhost:3001/ws
Headers:
  Authorization: Bearer <syncToken>
```

**Messages:**

**join_room:**
```json
{
  "type": "join_room",
  "room": "repo/principal-ai/web-ade",
  "permissions": ["read", "write"]
}
```

**broadcast_event:**
```json
{
  "type": "broadcast_event",
  "room": "repo/principal-ai/web-ade",
  "event": {
    "type": "cursor_move",
    "data": { "x": 100, "y": 200 }
  }
}
```

**ping:**
```json
{
  "type": "ping"
}
```

**Server Messages:**

**connection:**
```json
{
  "type": "connection",
  "clientId": "client-abc123",
  "authenticated": true,
  "userId": "user-12345"
}
```

**room_joined:**
```json
{
  "type": "room_joined",
  "room": "repo/principal-ai/web-ade",
  "users": ["user-12345", "user-67890"]
}
```

**event_broadcast:**
```json
{
  "type": "event_broadcast",
  "room": "repo/principal-ai/web-ade",
  "from": "user-67890",
  "event": { ... }
}
```

---

## Testing Strategy

### Unit Tests

```mermaid
graph TD
    A[Unit Tests] --> B[Auth Client]
    A --> C[PKCE Generation]
    A --> D[Token Validation]
    A --> E[Messaging Client]

    B --> B1[startAuth]
    B --> B2[handleCallback]
    B --> B3[refreshToken]

    C --> C1[code_verifier generation]
    C --> C2[code_challenge hashing]
    C --> C3[state generation]

    D --> D1[Token expiry check]
    D --> D2[Token format validation]

    E --> E1[Message handlers]
    E --> E2[Connection lifecycle]
```

**Test Files:**
- `__tests__/lib/auth/landing-page-client.test.ts`
- `__tests__/lib/auth/pkce.test.ts`
- `__tests__/lib/messaging/client.test.ts`
- `__tests__/contexts/AuthContext.test.tsx`

**Key Test Cases:**
```typescript
describe('LandingPageAuthClient', () => {
  it('generates cryptographically random PKCE challenge', async () => {
    const client = new LandingPageAuthClient();
    await client.generatePKCE();

    expect(client.codeVerifier).toHaveLength(43); // Base64URL encoded 32 bytes
    expect(client.codeChallenge).toHaveLength(43);
    expect(client.state).toHaveLength(22); // Base64URL encoded 16 bytes
  });

  it('validates state parameter on callback', async () => {
    sessionStorage.setItem('auth_state', 'expected-state');

    // Simulate callback with mismatched state
    window.location.search = '?state=wrong-state';

    await expect(client.handleCallback()).rejects.toThrow('State mismatch');
  });
});
```

### Integration Tests

```mermaid
sequenceDiagram
    participant Test as E2E Test
    participant WebADE
    participant Landing
    participant Mock as Mock WorkOS

    Test->>WebADE: Click login button
    WebADE->>Landing: POST /start
    Landing->>Mock: Get auth URL
    Mock-->>Landing: Mock auth_url
    Landing-->>WebADE: auth_url

    Test->>Mock: Simulate OAuth consent
    Mock->>Landing: Callback with code
    Landing-->>WebADE: Redirect to callback

    Test->>WebADE: Verify callback page
    WebADE->>Landing: POST /token
    Landing->>Mock: Exchange code
    Mock-->>Landing: Mock tokens
    Landing-->>WebADE: Tokens

    Test->>Test: Assert user authenticated
```

**Test Files:**
- `e2e/auth-flow.spec.ts`
- `e2e/messaging-connection.spec.ts`
- `e2e/token-refresh.spec.ts`

**Example E2E Test:**
```typescript
import { test, expect } from '@playwright/test';

test('complete OAuth flow', async ({ page, context }) => {
  // Start on web-ade
  await page.goto('http://localhost:3000');

  // Click login
  await page.click('button:has-text("Login with GitHub")');

  // Should redirect to landing-page
  await expect(page).toHaveURL(/principal-ade\.com/);

  // Mock OAuth (in test environment)
  await page.evaluate(() => {
    // Simulate successful OAuth
    window.location.href = 'http://localhost:3000/auth/callback?state=test';
  });

  // Wait for callback processing
  await page.waitForURL('http://localhost:3000');

  // Should be authenticated
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

  // Check localStorage
  const tokens = await page.evaluate(() => {
    return localStorage.getItem('auth_tokens');
  });

  expect(tokens).toBeTruthy();
  const parsed = JSON.parse(tokens);
  expect(parsed.github_token).toMatch(/^gho_/);
});
```

### Security Tests

**XSS Testing:**
```typescript
test('tokens not accessible via XSS', async ({ page }) => {
  await authenticateUser(page);

  // Try to inject script
  const stolenTokens = await page.evaluate(() => {
    try {
      // Attacker script attempting to steal tokens
      return localStorage.getItem('auth_tokens');
    } catch (e) {
      return null;
    }
  });

  // If using HTTP-only cookies, this should be null
  expect(stolenTokens).toBeNull();
});
```

**CSRF Testing:**
```typescript
test('callback rejects mismatched state', async ({ page }) => {
  await page.goto('http://localhost:3000/auth/callback?state=malicious');

  // Should show error
  await expect(page.locator('text=State mismatch')).toBeVisible();
});
```

**Token Replay Testing:**
```typescript
test('expired tokens rejected', async ({ page }) => {
  // Set expired token
  await page.evaluate(() => {
    localStorage.setItem('auth_tokens', JSON.stringify({
      github_token: 'gho_expired',
      expires_at: Date.now() - 1000, // Already expired
    }));
  });

  await page.goto('http://localhost:3000');

  // Should trigger refresh or logout
  await expect(page.locator('button:has-text("Login")')).toBeVisible();
});
```

---

## Deployment Considerations

### Environment Configuration

```mermaid
graph LR
    A[Environments] --> B[Development]
    A --> C[Staging]
    A --> D[Production]

    B --> B1[localhost:3000]
    B --> B2[landing-page: localhost:3000]
    B --> B3[messaging: localhost:3001]

    C --> C1[staging.web-ade.com]
    C --> C2[landing-page: staging.principal-ade.com]
    C --> C3[messaging: staging-msg.principal-ai.com]

    D --> D1[web-ade.principal-ai.com]
    D --> D2[landing-page: principal-ade.com]
    D --> D3[messaging: messaging.principal-ai.com]

    style D fill:#FFE082
```

### Environment Variables

**Development (.env.local):**
```bash
NEXT_PUBLIC_LANDING_PAGE_URL=http://localhost:3000
NEXT_PUBLIC_MESSAGING_SERVER_URL=ws://localhost:3001/ws
NODE_ENV=development
```

**Production (.env.production):**
```bash
NEXT_PUBLIC_LANDING_PAGE_URL=https://principal-ade.com
NEXT_PUBLIC_MESSAGING_SERVER_URL=wss://messaging.principal-ai.com/ws
NODE_ENV=production
```

### CORS Configuration Matrix

**Note:** With the Next.js proxy architecture, browser CORS is eliminated. Only server-to-server authentication matters.

| Caller | Target | CORS Needed? | Authentication Method |
|--------|--------|--------------|----------------------|
| **Browser** → web-ade Next.js | Same Origin | ❌ No | Cookies (automatic) |
| **web-ade Server** → landing-page | Server-to-Server | ❌ No* | API Key or IP whitelist |
| **web-ade Server** → GitHub API | Server-to-Server | ❌ No | Bearer token (GitHub) |
| **web-ade Server** → messaging-server | Server-to-Server | ❌ No* | Bearer token (sync token) |
| **Browser** → messaging-server (WebSocket) | Cross-Origin | ⚠️ Maybe** | Bearer token (sync token) |

\* Optional: Can use IP whitelisting or API keys instead of CORS
\** WebSocket CORS headers may be needed if messaging-server validates Origin header

### Deployment Checklist

**Pre-deployment:**
- [ ] Update environment variables for target environment
- [ ] Set `SESSION_SECRET` for iron-session encryption
- [ ] Configure landing-page IP whitelisting for web-ade server (optional)
- [ ] Enable HTTPS/WSS in production
- [ ] Set Secure flag on cookies (automatic in production)
- [ ] Set proper cookie domain (e.g., `.principal-ai.com`)
- [ ] Test OAuth flow in staging environment
- [ ] Verify token refresh works
- [ ] Test WebSocket connection with WSS
- [ ] Verify tokens NOT accessible in browser DevTools

**Post-deployment:**
- [ ] Monitor auth success/failure rates
- [ ] Verify NO CORS errors in browser console
- [ ] Verify tokens stored in HTTP-only cookies (not localStorage)
- [ ] Test cross-browser compatibility (Chrome, Firefox, Safari)
- [ ] Load testing for WebSocket connections
- [ ] Monitor token refresh frequency
- [ ] Monitor API proxy endpoint performance

### Monitoring & Observability

```mermaid
graph TD
    A[Monitoring] --> B[Auth Metrics]
    A --> C[WebSocket Metrics]
    A --> D[Error Tracking]

    B --> B1[Login success rate]
    B --> B2[Token refresh rate]
    B --> B3[OAuth latency]

    C --> C1[Active connections]
    C --> C2[Message throughput]
    C --> C3[Reconnection frequency]

    D --> D1[Auth failures]
    D --> D2[CORS errors]
    D --> D3[Token validation errors]
```

**Key Metrics:**
1. **Authentication Success Rate**: % of successful OAuth completions
2. **Token Refresh Rate**: How often tokens are refreshed
3. **WebSocket Connection Health**: Active connections, reconnections, errors
4. **CORS Errors**: Blocked requests from unknown origins
5. **Auth Latency**: Time from login click to authenticated state

---

## Appendices

### Appendix A: PKCE Specification

PKCE (RFC 7636) prevents authorization code interception attacks.

**Algorithm:**
1. Generate `code_verifier`: Random string (43-128 chars)
2. Generate `code_challenge`: BASE64URL(SHA256(code_verifier))
3. Send `code_challenge` to auth server on /start
4. Store `code_verifier` in client (sessionStorage)
5. Send `code_verifier` to auth server on /token
6. Server validates: SHA256(received_verifier) == stored_challenge

**Why SHA-256?**
- Stronger than plain transformation
- Server cannot derive verifier from challenge (one-way hash)
- Attacker cannot generate valid verifier even if they see challenge

### Appendix B: JWT Structure (Messaging Server)

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "sub": "user-12345",
  "iss": "dev-collab-auth-server",
  "iat": 1699889600,
  "exp": 1699893200,
  "permissions": ["read", "write"],
  "repository": "principal-ai/web-ade",
  "agentId": "user-12345-device-abc"
}
```

**Signature:**
```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

### Appendix C: Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Web Crypto API (SHA-256) | ✓ 37+ | ✓ 34+ | ✓ 11+ | ✓ 79+ |
| sessionStorage | ✓ All | ✓ All | ✓ All | ✓ All |
| localStorage | ✓ All | ✓ All | ✓ All | ✓ All |
| HTTP-only Cookies | ✓ All | ✓ All | ✓ All | ✓ All |
| WebSocket | ✓ All | ✓ All | ✓ All | ✓ All |
| SameSite Cookies | ✓ 51+ | ✓ 60+ | ✓ 12+ | ✓ 79+ |

**Minimum Requirements:**
- Chrome 51+
- Firefox 60+
- Safari 12+
- Edge 79+

### Appendix D: Glossary

- **PKCE**: Proof Key for Code Exchange - OAuth security extension
- **code_verifier**: Random string generated by client
- **code_challenge**: SHA-256 hash of code_verifier
- **state**: Random parameter to prevent CSRF attacks
- **Bearer Token**: Token authentication scheme (RFC 6750)
- **JWT**: JSON Web Token - Compact token format (RFC 7519)
- **HTTP-only Cookie**: Cookie inaccessible to JavaScript
- **SameSite Cookie**: Cookie CSRF protection attribute
- **XSS**: Cross-Site Scripting attack
- **CSRF**: Cross-Site Request Forgery attack
- **CORS**: Cross-Origin Resource Sharing policy

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-12 | Principal AI Team | Initial design document (browser-side auth) |
| 2.0 | 2025-11-12 | Principal AI Team | Revised for Next.js API proxy architecture |

---

## Summary of Architectural Changes (v2.0)

### Key Differences from v1.0

**v1.0 (Browser-Side Auth):**
- ❌ Browser directly called landing-page OAuth endpoints
- ❌ PKCE generated in browser, verifier stored in sessionStorage
- ❌ Tokens stored in localStorage or cookies (browser-accessible)
- ❌ Required CORS configuration between web-ade and landing-page
- ❌ Browser made direct calls to GitHub API and messaging-server
- ❌ Tokens vulnerable to XSS attacks

**v2.0 (Next.js API Proxy):**
- ✅ Browser calls Next.js API routes (same origin, no CORS)
- ✅ PKCE generated on Next.js server, verifier stored in server session
- ✅ Tokens stored in HTTP-only cookies (browser-inaccessible)
- ✅ No CORS needed between browser and web-ade
- ✅ All external API calls proxied through Next.js server
- ✅ Tokens completely protected from XSS

### Architecture Benefits

1. **Enhanced Security**
   - Tokens never exposed to browser JavaScript
   - XSS attacks cannot steal tokens
   - HTTP-only cookies with Secure and SameSite flags

2. **Simplified Development**
   - No CORS configuration needed for browser
   - Standard Next.js API route patterns
   - Easy to add new GitHub API proxies

3. **Better Control**
   - Centralized logging of all API calls
   - Easy rate limiting on API routes
   - Server-side session management

4. **Production Ready**
   - Follows Next.js best practices
   - Scalable server-side architecture
   - Compatible with edge deployment

### Implementation Flow

```
Browser Login:
  1. Click "Login" → POST /api/auth/login
  2. Server generates PKCE, redirects to OAuth
  3. User authorizes on GitHub
  4. OAuth callback → GET /api/auth/callback
  5. Server exchanges PKCE for tokens, sets HTTP-only cookies
  6. Redirect to dashboard

Browser GitHub API Call:
  1. Browser → POST /api/github/repos
  2. Server reads github_token from HTTP-only cookie
  3. Server → GitHub API with Bearer token
  4. Server → Browser with response
```

### Where Tokens Live

| Token Type | Location | Accessible By | Purpose |
|-----------|----------|---------------|---------|
| **GitHub Token** | HTTP-only cookie | Next.js server only | GitHub API calls |
| **WorkOS Token** | HTTP-only cookie | Next.js server only | WorkOS operations |
| **Refresh Token** | HTTP-only cookie | Next.js server only | Token refresh |
| **Sync Token (JWT)** | Browser memory (short-lived) | Browser + messaging-server | WebSocket auth |
| **User Profile** | React state (AuthContext) | Browser | UI display |

**Critical:** Browser **never** has access to GitHub/WorkOS tokens. Only short-lived sync tokens for WebSocket connections are exposed to the browser.

---

**End of Document**
