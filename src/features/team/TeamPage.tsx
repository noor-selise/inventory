import * as React from "react"
import type { BlocksUser } from "@seliseblocks/client"
import { Ban, CircleCheck, Mail, SlidersHorizontal, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { CheckboxField, SelectField, TextField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard, TablePagination } from "@/components/app/page"
import { tableCellClass, tableCol, tableFixed, tableHeadClass } from "@/components/app/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { locations } from "@/features/locations/api"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { blocksClient } from "@/lib/blocks/client"
import { formatNumber } from "@/lib/format"
import { NO_LIMIT, approvalLimit, saveProfile, teamProfiles, type TeamMemberProfile } from "./profile"
import { ADMIN_ROLE, ROLE_BUNDLES, roleName, roleSlugs } from "./roles"

// Invite, change role, deactivate and reactivate team members through
// blocksClient.iam.users (spec 0003 AC-3). Every change is confirmed first.
// Approval limits and the sales rep restriction live in TeamMemberProfile
// (spec 0003 data model, spec 0027).

const roleOptions = ROLE_BUNDLES.map((role) => ({ value: role.slug, label: role.name }))
const TEAM_PAGE_SIZE = 25

type Pending =
  | { kind: "role"; user: BlocksUser; role: string }
  | { kind: "deactivate" | "activate"; user: BlocksUser }

/** Invited but has not set a password from the activation email yet. */
function isInvited(user: BlocksUser) {
  return user.active === false && user.isVerified === false
}

function isActive(user: BlocksUser) {
  return user.active !== false
}

function displayName(user: BlocksUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || ""
}

function primaryRole(user: BlocksUser) {
  return roleSlugs(user.roles).find((slug) => ROLE_BUNDLES.some((role) => role.slug === slug)) ?? ""
}

function ensureOk(response: { isSuccess?: boolean; errors?: unknown; message?: string }) {
  if (response.isSuccess === false) {
    const detail = response.errors ? JSON.stringify(response.errors) : response.message
    throw new Error(detail || "The change was not accepted.")
  }
}

async function fetchTeamRoster(): Promise<BlocksUser[]> {
  const pageSize = 50
  const roster: BlocksUser[] = []
  let pageNo = 1
  let totalCount = Number.POSITIVE_INFINITY
  while (roster.length < totalCount) {
    const response = await blocksClient.iam.users.list({ pageNo, pageSize })
    ensureOk(response)
    totalCount = response.totalCount ?? roster.length
    const batch = response.data ?? []
    roster.push(...batch)
    if (!batch.length) break
    pageNo += 1
  }
  return roster.filter((user) => !user.email?.toLowerCase().endsWith("@example.com"))
}

export function TeamPage() {
  const { user: me, isAdmin } = useCurrentUser()
  const { data, error, loading, reload } = useResource(() => fetchTeamRoster(), [])
  const roster = data ?? []
  const [page, setPage] = React.useState(1)
  const total = roster.length
  const pages = Math.max(1, Math.ceil(total / TEAM_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), pages)
  const users = roster.slice((safePage - 1) * TEAM_PAGE_SIZE, safePage * TEAM_PAGE_SIZE)
  const profiles = useResource(() => teamProfiles.list({ pageSize: 500 }), [])
  const profileOf = (userId?: string) => profiles.data?.items.find((row) => row.userId === userId)
  const [editing, setEditing] = React.useState<BlocksUser>()
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [pending, setPending] = React.useState<Pending>()
  const [busy, setBusy] = React.useState(false)

  const activeAdmins = roster.filter((user) => isActive(user) && roleSlugs(user.roles).includes(ADMIN_ROLE))

  React.useEffect(() => {
    if (page > pages) setPage(pages)
  }, [page, pages])

  // An admin cannot remove the last admin (spec 0003 key invariant).
  function wouldRemoveLastAdmin(user: BlocksUser) {
    return roleSlugs(user.roles).includes(ADMIN_ROLE) && activeAdmins.length <= 1
  }

  async function confirm() {
    if (!pending?.user.itemId) return
    const userId = pending.user.itemId
    setBusy(true)
    try {
      if (pending.kind === "role") {
        ensureOk(await blocksClient.iam.users.updateAccess({ userId, roles: [pending.role] }))
        toast.success(`Role changed to ${roleName(pending.role)}`)
      } else if (pending.kind === "deactivate") {
        ensureOk(await blocksClient.iam.users.deactivate({ userId }))
        toast.success("Team member deactivated")
      } else {
        ensureOk(await blocksClient.iam.users.activate({ userId }))
        toast.success("Team member reactivated")
      }
      setPending(undefined)
      await reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Team" />
        <ErrorBanner message="Only admins can manage the team." />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone who can sign in to your company, and what their role lets them do."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden /> Invite member
          </Button>
        }
      />
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}
      <SectionCard>
        {loading && !data ? (
          <LoadingRows />
        ) : total === 0 ? (
          <EmptyState icon={Users} message="No team members found." />
        ) : (
          <>
          <div className="overflow-x-auto">
            <Table className={tableFixed}>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={tableHeadClass(tableCol.product)}>Name</TableHead>
                  <TableHead className={tableHeadClass(tableCol.role)}>Role</TableHead>
                  <TableHead className={tableHeadClass(tableCol.status)}>Status</TableHead>
                  <TableHead className={tableHeadClass(tableCol.limits)}>Limits</TableHead>
                  <TableHead className={tableHeadClass(tableCol.actions)}>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const active = isActive(user)
                  const invited = isInvited(user)
                  const self = user.itemId === me?.itemId
                  const role = primaryRole(user)
                  return (
                    <TableRow key={user.itemId} className="h-11">
                      <TableCell className={tableCellClass(tableCol.product)}>
                        <span className="block truncate font-medium">{displayName(user)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                      </TableCell>
                      <TableCell className={tableCellClass(tableCol.role)}>
                        <SelectField
                          id={`role-${user.itemId}`}
                          label={`Role for ${displayName(user)}`}
                          className="[&>label]:sr-only"
                          options={roleOptions}
                          value={role}
                          placeholder="No role"
                          disabled={!active && !invited}
                          onChange={(next) => {
                            if (next === role) return
                            if (wouldRemoveLastAdmin(user) && next !== ADMIN_ROLE) {
                              toast.error("You need at least one other admin before changing this role.")
                              return
                            }
                            setPending({ kind: "role", user, role: next })
                          }}
                        />
                      </TableCell>
                      <TableCell className={tableCellClass(tableCol.status)}>
                        {active ? (
                          <Badge variant="success">
                            <CircleCheck aria-hidden /> Active
                          </Badge>
                        ) : invited ? (
                          <Badge variant="neutral">
                            <Mail aria-hidden /> Invited
                          </Badge>
                        ) : (
                          <Badge variant="muted">
                            <Ban aria-hidden /> Deactivated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={tableCellClass(tableCol.limits, "text-xs text-muted-foreground")}>
                        <ProfileSummary profile={profileOf(user.itemId)} />
                      </TableCell>
                      <TableCell className={tableCellClass(tableCol.actions)}>
                        <Button size="sm" variant="ghost" aria-label={`Settings for ${displayName(user)}`} onClick={() => setEditing(user)}>
                          <SlidersHorizontal aria-hidden />
                        </Button>
                        {invited ? (
                          <span className="text-xs text-muted-foreground">Waiting for activation</span>
                        ) : active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={self}
                            title={self ? "You cannot deactivate yourself" : undefined}
                            onClick={() => {
                              if (wouldRemoveLastAdmin(user)) {
                                toast.error("You cannot deactivate the last admin.")
                                return
                              }
                              setPending({ kind: "deactivate", user })
                            }}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setPending({ kind: "activate", user })}>
                            Reactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={safePage}
            pageSize={TEAM_PAGE_SIZE}
            total={total}
            summary={`${total} team member${total === 1 ? "" : "s"}`}
            onPageChange={setPage}
          />
          </>
        )}
      </SectionCard>

      {editing ? (
        <ProfileDialog
          user={editing}
          profile={profileOf(editing.itemId)}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            void profiles.reload()
          }}
        />
      ) : null}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => void reload()}
      />

      <Dialog open={pending !== undefined} onOpenChange={(next) => !next && setPending(undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "role"
                ? "Change role?"
                : pending?.kind === "deactivate"
                  ? "Deactivate team member?"
                  : "Reactivate team member?"}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "role"
                ? `${displayName(pending.user)} will have the ${roleName(pending.role)} role.`
                : pending?.kind === "deactivate"
                  ? `${displayName(pending.user)} loses access right away. Their records and history stay.`
                  : pending
                    ? `${displayName(pending.user)} can sign in again.`
                    : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPending(undefined)}>
              Cancel
            </Button>
            <Button
              variant={pending?.kind === "deactivate" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvited: () => void
}) {
  const [form, setForm] = React.useState({ email: "", firstName: "", lastName: "", role: "readonly" })
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()

  React.useEffect(() => {
    if (open) {
      setForm({ email: "", firstName: "", lastName: "", role: "readonly" })
      setTouched(false)
      setSaveError(undefined)
    }
  }, [open])

  const emailError = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())
    ? "Enter a valid email address."
    : undefined

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (emailError) return
    setSaving(true)
    setSaveError(undefined)
    try {
      const email = form.email.trim()
      const available = await blocksClient.iam.users.emailAvailable({ email })
      if ((available.isAvailable ?? available.IsAvailable) === false) {
        setSaveError("Someone with this email already has an account.")
        return
      }
      // No password: the person sets their own through the activation email.
      ensureOk(
        await blocksClient.iam.users.create({
          email,
          firstName: form.firstName.trim() || undefined,
          lastName: form.lastName.trim() || undefined,
          roles: [form.role],
        })
      )
      toast.success(`Invitation sent to ${email}`)
      onOpenChange(false)
      onInvited()
    } catch (caught) {
      setSaveError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>They get an email to set their password and sign in.</DialogDescription>
        </DialogHeader>
        <form onSubmit={invite} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {saveError ? (
            <div className="sm:col-span-2">
              <ErrorBanner message={saveError} />
            </div>
          ) : null}
          <TextField
            id="invite-email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            value={form.email}
            onChange={(email) => setForm({ ...form, email })}
            error={touched ? emailError : undefined}
            className="sm:col-span-2"
          />
          <TextField
            id="invite-first-name"
            label="First name"
            value={form.firstName}
            onChange={(firstName) => setForm({ ...form, firstName })}
          />
          <TextField
            id="invite-last-name"
            label="Last name"
            value={form.lastName}
            onChange={(lastName) => setForm({ ...form, lastName })}
          />
          <SelectField
            id="invite-role"
            label="Role"
            required
            options={roleOptions}
            value={form.role}
            onChange={(role) => setForm({ ...form, role })}
            helper={ROLE_BUNDLES.find((role) => role.slug === form.role)?.description}
            className="sm:col-span-2"
          />
          <DialogFooter className="gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-24">
              {saving ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProfileSummary({ profile }: { profile?: TeamMemberProfile }) {
  const parts = [
    approvalLimit(profile) != null ? `Approves POs up to ${formatNumber(approvalLimit(profile)!)}` : null,
    profile?.ownCustomersOnly ? "Own customers only" : null,
    profile?.allowedLocationIds?.length ? `${profile.allowedLocationIds.length} location${profile.allowedLocationIds.length === 1 ? "" : "s"} only` : null,
  ].filter(Boolean)
  return <>{parts.length ? parts.join(" · ") : "None"}</>
}

/** Approval limit, sales rep restriction and location limits for one person (spec 0012 AC-3, spec 0011 AC-8, spec 0003 AC-8). */
function ProfileDialog({ user, profile, onClose, onSaved }: { user: BlocksUser; profile?: TeamMemberProfile; onClose: () => void; onSaved: () => void }) {
  const [limit, setLimit] = React.useState(approvalLimit(profile) != null ? String(approvalLimit(profile)) : "")
  const [ownOnly, setOwnOnly] = React.useState(profile?.ownCustomersOnly === true)
  const [allowed, setAllowed] = React.useState<string[]>(profile?.allowedLocationIds ?? [])
  const places = useResource(() => locations.list({ sort: { name: 1 }, pageSize: 500 }), [])
  const isAdminUser = roleSlugs(user.roles).includes(ADMIN_ROLE)
  const [saving, setSaving] = React.useState(false)
  const limitError = limit.trim() && !(Number(limit) >= 0) ? "Enter zero or more, or leave it empty." : undefined

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (limitError || !user.itemId) return
    setSaving(true)
    try {
      await saveProfile(String(user.itemId), { poApprovalLimit: limit.trim() ? Number(limit) : NO_LIMIT, ownCustomersOnly: ownOnly, allowedLocationIds: allowed })
      toast.success(`Saved settings for ${displayName(user)}`)
      onSaved()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings for {displayName(user)}</DialogTitle>
          <DialogDescription>Checked by the app when this person works on orders.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          <TextField
            id="profile-limit"
            label="PO approval limit (home currency)"
            type="number"
            min={0}
            step="0.01"
            value={limit}
            onChange={setLimit}
            error={limitError}
            helper="They can approve purchase orders up to this total. Empty means they cannot approve, except admins, who then have no ceiling."
          />
          <CheckboxField
            id="profile-own"
            label="Only their own customers and orders"
            checked={ownOnly}
            onChange={setOwnOnly}
            helper="For sales reps: they see customers and sales orders where they are the sales rep."
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Locations they work at</legend>
            <p className="text-xs text-muted-foreground">
              {isAdminUser ? "Admins always see every location." : "Tick none to let them see every location. Ticked locations limit their stock, documents and reports to those places."}
            </p>
            {places.data ? (
              (places.data.items ?? [])
                .filter((place) => place.isActive !== false || allowed.includes(place.ItemId))
                .map((place) => (
                  <CheckboxField
                    key={place.ItemId}
                    id={`profile-location-${place.ItemId}`}
                    label={place.name}
                    checked={allowed.includes(place.ItemId)}
                    disabled={isAdminUser}
                    onChange={(checked) => setAllowed((current) => (checked ? [...current, place.ItemId] : current.filter((id) => id !== place.ItemId)))}
                  />
                ))
            ) : (
              <LoadingRows rows={2} />
            )}
          </fieldset>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
