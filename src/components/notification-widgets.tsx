"use client";

import { useActionState, useState } from "react";
import {
  addTeamsTarget,
  linkTeamsIdentity,
  saveNotificationRule,
  sendNotification,
  testTeamsTarget,
} from "@/lib/actions/notifications";
import { Feedback, SubmitButton } from "@/components/form-bits";
import {
  AUTOMATIC_KINDS,
  NOTIFICATION_KIND_BLURB,
  NOTIFICATION_KIND_LABEL,
  PRIORITY_LABEL,
} from "@/lib/constants";
import type { FormState } from "@/lib/actions/auth";
import type { Priority } from "@prisma/client";

const initial: FormState = {};

type Dept = { id: string; name: string };
type Person = { id: string; name: string; departmentName: string | null; linked: boolean };

/** Where a department's message will actually land, per department id. */
type Routing = Record<string, { label: string; shared: boolean } | null>;

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/**
 * The composer.
 *
 * Three scopes rather than one, because they are genuinely different acts: a
 * message to a department channel, a message to the all-staff channel, and a
 * personal nudge to named people. The third is the one this whole feature was
 * asked for — "notify each element of that user to do the assignment" — and it
 * is also the one that needs the most setup, so it says so plainly instead of
 * failing later with a queue full of errors.
 */
export function NotificationComposer({
  departments,
  people,
  canBroadcast,
  defaultDepartmentId,
  routing,
  graphReady,
  cadence,
}: {
  departments: Dept[];
  people: Person[];
  canBroadcast: boolean;
  defaultDepartmentId?: string;
  routing: Routing;
  graphReady: boolean;
  cadence: string;
}) {
  const [state, action] = useActionState(sendNotification, initial);
  const [scope, setScope] = useState<"department" | "all" | "people">(
    canBroadcast ? "all" : "department",
  );
  const [departmentId, setDepartmentId] = useState(
    defaultDepartmentId ?? departments[0]?.id ?? "",
  );

  const destination = routing[departmentId] ?? null;

  const reachable = people.filter((person) => person.linked);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="hs-label" htmlFor="notify-title">
          Subject
        </label>
        <input
          id="notify-title"
          name="title"
          required
          maxLength={150}
          className="hs-input"
          placeholder="Poster files are due tomorrow"
        />
      </div>

      <div>
        <label className="hs-label" htmlFor="notify-body">
          Message
        </label>
        <textarea
          id="notify-body"
          name="body"
          rows={4}
          required
          maxLength={3000}
          className="hs-input resize-y"
          placeholder="Upload the A3 versions to the Graphics folder before 18:00."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="notify-scope">
            Who this goes to
          </label>
          <select
            id="notify-scope"
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as typeof scope)}
            className="hs-input"
          >
            <option value="department">A department channel</option>
            <option value="all" disabled={!canBroadcast}>
              The all-staff channel{canBroadcast ? "" : " (admin only)"}
            </option>
            <option value="people">Named people, privately</option>
          </select>
        </div>

        <div>
          <label className="hs-label" htmlFor="notify-priority">
            Urgency
          </label>
          <select id="notify-priority" name="priority" defaultValue="MEDIUM" className="hs-input">
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {scope === "department" ? (
        <div>
          <label className="hs-label" htmlFor="notify-dept">
            Department
          </label>
          <select
            id="notify-dept"
            name="departmentId"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="hs-input"
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>

          {/* Where it lands, said before it is sent rather than after. */}
          {destination === null ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              No Teams channel is connected for this department, so there is nowhere to send it.
              Ask an admin.
            </p>
          ) : destination.shared ? (
            <p className="mt-1 text-xs text-warn-strong">
              This department has no channel of its own, so it goes to{" "}
              <strong>{destination.label}</strong> — which everyone can see.
            </p>
          ) : (
            <p className="mt-1 text-xs text-faint">
              Goes to <strong>{destination.label}</strong>.
            </p>
          )}
        </div>
      ) : null}

      {scope === "people" ? (
        <fieldset className="rounded-[12px] border border-line p-3">
          <legend className="hs-label px-1">Who to notify</legend>

          {!graphReady ? (
            <p className="hs-feedback hs-feedback-error mb-3">
              <span aria-hidden="true">⚠</span> Private notifications need the Microsoft Graph
              setup, which is not finished on this deployment. Until it is, use a channel instead.
            </p>
          ) : null}

          {reachable.length === 0 ? (
            <p className="text-sm text-muted">
              Nobody has a Teams account linked yet. Link them under People and Teams below.
            </p>
          ) : (
            <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
              {reachable.map((person) => (
                <label key={person.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="recipientIds"
                    value={person.id}
                    className="accent-pink-500"
                  />
                  <span className="min-w-0 truncate">
                    {person.name}
                    {person.departmentName ? (
                      <span className="text-faint"> · {person.departmentName}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}

          {people.length > reachable.length ? (
            <p className="mt-2 text-xs text-faint">
              {people.length - reachable.length} more {people.length - reachable.length === 1 ? "person has" : "people have"} no
              Teams account linked, so they are not listed.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div>
        <label className="hs-label" htmlFor="notify-link">
          Link to a page in the portal (optional)
        </label>
        <input
          id="notify-link"
          name="linkPath"
          className="hs-input"
          placeholder="/assignments"
          pattern="/[A-Za-z0-9/_-]*"
        />
        <p className="mt-1 text-xs text-faint">
          A path inside the portal only, such as <code>/assignments</code>. It becomes the button on
          the Teams card.
        </p>
      </div>

      <Feedback state={state} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Queueing…">
          Send to Teams
        </SubmitButton>
        <span className="text-xs text-faint">{cadence}</span>
      </div>
    </form>
  );
}

/**
 * One automatic rule, as one small form.
 *
 * A form per rule rather than one big form with thirty fields: saving is then
 * an obvious, local act, and a head who changes the Graphics deadline warning
 * cannot accidentally submit stale values for five other switches that were
 * rendered at the same time.
 */
export function RuleRow({
  kind,
  departmentId,
  enabled,
  leadHours,
  minPriority,
  pingPeople,
  graphReady,
  locked,
}: {
  kind: (typeof AUTOMATIC_KINDS)[number];
  departmentId: string | null;
  enabled: boolean;
  leadHours: number;
  minPriority: Priority;
  pingPeople: boolean;
  graphReady: boolean;
  locked?: string;
}) {
  const [state, action] = useActionState(saveNotificationRule, initial);
  const [on, setOn] = useState(enabled);
  const timed = kind === "ASSIGNMENT_DUE" || kind === "EVENT_SOON";

  if (locked) {
    return (
      <div className="rounded-[12px] border border-line p-3">
        <p className="text-sm font-semibold text-ink">{NOTIFICATION_KIND_LABEL[kind]}</p>
        <p className="mt-1 text-xs text-faint">{locked}</p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-[12px] border border-line p-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="departmentId" value={departmentId ?? ""} />

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="enabled"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          className="mt-1 accent-pink-500"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">
            {NOTIFICATION_KIND_LABEL[kind]}
          </span>
          <span className="block text-xs text-muted">{NOTIFICATION_KIND_BLURB[kind]}</span>
        </span>
      </label>

      {on ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {timed ? (
            <div>
              <label className="hs-label" htmlFor={`lead-${kind}-${departmentId ?? "all"}`}>
                Warn this many hours ahead
              </label>
              <input
                id={`lead-${kind}-${departmentId ?? "all"}`}
                name="leadHours"
                type="number"
                min={1}
                max={336}
                defaultValue={leadHours}
                className="hs-input"
              />
            </div>
          ) : (
            <input type="hidden" name="leadHours" value={leadHours} />
          )}

          <div>
            <label className="hs-label" htmlFor={`min-${kind}-${departmentId ?? "all"}`}>
              Skip anything below
            </label>
            <select
              id={`min-${kind}-${departmentId ?? "all"}`}
              name="minPriority"
              defaultValue={minPriority}
              className="hs-input"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABEL[priority]}
                </option>
              ))}
            </select>
          </div>

          {kind !== "ANNOUNCEMENT" && kind !== "EVENT_SOON" ? (
            <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
              <input
                type="checkbox"
                name="pingPeople"
                defaultChecked={pingPeople}
                disabled={!graphReady}
                className="accent-pink-500"
              />
              Also notify each person privately
              {!graphReady ? <span className="text-faint"> (needs the Graph setup)</span> : null}
            </label>
          ) : null}
        </div>
      ) : (
        <>
          <input type="hidden" name="leadHours" value={leadHours} />
          <input type="hidden" name="minPriority" value={minPriority} />
        </>
      )}

      <Feedback state={state} />

      <SubmitButton className="hs-btn hs-btn-secondary mt-3 px-3 py-1.5 text-xs" pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}

/** Adding a Teams channel. Admin only; the page decides whether to render it. */
export function TeamsTargetForm({ departments }: { departments: Dept[] }) {
  const [state, action] = useActionState(addTeamsTarget, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="target-label">
            What to call it
          </label>
          <input
            id="target-label"
            name="label"
            required
            maxLength={80}
            className="hs-input"
            placeholder="Graphics — General"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="target-dept">
            Used for
          </label>
          <select id="target-dept" name="departmentId" defaultValue="" className="hs-input">
            <option value="">All staff</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="hs-label" htmlFor="target-url">
          Webhook URL
        </label>
        <input
          id="target-url"
          name="webhookUrl"
          required
          type="url"
          className="hs-input"
          placeholder="https://prod-00.southeastasia.logic.azure.com:443/workflows/..."
        />
        <p className="mt-1 text-xs text-faint">
          In Teams: the channel&rsquo;s <strong>···</strong> menu → Workflows → &ldquo;Post to a
          channel when a webhook request is received&rdquo;. Copy the URL it gives you. It is stored
          encrypted and never shown again.
        </p>
      </div>

      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Saving…">
        Add channel
      </SubmitButton>
    </form>
  );
}

/** The "does this actually work" button, next to each channel. */
export function TestTargetButton({ targetId }: { targetId: string }) {
  const [state, action] = useActionState(testTeamsTarget, initial);

  return (
    <form action={action} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="targetId" value={targetId} />
      <SubmitButton className="hs-btn hs-btn-ghost px-3 py-1.5 text-xs" pendingLabel="Sending…">
        Send a test
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

/** Links one portal account to the Teams account it belongs to. */
export function LinkIdentityForm({ people }: { people: { id: string; name: string }[] }) {
  const [state, action] = useActionState(linkTeamsIdentity, initial);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className="hs-label" htmlFor="link-user">
          Person
        </label>
        <select id="link-user" name="userId" required className="hs-input">
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="hs-label" htmlFor="link-upn">
          Their Microsoft sign-in
        </label>
        <input
          id="link-upn"
          name="upn"
          type="email"
          required
          className="hs-input"
          placeholder="name@kmids.ac.th"
        />
      </div>

      <SubmitButton className="hs-btn hs-btn-secondary" pendingLabel="Linking…">
        Link
      </SubmitButton>

      <div className="sm:col-span-3">
        <Feedback state={state} />
      </div>
    </form>
  );
}
