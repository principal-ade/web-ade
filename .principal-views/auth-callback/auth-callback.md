# Authentication Callback

## Overview

The authentication callback handles the OAuth 2.0 redirect flow after a user authenticates with WorkOS/GitHub. This is the critical step that exchanges authorization codes for access tokens and establishes the user's session.

## What Problem Does This Solve?

Users need to authenticate with GitHub to access repository data and perform actions on their behalf. The OAuth callback:

1. Validates the authentication response from the identity provider
2. Exchanges authorization codes for access tokens
3. Securely stores tokens in HTTP-only cookies
4. Redirects users to their intended destination

## Operations

### Happy Path Flow

1. **Callback Started** - Request received with authorization code and state parameter
2. **State Validated** - CSRF token verified, redirect URL extracted from state
3. **Tokens Received** - Authorization code exchanged for GitHub and WorkOS tokens
4. **Cookies Set** - Tokens stored in secure HTTP-only cookies
5. **Callback Complete** - User redirected to their destination

### Error Scenarios

- **Missing or invalid state parameter** - CSRF protection triggered
- **Invalid authorization code** - Token exchange failed
- **Cookie storage failure** - Session cannot be established

## Design Choices

### Why HTTP-only Cookies?

Tokens are stored in HTTP-only cookies rather than localStorage to prevent XSS attacks from accessing authentication credentials.

### Why State Parameter?

The state parameter serves dual purposes:
1. CSRF protection - contains a random token validated on callback
2. Redirect preservation - stores the user's intended destination URL

### Token Refresh Strategy

The refresh token is stored separately to enable silent token renewal without requiring re-authentication.
