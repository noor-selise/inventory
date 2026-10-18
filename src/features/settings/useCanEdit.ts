import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { SETTINGS_EDITORS } from "@/features/team/roles"

// UI gating only (spec 0004 security model: "Settings Edit" for admins).
export function useCanEditSettings() {
  return useCurrentUser().hasRole(...SETTINGS_EDITORS)
}
