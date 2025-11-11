# Web ADE - Design Document

## Executive Summary

This document outlines the architecture and design decisions for the **Web ADE** project - a browser-based version of Principal ADE that will be deployed to `web.prod-domain.com` as part of the Principal ADE ecosystem.

**Last Updated**: November 10, 2025
**Status**: Design Phase

---

## Table of Contents

1. [Background & Context](#background--context)
2. [Current Architecture](#current-architecture)
3. [Goals & Requirements](#goals--requirements)
4. [Framework Decision: Next.js vs TanStack Start](#framework-decision-nextjs-vs-tanstack-start)
5. [Architecture Design](#architecture-design)
6. [WebSocket Strategy](#websocket-strategy)
7. [AWS Deployment Strategy](#aws-deployment-strategy)
8. [Code Sharing & Monorepo Strategy](#code-sharing--monorepo-strategy)
9. [Security & Authentication](#security--authentication)
10. [Migration Path](#migration-path)
11. [Success Criteria](#success-criteria)

---

## Background & Context

### Existing Projects

Principal ADE currently consists of three main projects:

1. **electron-app** (`Developer/electron-app`)
   - Desktop application built with Electron + React 19 + Webpack
   - Complex IDE-like features with panels, Monaco editor, terminal, etc.
   - Connects to repository-traffic-controller for real-time collaboration
   - Production-ready with 145+ releases

2. **landing-page** (`Developer/landing-page`)
   - Marketing/landing site built with Next.js 15.5.6
   - Deployed on AWS App Runner
   - Currently serves as a preview of the electron-app
   - Uses React 19 and shared UI libraries

3. **repository-traffic-controller** (`Developer/repository-traffic-controller`)
   - Real-time collaboration server built on Control Tower Core
   - WebSocket server providing:
     - Branch-aware resource locking
     - Room-based collaboration
     - JWT authentication
     - Presence management
   - **Already deployed** on AWS Lightsail
   - Production URL: `wss://repository-traffic-controller-production.rj36caac972nm.us-east-1.cs.amazonlightsail.com`

### Why Web ADE?

The goal is to move the web-based version from `landing-page` into its own dedicated project (`web-ade`) that:
- Provides a full-featured browser-based IDE experience
- Shares functionality with the desktop electron-app
- Can be accessed at `web.prod-domain.com`
- Leverages the existing repository-traffic-controller infrastructure

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Electron App (Desktop)                                     │
│  ~/Developer/electron-app                                   │
│  - Electron + React 19 + Webpack                           │
│  - Full IDE features                                        │
│  - Connects to repository-traffic-controller               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ WebSocket Client (wss://)
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Repository Traffic Controller (AWS Lightsail)              │
│  ~/Developer/repository-traffic-controller                  │
│  - Next.js + Control Tower Core                            │
│  - WebSocket server at /ws endpoint                        │
│  - JWT authentication                                       │
│  - Room/lock management                                     │
│  - Already deployed and production-tested                   │
└────────────────────▲────────────────────────────────────────┘
                     │
                     │
┌────────────────────┴────────────────────────────────────────┐
│  Landing Page (AWS App Runner)                              │
│  ~/Developer/landing-page                                   │
│  - Next.js 15.5.6                                          │
│  - Marketing site + preview                                 │
│  - Will remain as marketing site                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Goals & Requirements

### Functional Requirements

1. **Browser-Based IDE**: Full-featured development environment in the browser
2. **Real-Time Collaboration**: Connect to existing repository-traffic-controller for multi-user editing
3. **Feature Parity**: Eventually match electron-app capabilities (panels, editor, terminal, etc.)
4. **Authentication**: JWT-based auth compatible with repository-traffic-controller
5. **WebSocket Support**: Persistent WebSocket connections for real-time features

### Non-Functional Requirements

1. **Performance**: Fast initial load, responsive UI
2. **Scalability**: Handle multiple concurrent users
3. **Security**: Secure WebSocket connections, JWT validation
4. **Maintainability**: Share code with electron-app where possible
5. **Cost-Effective**: Leverage existing infrastructure
6. **Developer Experience**: Fast builds, hot reload, good debugging

### Constraints

1. Must use AWS for deployment (organizational requirement)
2. Must connect to existing repository-traffic-controller (no duplicate infrastructure)
3. Should share UI components with electron-app and landing-page
4. Subdomain must be `web.prod-domain.com`

---

## Framework Decision: Next.js vs TanStack Start

### Options Evaluated

We evaluated two modern React frameworks:
1. **Next.js 15** - Established full-stack React framework
2. **TanStack Start** - New full-stack framework built on TanStack Router + Vite

### Comparison Matrix

| Factor | Next.js | TanStack Start | Winner |
|--------|---------|----------------|--------|
| **Maturity** | Stable v15, battle-tested | Release Candidate, not v1.0 yet | Next.js |
| **Team Knowledge** | landing-page already uses it | New to team | Next.js |
| **React Server Components** | Full support now | "Coming soon" | Next.js |
| **Deployment** | Proven AWS patterns | Less documented | Next.js |
| **Ecosystem** | Massive plugins/community | Smaller, growing | Next.js |
| **Type Safety** | Good | Excellent (end-to-end) | TanStack Start |
| **Build Speed** | Good (Turbopack) | Excellent (Vite) | TanStack Start |
| **Bundle Size** | Larger | Smaller | TanStack Start |
| **Flexibility** | Opinionated | Less opinionated | TanStack Start |

### Decision: **Next.js 15**

**Rationale:**

1. **Risk Mitigation**: Production web app needs stability. TanStack Start's RC status introduces uncertainty around breaking changes, production patterns, and long-term support.

2. **Team Efficiency**:
   - landing-page already uses Next.js 15.5.6
   - Existing deployment knowledge with AWS App Runner
   - Can share components and patterns immediately

3. **Deployment Confidence**: Next.js + AWS is proven with clear guides, known scaling characteristics, and community-documented patterns.

4. **React Server Components**: Next.js has full RSC support now, TanStack Start is still working on it.

5. **WebSocket Architecture**: Since we're using repository-traffic-controller as the WebSocket server, we can deploy Next.js serverless (no custom server needed), getting the best of both worlds.

6. **Code Sharing**: Easier to share components between landing-page and web-ade if both use Next.js.

### When to Reconsider TanStack Start

Reevaluate in 6-12 months if:
- TanStack Start reaches v1.0 with stable API
- RSC support is fully implemented
- AWS deployment patterns are well-documented
- Team has bandwidth to learn new framework
- Performance becomes critical concern

---

## Architecture Design

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Electron App (Desktop)                                      │
│  - Local installation                                        │
│  - Full native features                                      │
└───────────────┬──────────────────────────────────────────────┘
                │
                │ WebSocket Client
                │
                ↓
┌──────────────────────────────────────────────────────────────┐
│  Repository Traffic Controller (AWS Lightsail)               │
│  wss://repository-traffic-controller-production...           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WebSocket Server (/ws)                             │   │
│  │  - Room management                                  │   │
│  │  - Lock management (branch-aware)                   │   │
│  │  - Presence tracking                                │   │
│  │  - JWT authentication                               │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────▲──────────────────────────────────────────────┘
                │
                │ WebSocket Client
                │
┌───────────────┴──────────────────────────────────────────────┐
│  Web ADE (AWS Amplify)                                       │
│  web.prod-domain.com                                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Next.js 15 App (Serverless)                        │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  App Router                                   │  │   │
│  │  │  - /app/page.tsx (landing)                    │  │   │
│  │  │  - /app/editor/page.tsx                       │  │   │
│  │  │  - /app/workspace/[id]/page.tsx               │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  │                                                      │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  Shared Components                            │  │   │
│  │  │  - @principal-ade/panel-layouts               │  │   │
│  │  │  - @principal-ade/industry-themed-*           │  │   │
│  │  │  - Monaco Editor                              │  │   │
│  │  │  - Terminal (xterm.js)                        │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  │                                                      │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  WebSocket Client Layer                       │  │   │
│  │  │  - Connects to repository-traffic-controller  │  │   │
│  │  │  - Room/lock management                       │  │   │
│  │  │  - Presence sync                              │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Landing Page (AWS App Runner)                               │
│  principal-ade.com                                           │
│  - Marketing content                                         │
│  - Links to web.prod-domain.com                            │
└──────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
web-ade/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Home page
│   │   ├── editor/                   # Editor routes
│   │   └── workspace/                # Workspace routes
│   │
│   ├── components/                   # React components
│   │   ├── panels/                   # Panel components
│   │   ├── editor/                   # Editor components
│   │   └── terminal/                 # Terminal components
│   │
│   ├── lib/
│   │   ├── websocket/                # WebSocket client
│   │   │   ├── client.ts             # WS connection management
│   │   │   ├── room-manager.ts       # Room operations
│   │   │   └── lock-manager.ts       # Lock operations
│   │   │
│   │   ├── auth/                     # Authentication
│   │   │   ├── jwt.ts                # JWT handling
│   │   │   └── github-oauth.ts       # GitHub OAuth
│   │   │
│   │   └── config/                   # Configuration
│   │       └── git-sync.ts           # Repository-traffic-controller config
│   │
│   ├── hooks/                        # React hooks
│   │   ├── useWebSocket.ts
│   │   ├── useRoomState.ts
│   │   └── usePresence.ts
│   │
│   └── types/                        # TypeScript types
│       └── control-tower.ts
│
├── public/                           # Static assets
├── docs/                             # Documentation
├── package.json
├── next.config.js
└── tsconfig.json
```

---

## WebSocket Strategy

### Key Decision: Client-Only Architecture

The web-ade will **NOT** run its own WebSocket server. Instead:

1. **Connect as Client**: Web-ade connects to the existing repository-traffic-controller
2. **Shared State**: Both electron-app and web-ade share the same collaboration state
3. **Serverless Deployment**: Web-ade can be fully serverless (no custom Next.js server needed)

### Configuration

Reuse the same approach as electron-app:

```typescript
// src/lib/config/git-sync.ts
export const GIT_SYNC_CONFIG = {
  SERVER_URL: 'wss://repository-traffic-controller-production.rj36caac972nm.us-east-1.cs.amazonlightsail.com',

  getWebSocketUrl: (serverUrl: string = GIT_SYNC_CONFIG.SERVER_URL): string => {
    if (serverUrl.startsWith('https://')) {
      return serverUrl.replace('https://', 'wss://');
    } else if (serverUrl.startsWith('http://')) {
      return serverUrl.replace('http://', 'ws://');
    }
    return serverUrl;
  },

  RECONNECT_DELAY: 5000,
  PING_INTERVAL: 30000,
  AUTH_TIMEOUT: 10000,
  AUTO_RECONNECT: true,
};
```

### WebSocket Client Implementation

```typescript
// src/lib/websocket/client.ts
import { GIT_SYNC_CONFIG } from '../config/git-sync';

export class ControlTowerClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  async connect(token: string): Promise<void> {
    const wsUrl = GIT_SYNC_CONFIG.SERVER_URL + '/ws';
    this.ws = new WebSocket(wsUrl);

    this.ws.addEventListener('open', () => {
      // Authenticate immediately after connection
      this.send({
        type: 'auth',
        token: token
      });
    });

    this.ws.addEventListener('message', (event) => {
      this.handleMessage(JSON.parse(event.data));
    });

    this.ws.addEventListener('close', () => {
      if (GIT_SYNC_CONFIG.AUTO_RECONNECT) {
        this.scheduleReconnect(token);
      }
    });
  }

  // ... rest of implementation
}
```

### Benefits of This Approach

1. **No Infrastructure Duplication**: Single WebSocket server for all clients
2. **Shared Collaboration State**: Users on desktop and web see the same state
3. **Cost Effective**: No additional server costs
4. **Proven Technology**: repository-traffic-controller is already production-tested
5. **Serverless Frontend**: Web-ade can be deployed serverless for better scaling
6. **Simplified Deployment**: No custom server configuration needed

---

## AWS Deployment Strategy

### Why AWS?

- Organizational requirement
- Existing infrastructure (repository-traffic-controller on Lightsail)
- landing-page already on AWS App Runner
- Team familiarity

### Deployment Options Considered

| Service | WebSocket Support | Next.js Support | Serverless | Complexity | Cost | Verdict |
|---------|-------------------|-----------------|------------|------------|------|---------|
| **App Runner** | Limited (problematic) | Good | No | Low | $$ | ❌ Not suitable |
| **Amplify Hosting** | Via API Gateway | Excellent | Yes | Low | $ | ✅ **Recommended** |
| **ECS Fargate + ALB** | Full | Good | No | High | $$$ | ⚠️ Overkill |
| **Elastic Beanstalk** | Full | Good | No | Medium | $$ | ⚠️ Dated |
| **Lightsail Containers** | Full | Good | No | Low | $ | ⚠️ Less scalable |

### Chosen Solution: **AWS Amplify Hosting**

**Why Amplify:**

1. **Next.js Native Support**: First-class Next.js support with SSR/SSG
2. **Serverless Architecture**: No server management, auto-scaling
3. **Easy Setup**: GitHub integration, simple deployment
4. **Custom Domains**: Easy subdomain configuration (`web.prod-domain.com`)
5. **Cost Effective**: Pay-per-use, free tier available
6. **CDN Built-In**: CloudFront integration for static assets
7. **WebSocket Strategy**: Since we're connecting to repository-traffic-controller as a client, we don't need server WebSocket support

### Amplify Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CloudFront CDN (Global)                                    │
│  web.prod-domain.com                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  AWS Amplify Hosting                                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Next.js App (Serverless Functions)                 │  │
│  │  - API Routes → Lambda@Edge                         │  │
│  │  - SSR Pages → Lambda Functions                     │  │
│  │  - Static Assets → S3 + CloudFront                  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Environment Variables                              │  │
│  │  - NEXT_PUBLIC_WS_URL                              │  │
│  │  - NEXT_PUBLIC_AUTH_URL                            │  │
│  │  - JWT_SECRET                                       │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Configuration

```yaml
# amplify.yml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

### Environment Configuration

```bash
# Amplify Environment Variables
NEXT_PUBLIC_WS_URL=wss://repository-traffic-controller-production.rj36caac972nm.us-east-1.cs.amazonlightsail.com
NEXT_PUBLIC_AUTH_URL=https://principal-ade.com
NODE_ENV=production
```

### Deployment Process

1. **Initial Setup**:
   ```bash
   # Install Amplify CLI
   npm install -g @aws-amplify/cli

   # Initialize Amplify in project
   cd ~/Developer/web-ade
   amplify init
   ```

2. **Configure Hosting**:
   ```bash
   amplify add hosting
   # Select: Amplify Console
   # Select: Next.js - SSR
   ```

3. **Configure Custom Domain**:
   - Go to Amplify Console
   - Add custom domain: `web.prod-domain.com`
   - Amplify auto-configures DNS with Route 53

4. **CI/CD Setup**:
   - Connect GitHub repository
   - Amplify auto-deploys on push to main
   - Preview deployments for PRs

5. **Deploy**:
   ```bash
   amplify publish
   ```

### Alternative: Manual CloudFormation

If Amplify CLI is problematic, use CloudFormation template (see `docs/cloudformation-template.yml`).

---

## Code Sharing & Monorepo Strategy

### Shared Libraries

Several UI components are already published as npm packages and shared across projects:

```json
{
  "dependencies": {
    "@principal-ade/panel-layouts": "^0.1.0",
    "@principal-ade/industry-themed-mdx-editor": "^0.1.12",
    "@principal-ade/industry-themed-monaco-editor": "^0.1.8",
    "@principal-ade/industry-themed-terminal": "^0.1.3",
    "@a24z/industry-theme": "^0.1.1",
    "@a24z/panels": "^1.0.34"
  }
}
```

### Code Sharing Approach

```
electron-app/
├── src/renderer/           # Electron UI code
│   ├── components/         # Can be extracted to shared packages
│   └── config/
│       └── git-sync.ts     # 👈 Share this pattern

landing-page/
├── src/
│   └── components/         # Marketing components

web-ade/
├── src/
│   ├── components/         # Web IDE components
│   ├── lib/
│   │   └── config/
│   │       └── git-sync.ts # 👈 Copy/adapt from electron-app
│   └── hooks/              # Can be shared via package
```

### Shared Package Creation Strategy

As web-ade matures, extract common functionality:

1. **@principal-ade/websocket-client**
   - WebSocket connection management
   - Room/lock operations
   - Shared by electron-app and web-ade

2. **@principal-ade/collaboration-hooks**
   - React hooks for presence, rooms, locks
   - usePresence, useRoom, useLock, etc.

3. **@principal-ade/editor-components**
   - Monaco editor configuration
   - Terminal components
   - File tree components

### Monorepo Consideration (Future)

Consider moving to a monorepo structure (pnpm workspaces, Turborepo) if:
- Code duplication becomes significant
- Need to coordinate changes across multiple projects
- Want unified versioning and releases

---

## Security & Authentication

### Authentication Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ 1. GitHub OAuth
       ↓
┌──────────────────────┐
│  principal-ade.com   │
│  (Auth Server)       │
└──────┬───────────────┘
       │
       │ 2. JWT Token
       ↓
┌──────────────────────┐
│  web.prod-domain.com │
│  (Web ADE)           │
└──────┬───────────────┘
       │
       │ 3. WebSocket Auth
       ↓
┌──────────────────────────────────────┐
│  repository-traffic-controller       │
│  (validates JWT)                     │
└──────────────────────────────────────┘
```

### JWT Structure

```typescript
interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  githubId: string;
  iat: number;
  exp: number;
}
```

### Security Considerations

1. **HTTPS/WSS Only**: All connections must use TLS
2. **JWT Expiration**: Tokens expire after 24 hours
3. **Token Refresh**: Implement refresh token flow
4. **CORS Configuration**: Restrict origins to known domains
5. **Rate Limiting**: Implement on API routes
6. **WebSocket Authentication**: Required within 5 seconds of connection

### Environment Secrets

```bash
# Store in AWS Secrets Manager
JWT_SECRET=<generate-secure-secret>
GITHUB_CLIENT_ID=<github-oauth-app-id>
GITHUB_CLIENT_SECRET=<github-oauth-secret>
```

---

## Migration Path

### Phase 1: Foundation (Weeks 1-2)

- [ ] Set up Next.js project structure
- [ ] Configure AWS Amplify hosting
- [ ] Implement basic authentication flow
- [ ] Set up subdomain: `web.prod-domain.com`
- [ ] Create landing page with login

### Phase 2: WebSocket Integration (Weeks 3-4)

- [ ] Implement WebSocket client library
- [ ] Connect to repository-traffic-controller
- [ ] Implement room management
- [ ] Add presence indicators
- [ ] Test with electron-app (multi-client)

### Phase 3: Core Editor Features (Weeks 5-8)

- [ ] Integrate Monaco editor
- [ ] Add file tree component
- [ ] Implement terminal (xterm.js)
- [ ] Add panel layout system
- [ ] Implement branch-aware locking

### Phase 4: Collaboration Features (Weeks 9-10)

- [ ] Real-time cursor sharing
- [ ] Live file editing
- [ ] Presence panel
- [ ] Conflict resolution UI

### Phase 5: Polish & Launch (Weeks 11-12)

- [ ] Performance optimization
- [ ] Security audit
- [ ] User testing
- [ ] Documentation
- [ ] Beta launch

---

## Success Criteria

### Technical Metrics

- [ ] Initial page load < 3 seconds
- [ ] WebSocket connection established < 1 second
- [ ] Support 100+ concurrent users
- [ ] 99.9% uptime
- [ ] No security vulnerabilities (OWASP Top 10)

### Feature Parity

- [ ] Monaco editor with syntax highlighting
- [ ] Terminal access
- [ ] File tree navigation
- [ ] Multi-panel layout
- [ ] Real-time collaboration
- [ ] Branch-aware locking

### Business Metrics

- [ ] 50+ users in first month
- [ ] 80% user satisfaction score
- [ ] < $100/month infrastructure costs initially
- [ ] Zero production incidents in first month

---

## Appendices

### A. References

- [Next.js 15 Documentation](https://nextjs.org/docs)
- [AWS Amplify Hosting Guide](https://docs.amplify.aws)
- [Control Tower Core NPM Package](https://www.npmjs.com/package/@principal-ai/control-tower-core)
- [repository-traffic-controller README](../repository-traffic-controller/README.md)

### B. Related Documents

- `../repository-traffic-controller/docs/architecture.md` - WebSocket server architecture
- `../electron-app/docs/PANEL_ARCHITECTURE.md` - Panel system design
- `../landing-page/README.md` - Landing page documentation

### C. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-11-10 | Choose Next.js over TanStack Start | Stability, team knowledge, RSC support |
| 2025-11-10 | Use AWS Amplify over App Runner | Better serverless support, Next.js optimization |
| 2025-11-10 | Client-only WebSocket architecture | Reuse repository-traffic-controller, avoid duplication |

---

## Contact & Ownership

**Project Owner**: Principal ADE Team
**Tech Lead**: TBD
**Repository**: `~/Developer/web-ade`

For questions or clarifications, please refer to the project README or create an issue in the repository.
