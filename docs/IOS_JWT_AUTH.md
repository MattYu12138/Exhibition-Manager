# iOS 30-Day JWT Authentication

## Goal

The iOS app uses the existing shared `users` table and the same credentials as LIC Platform and Exhibition Manager. Existing web sessions remain unchanged.

## Token model

| Token | Lifetime | Storage | Purpose |
|---|---:|---|---|
| Access JWT | 1 hour | iOS Keychain | Bearer authentication for Platform and Exhibition APIs |
| Refresh token | 30 days | iOS Keychain; SHA-256 hash in shared SQLite | Obtain a new access token without asking for the password |

Access tokens use HS256, issuer `lummi-platform`, audience `lummi-ios`, and include `sub`, `username`, `type`, `ver`, and `jti`. Both Platform and Exhibition verify the same signature using `JWT_SECRET` from their separate server `.env` files.

## Security lifecycle

Login verifies the existing bcrypt password hash, creates an opaque refresh token, stores only its SHA-256 hash, and returns both tokens. Refresh checks that the token exists, has not been revoked, has not expired, and still belongs to an active user. Logout revokes the submitted refresh token and the current access token `jti`. Password changes increment `users.token_version` and revoke all refresh tokens for that user, invalidating all existing app sessions.

The API never returns or logs a plaintext password. Web cookies keep their existing three-hour lifetime and are not replaced by JWT.

## Endpoints

| Method | Endpoint | Authentication | Result |
|---|---|---|---|
| POST | `/api/auth/app-login` | Username and password | User, access token, refresh token and expiry values |
| POST | `/api/auth/refresh-token` | Refresh token body | New access token and remaining refresh lifetime |
| GET | `/api/auth/me` | Session or Bearer access token | Current user from the shared database |
| POST | `/api/auth/logout` | Bearer token; optional refresh token body | Revokes the current app session |

## Shared database additions

`users.token_version` invalidates all previously issued access tokens after a password change. `app_refresh_tokens` stores refresh token hashes, expiry and revocation state. `app_revoked_access_tokens` stores logged-out JWT IDs until their natural expiry.

## iOS behavior

The app saves tokens and the refresh expiry in Keychain. On launch it calls `/api/auth/me`; an expired access token triggers one refresh and one retry. When offline, cached user data may be used only while the 30-day refresh expiry is still valid. Failed refresh, explicit logout or password invalidation clears all Keychain authentication data.
