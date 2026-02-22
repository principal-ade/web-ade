# Get Current User (Auth Me)

## Endpoint
`GET /api/auth/me`

## Description
Returns the current authenticated user's profile information. Reads the GitHub token from an HTTP-only cookie and fetches the user profile from GitHub's API.

## Flow
1. **Get Token** - Read GitHub token from HTTP-only cookie
2. **Fetch GitHub User** - Call GitHub API `/user` endpoint with token
3. **Token Sync** - Optionally sync token from central auth server if invalid
4. **Return User** - Respond with user profile (login, email, name, id, avatar_url)

## Responses

### Success (200)
```json
{
  "isAuthenticated": true,
  "user": {
    "login": "username",
    "email": "user@example.com",
    "name": "User Name",
    "id": 12345,
    "avatar_url": "https://avatars.githubusercontent.com/..."
  }
}
```

### Not Authenticated (401)
```json
{
  "error": "Not authenticated",
  "isAuthenticated": false
}
```

### Error (500)
```json
{
  "error": "Failed to fetch user",
  "message": "Error details",
  "isAuthenticated": false
}
```

## Source Files
- `src/app/api/auth/me/route.ts`
