// Every value comes from .env, which is filled from `blocks projects get` and
// `blocks auth oidc-clients list`. Never hand typed.
export const blocksConfig = {
  apiUrl: import.meta.env.VITE_BLOCKS_API_URL,
  appDomain: import.meta.env.VITE_BLOCKS_APP_DOMAIN,
  oidcUrl: import.meta.env.VITE_BLOCKS_OIDC_URL,
  oidcClientId: import.meta.env.VITE_BLOCKS_OIDC_CLIENT_ID || "",
  oidcScope: import.meta.env.VITE_BLOCKS_OIDC_SCOPE || "openid profile",
  // The project's public tenant id, sent as the x-blocks-key header.
  xBlocksKey: import.meta.env.VITE_BLOCKS_X_BLOCKS_KEY,
}

export function isLoginConfigured(): boolean {
  return Boolean(
    blocksConfig.apiUrl && blocksConfig.oidcUrl && blocksConfig.oidcClientId
  )
}
