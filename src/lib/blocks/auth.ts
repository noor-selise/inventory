import { blocksClient } from "./client"
import { blocksConfig } from "./config"
import { isJwtExpired } from "./jwt"

// Blocks hosted login keeps the session in a Secure, httpOnly cookie by default,
// so the app never sees a token. The bearer token cache below only fills when a
// tenant's OIDC config returns tokens in the response body instead.
// Follows the flow `blocks new web` scaffolds (blocks-iam-sso-oidc-implementation).
const TOKEN_KEY = "inventory:access-token"
const RETURN_KEY = "inventory:oidc-return-to"

export type CallbackResult =
  | { ok: true; returnTo: string }
  | { ok: false; message: string }

let cachedAccessToken: string | undefined
// Never persisted: a long lived refresh token readable from JS is an XSS risk.
let cachedRefreshToken: string | undefined
let refreshInFlight: Promise<string | undefined> | undefined

const sessionExpiredListeners = new Set<() => void>()

export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener)
  return () => sessionExpiredListeners.delete(listener)
}

function getAccessToken(): string | undefined {
  if (cachedAccessToken && !isJwtExpired(cachedAccessToken)) {
    return cachedAccessToken
  }
  const stored = sessionStorage.getItem(TOKEN_KEY)
  if (stored && !isJwtExpired(stored)) {
    cachedAccessToken = stored
    return stored
  }
  return undefined
}

function persistTokens(accessToken: string, refreshToken?: string) {
  cachedAccessToken = accessToken
  sessionStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) cachedRefreshToken = refreshToken
}

function clearLocalTokens() {
  cachedAccessToken = undefined
  cachedRefreshToken = undefined
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function getValidAccessToken(): Promise<string | undefined> {
  return getAccessToken() ?? forceRefreshAccessToken()
}

// Called on a 401. Concurrent callers share one refresh.
export async function forceRefreshAccessToken(): Promise<string | undefined> {
  const refreshToken = cachedRefreshToken
  if (!refreshToken) return undefined

  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(refreshToken).finally(() => {
      refreshInFlight = undefined
    })
  }
  return refreshInFlight
}

async function refreshAccessToken(
  refreshToken: string
): Promise<string | undefined> {
  let response: Awaited<ReturnType<typeof blocksClient.auth.oidc.refreshToken>>
  try {
    response = await blocksClient.auth.oidc.refreshToken({ refreshToken })
  } catch {
    // A network blip says nothing about the refresh token, so keep it.
    return undefined
  }

  const accessToken = response.access_token ?? response.accessToken
  if (!accessToken) {
    clearLocalTokens()
    await blocksClient.auth.logout({ refreshToken }).catch(() => undefined)
    for (const listener of sessionExpiredListeners) listener()
    return undefined
  }

  persistTokens(
    accessToken,
    response.refresh_token ?? response.refreshToken ?? refreshToken
  )
  return accessToken
}

// IAM is the source of truth for "signed in": userInfo() validates the cookie.
export async function fetchSessionClaims(): Promise<
  Record<string, unknown> | undefined
> {
  try {
    return await blocksClient.auth.userInfo()
  } catch {
    return undefined
  }
}

export async function startLogin(returnTo?: string): Promise<void> {
  if (!blocksConfig.oidcClientId) {
    throw new Error(
      "Login is not configured. Set VITE_BLOCKS_OIDC_CLIENT_ID in .env."
    )
  }
  sessionStorage.setItem(RETURN_KEY, returnTo || "/")
  await blocksClient.auth.idp.redirectToProvider()
}

export async function completeLogin(
  callbackUrl: string
): Promise<CallbackResult> {
  const returnTo = sessionStorage.getItem(RETURN_KEY) || "/"
  sessionStorage.removeItem(RETURN_KEY)

  const data = await blocksClient.auth.idp.callback(callbackUrl)
  if (data.error) {
    return { ok: false, message: data.error_description || data.error }
  }

  const accessToken = data.access_token ?? data.accessToken
  if (accessToken) {
    persistTokens(accessToken, data.refresh_token ?? data.refreshToken)
  }
  return { ok: true, returnTo }
}

export async function logout(): Promise<void> {
  await blocksClient.auth
    .logout({ refreshToken: cachedRefreshToken })
    .catch(() => undefined)
  clearLocalTokens()
}
