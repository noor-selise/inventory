import * as React from "react"
import { KeyRound, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { CheckboxField, TextField } from "@/components/app/form"
import { ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { blocksClient } from "@/lib/blocks/client"

// Two step login (spec 0003 AC-6) through blocksClient.mfa: each person enrolls
// their own account, and an admin sets the company policy. The challenge
// itself appears on the Blocks hosted login page, not in this app.
// MFA methods are the IAM UserMfaType numbers: 1 authenticator app, 2 email code.

const TOTP = 1
const EMAIL = 2
const METHOD_NAMES: Record<number, string> = { [TOTP]: "Authenticator app", [EMAIL]: "Email code" }

type Policy = { enabled?: boolean; allowedMethods?: (number | string)[]; requireMfaForAllUsers?: boolean; allowUserOptOut?: boolean; allowBackupCodes?: boolean; backupCodesCount?: number }

function ensureOk(response: Record<string, unknown>) {
  const errors = response?.errors as Record<string, string> | null | undefined
  if (response?.isSuccess === false || (errors && Object.keys(errors).length)) throw new Error(errors ? Object.values(errors).join(" ") : "The change was not accepted.")
  return response
}

/** Finds the QR picture and the secret in IAM's TOTP setup reply, whatever the field names. */
function readSetup(reply: Record<string, unknown>) {
  const flat: Record<string, unknown> = { ...reply, ...(reply.data as Record<string, unknown>) }
  const strings = Object.entries(flat).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  const image = strings.find(([, value]) => value.startsWith("data:image"))?.[1] ?? (strings.find(([key, value]) => /qr/i.test(key) && /^[A-Za-z0-9+/=]{200,}$/.test(value))?.[1] ? `data:image/png;base64,${strings.find(([key]) => /qr/i.test(key))![1]}` : undefined)
  const uri = strings.find(([, value]) => value.startsWith("otpauth://"))?.[1]
  const secret = strings.find(([key]) => /secret|key/i.test(key) && !/qr/i.test(key))?.[1] ?? (uri ? new URL(uri).searchParams.get("secret") ?? undefined : undefined)
  return { image, uri, secret }
}

export function SecurityPage() {
  const { user, isAdmin, reload } = useCurrentUser()
  const me = (user ?? {}) as Record<string, unknown>
  const enrolled = me.mfaEnabled === true || me.isMfaEnabled === true
  const method = Number(me.userMfaType ?? me.mfaType ?? 0)

  return (
    <>
      <PageHeader title="Security" description="Two step login for your own account, and the company rule for everyone." />
      <div className="flex flex-col gap-6">
        <MyTwoStep enrolled={enrolled} method={method} onChanged={() => void reload()} />
        {isAdmin ? <CompanyPolicy /> : null}
      </div>
    </>
  )
}

function MyTwoStep({ enrolled, method, onChanged }: { enrolled: boolean; method: number; onChanged: () => void }) {
  const [setup, setSetup] = React.useState<ReturnType<typeof readSetup>>()
  const [code, setCode] = React.useState("")
  const [codes, setCodes] = React.useState<string[]>()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const remaining = useResource(async () => (enrolled ? Number((await blocksClient.mfa.backupCodes.list()).remaining ?? 0) : null), [enrolled])

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      toast.success(success)
      onChanged()
      void remaining.reload()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      title="Your two step login"
      description="After your password, Blocks asks for a code from your authenticator app or your email."
      actions={enrolled ? <Badge variant="success"><ShieldCheck aria-hidden /> On · {METHOD_NAMES[method] ?? "enrolled"}</Badge> : <Badge variant="muted">Off</Badge>}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {setup ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              ensureOk(await blocksClient.mfa.totp.verifySetup({ code: code.trim() }))
              setSetup(undefined)
              setCode("")
            }, "Authenticator app is on")
          }}
        >
          <p className="text-sm">Scan this in your authenticator app, or type the key, then enter the 6 digit code it shows.</p>
          {setup.image ? <img src={setup.image} alt="QR code for your authenticator app" className="size-44 rounded-md bg-white p-2" /> : null}
          {setup.secret ? (
            <p className="text-sm">
              Key: <span className="font-mono select-all">{setup.secret}</span>
            </p>
          ) : null}
          <TextField id="mfa-code" label="Code from the app" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={setCode} className="max-w-48" mono />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.trim().length < 6}>
              Turn on
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSetup(undefined)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true)
                setError(undefined)
                try {
                  const reply = ensureOk(await blocksClient.mfa.totp.setup())
                  const parsed = readSetup(reply)
                  if (!parsed.secret && !parsed.image) throw new Error("Blocks returned no key to set up the app.")
                  setSetup(parsed)
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setBusy(false)
                }
              })()
            }
          >
            <KeyRound aria-hidden /> {enrolled && method === TOTP ? "Set up a new authenticator" : "Use an authenticator app"}
          </Button>
          {!(enrolled && method === EMAIL) ? (
            <Button variant="secondary" disabled={busy} onClick={() => void run(async () => ensureOk(await blocksClient.mfa.setMethod({ mfaType: EMAIL })), "Email codes are on")}>
              Use email codes
            </Button>
          ) : null}
          {enrolled ? (
            <Button variant="ghost" disabled={busy} onClick={() => void run(async () => ensureOk(await blocksClient.mfa.disable()), "Two step login is off")}>
              Turn off
            </Button>
          ) : null}
        </div>
      )}
      {enrolled && !setup ? (
        <div className="mt-4 border-t pt-4">
          <p className="text-sm font-semibold">Backup codes</p>
          <p className="text-sm text-muted-foreground">
            Use one if you lose your phone. {remaining.data != null ? `${remaining.data} left.` : ""} Making new ones cancels the old ones.
          </p>
          {codes ? (
            <ul className="mt-2 grid max-w-sm grid-cols-2 gap-1 font-mono text-sm">
              {codes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const reply = ensureOk(await blocksClient.mfa.backupCodes.generate())
                const list = (reply.codes ?? reply.backupCodes ?? (reply.data as Record<string, unknown>)?.codes) as string[] | undefined
                setCodes(Array.isArray(list) ? list : [])
              }, "New backup codes made. Save them now, they are shown only once.")
            }
          >
            Make new backup codes
          </Button>
        </div>
      ) : null}
    </SectionCard>
  )
}

/** Company rule (AC-6): admins turn two step login on and can require it for everyone. */
function CompanyPolicy() {
  const policy = useResource(async () => (await blocksClient.mfa.config()) as Policy, [])
  const [draft, setDraft] = React.useState<{ enabled: boolean; requireAll: boolean; totp: boolean; email: boolean; optOut: boolean }>()
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!policy.data) return
    const methods = (policy.data.allowedMethods ?? []).map((item) => (typeof item === "number" ? item : /totp|auth/i.test(String(item)) ? TOTP : /email/i.test(String(item)) ? EMAIL : 0))
    setDraft({ enabled: policy.data.enabled === true, requireAll: policy.data.requireMfaForAllUsers === true, totp: methods.includes(TOTP), email: methods.includes(EMAIL), optOut: policy.data.allowUserOptOut !== false })
  }, [policy.data])

  async function save() {
    if (!draft) return
    const userMfaType = [draft.totp ? TOTP : 0, draft.email ? EMAIL : 0].filter(Boolean)
    // IAM requires MFA only when it is on and at least one method is allowed; anything else silently does nothing.
    if (draft.enabled && !userMfaType.length) return toast.error("Allow at least one method.")
    setSaving(true)
    try {
      ensureOk(await blocksClient.mfa.saveConfig({ enableMfa: draft.enabled, requireMfaForAllUsers: draft.enabled && draft.requireAll, userMfaType, allowUserOptOut: draft.optOut && !draft.requireAll }))
      toast.success("Company rule saved")
      void policy.reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard title="Company rule" description="Applies to everyone who signs in to your company.">
      {policy.error ? <ErrorBanner message={policy.error} onRetry={policy.reload} /> : null}
      {!draft ? (
        <LoadingRows rows={2} />
      ) : (
        <div className="flex flex-col gap-3">
          <CheckboxField id="mfa-enabled" label="Two step login is available" checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
          <CheckboxField id="mfa-totp" label="Allow authenticator apps" checked={draft.totp} disabled={!draft.enabled} onChange={(totp) => setDraft({ ...draft, totp })} />
          <CheckboxField id="mfa-email" label="Allow email codes" checked={draft.email} disabled={!draft.enabled} onChange={(email) => setDraft({ ...draft, email })} />
          <CheckboxField
            id="mfa-require"
            label="Require it for everyone"
            helper="People who have not set it up are asked to at their next sign in."
            checked={draft.requireAll}
            disabled={!draft.enabled}
            onChange={(requireAll) => setDraft({ ...draft, requireAll })}
          />
          <CheckboxField id="mfa-optout" label="People may turn it off for themselves" checked={draft.optOut && !draft.requireAll} disabled={!draft.enabled || draft.requireAll} onChange={(optOut) => setDraft({ ...draft, optOut })} />
          <div>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save rule"}
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  )
}
