import { createBlocksClient } from "@seliseblocks/client"

import { forceRefreshAccessToken, getValidAccessToken } from "./auth"
import { blocksConfig } from "./config"

// The one Blocks entry point for the app. Every Auth, IAM and Data call goes
// through this client, never a hand written fetch().
export const blocksClient = createBlocksClient({
  accessToken: () => getValidAccessToken(),
  apiUrl: blocksConfig.apiUrl,
  appDomain: blocksConfig.appDomain,
  onUnauthorized: () => forceRefreshAccessToken(),
  oidc: {
    clientId: blocksConfig.oidcClientId,
    scope: blocksConfig.oidcScope,
    url: blocksConfig.oidcUrl,
  },
  xBlocksKey: blocksConfig.xBlocksKey,
})
