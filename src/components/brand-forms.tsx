"use client";

import { useActionState, useState } from "react";
import { addBrandColor, addBrandFont, addBrandRamp } from "@/lib/actions/brand";
import { Feedback, SubmitButton } from "@/components/form-bits";
import type { FormState } from "@/lib/actions/auth";

const initial: FormState = {};

/**
 * Adding to the brand kit.
 *
 * A colour input and a hex field are bound together because designers arrive
 * with a hex code and everybody else arrives with a colour picker, and having
 * to convert between them by hand is how the wrong pink ends up in a poster.
 */
export function ColorForm() {
  const [state, action] = useActionState(addBrandColor, initial);
  const [value, setValue] = useState("#EC4899");

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <div>
          <label className="hs-label" htmlFor="color-name">
            Name
          </label>
          <input
            id="color-name"
            name="name"
            required
            maxLength={60}
            className="hs-input"
            placeholder="Primary pink"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="color-value">
            Hex
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={value}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
              className="h-[42px] w-[52px] shrink-0 cursor-pointer rounded-[10px] border border-line bg-surface p-1"
              aria-label="Pick the colour"
            />
            <input
              id="color-value"
              name="value"
              required
              value={value}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
              pattern="#[0-9A-Fa-f]{6}"
              maxLength={7}
              className="hs-input font-mono"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="color-group">
            Group (optional)
          </label>
          <input
            id="color-group"
            name="groupName"
            maxLength={60}
            className="hs-input"
            placeholder="Pinks"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="color-note">
            Where it is used
          </label>
          <input
            id="color-note"
            name="note"
            maxLength={200}
            className="hs-input"
            placeholder="Buttons and active states"
          />
        </div>
      </div>

      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Adding…">
        Add colour
      </SubmitButton>
    </form>
  );
}

export function RampForm() {
  const [state, action] = useActionState(addBrandRamp, initial);
  const [value, setValue] = useState("#EC4899");
  const [steps, setSteps] = useState(10);

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        Give one colour and get a full ramp — the light tints and the dark shades — added to the
        palette in one go, so a whole scheme does not have to be typed in by hand.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="hs-label" htmlFor="ramp-name">
            Name
          </label>
          <input
            id="ramp-name"
            name="name"
            required
            maxLength={40}
            className="hs-input"
            placeholder="Pink"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="ramp-value">
            Base colour
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={value}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
              className="h-[42px] w-[52px] shrink-0 cursor-pointer rounded-[10px] border border-line bg-surface p-1"
              aria-label="Pick the base colour"
            />
            <input
              id="ramp-value"
              name="value"
              required
              value={value}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
              pattern="#[0-9A-Fa-f]{6}"
              maxLength={7}
              className="hs-input font-mono"
            />
          </div>
        </div>
        <div>
          <label className="hs-label" htmlFor="ramp-steps">
            How many shades
          </label>
          <input
            id="ramp-steps"
            name="steps"
            type="number"
            min={3}
            max={24}
            value={steps}
            onChange={(event) => setSteps(Number(event.target.value))}
            className="hs-input"
          />
        </div>
      </div>

      <RampPreview base={value} steps={steps} />

      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Adding…">
        Add {steps} shades
      </SubmitButton>
    </form>
  );
}

/**
 * The same ramp maths the server runs, previewed live.
 *
 * Duplicated deliberately rather than shared: the server module is a Server
 * Action file, importing it into a client component would pull the database
 * client into the browser bundle, and the two are checked against each other by
 * a test in tests/brand.test.ts.
 */
function RampPreview({ base, steps }: { base: string; steps: number }) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(base) || steps < 3 || steps > 24) return null;

  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const middle = Math.floor(steps / 2);

  const shades = Array.from({ length: steps }, (_, i) => {
    const position = (i - middle) / Math.max(1, middle === 0 ? 1 : middle);
    const mix = (channel: number, t: number, towards: number) =>
      Math.round(channel + (towards - channel) * t);

    if (position < 0) {
      const t = Math.min(1, -position) * 0.92;
      return `rgb(${mix(r, t, 255)} ${mix(g, t, 255)} ${mix(b, t, 255)})`;
    }
    if (position > 0) {
      const t = Math.min(1, position) * 0.75;
      return `rgb(${mix(r, t, 0)} ${mix(g, t, 0)} ${mix(b, t, 0)})`;
    }
    return base;
  });

  return (
    <div className="flex overflow-hidden rounded-[10px] border border-line" aria-hidden="true">
      {shades.map((shade, index) => (
        <span key={index} className="h-9 flex-1" style={{ background: shade }} />
      ))}
    </div>
  );
}

export function FontForm() {
  const [state, action] = useActionState(addBrandFont, initial);
  const [stack, setStack] = useState("Inter, sans-serif");

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="font-name">
            Role
          </label>
          <input
            id="font-name"
            name="name"
            required
            maxLength={60}
            className="hs-input"
            placeholder="Headings"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="font-value">
            Font stack
          </label>
          <input
            id="font-value"
            name="value"
            required
            value={stack}
            onChange={(event) => setStack(event.target.value)}
            maxLength={160}
            className="hs-input"
            placeholder="Inter, sans-serif"
          />
        </div>
      </div>

      <div>
        <label className="hs-label" htmlFor="font-note">
          Note
        </label>
        <input
          id="font-note"
          name="note"
          maxLength={200}
          className="hs-input"
          placeholder="Weights 600 and 800 only"
        />
      </div>

      <p
        className="rounded-[10px] border border-line bg-surface-2 px-4 py-3 text-lg text-ink"
        // Only ever a font-family, and only from characters the server schema
        // allows — no quotes, semicolons or braces, so it cannot escape the
        // property and set anything else.
        style={{ fontFamily: stack.replace(/["';{}]/g, "") }}
      >
        KMIDS Hackathon 2027
      </p>

      <Feedback state={state} />
      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Adding…">
        Add font
      </SubmitButton>
    </form>
  );
}
