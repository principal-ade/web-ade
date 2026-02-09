# Token Status Check

## Purpose

The token status check provides clients with JWT token expiry information to enable proactive token refresh. Since authentication tokens are stored in HTTP-only cookies, JavaScript cannot read the expiry time directly.

## Operations

### Check Token Status

**Endpoint**: `GET /api/auth/token-status`

Returns the current authentication state and token expiry information:

- **Authenticated**: Token is valid, returns expiry timestamp and remaining time
- **Unauthenticated**: No valid token found in cookies
- **Error**: Exception occurred during token validation

## Response Fields

- `authenticated` (boolean): Whether the user has a valid token
- `expiresAt` (number | null): Unix timestamp when token expires
- `expiresIn` (number | null): Milliseconds until token expires
- `shouldRefresh` (boolean): True if within 5 minutes of expiry

## Design Choices

### HTTP-Only Cookies

Tokens are stored in HTTP-only cookies for security:
- Prevents XSS attacks from stealing tokens
- Requires server endpoint to check expiry
- Enables proactive refresh before expiration

### Refresh Window

The API includes a `shouldRefresh` flag when tokens have less than 5 minutes remaining. This gives the client enough time to:
1. Detect the refresh need
2. Make the refresh API call
3. Handle any refresh failures gracefully

### Error Handling

Token validation errors return HTTP 500 with error details. This allows the client to:
- Distinguish between "no token" (unauthenticated) and "token check failed" (error)
- Log errors for debugging
- Retry if appropriate

## Common Workflows

### Proactive Refresh

1. Client polls `/api/auth/token-status` periodically
2. When `shouldRefresh: true`, client calls `/api/auth/refresh`
3. New tokens are set in HTTP-only cookies
4. Client continues with valid session

### Session Validation

1. Before making authenticated requests, check token status
2. If unauthenticated, redirect to login
3. If authenticated but expiring soon, refresh first
4. Proceed with authenticated request
