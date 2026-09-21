# Portfolio v110 — the guided tour points at the right thing

Four things you asked for, and what each one actually turned out to be.

---

## 1. The hand now lands on the control, not near it

Before, the hand was placed against whatever the step *spotlighted*. On
half the steps those are not the same thing. "Open Projects from the rail"
rings the whole navigation rail — because the rail is what is being
explained — so the hand sat against the corner of a 700-pixel-tall column
and told you roughly where to look and nothing about where to press.

A step can now name its aim separately from its outline (`point:`), and the
**fingertip** — not the corner of the hand's box — is what gets placed.
Every task step on the public tour and every task step in the editor's was
measured: the fingertip lands inside the control it is asking you to press,
on all of them.

It also fixes a bug that was hiding the hand altogether. The flag that says
"this step's task is done" (which hides the hand) was only cleared when the
*next* step armed its listener — and that happens after the first draw. So
any step following a completed one was drawn with no hand at all, and only
got one if something on the page happened to move afterwards. The flag is
now cleared when the step changes.

## 2. The theme dial — the step was describing the wrong control

This is the one worth reading.

The old step said the dial "has nine stops and each press turns it one
notch." That is not what that control is. It is a **rotary** dial read by
*angle*: wherever you press on its face, the angle from the spindle to your
finger is snapped to the nearest of its nine detents. Press on the left and
you get the light end; press on the right and you get the dark end.

Which means the old instruction sent people to the one place on the knob
that does nothing at all — pressing dead centre falls inside the dead zone,
because there is no meaningful angle there. Measured, cold: four presses in
the middle of the dial, four times the theme stayed on AUTO.

So the step was rewritten around what the control is:

- **The card says it**: turn it, don't press it. Left for light, right for
  dark, straight up for Auto, and the middle does nothing.
- **The hand shows it.** The finger no longer points at the knob — it walks
  *around the knob's face*, detent by detent, tracing the arc. The geometry
  comes from the same CSS custom property the dial's own ticks are drawn
  from, so the finger cannot drift away from the real positions.
- **The hand shrank** for this step. A 36px hand on a 38px dial covered the
  ticks and the pointer — the exact things the step is asking you to read.
- **The step waits for the dial to actually move**, and then for you to
  stop moving it. The old version listened for a *click*, which a press in
  the dead centre satisfies: the tour would have congratulated you and
  moved on from a step you had not managed to do. It now watches the dial's
  own position, and gives you 1.7 seconds of quiet before advancing — nine
  stops means finding the one you like takes a few goes, and cutting in at
  the first would take the choice away.
- **The hint is live**: it names the theme you are currently on, updating as
  you turn.

## 3. Sound during the tour, including "Welcome to my world!"

The sounds were firing all along; the problem was that the tour could leave
you muted before the good part.

The sound step used to complete on *either* flip of the switch. Mute it,
step advances, and everything after that is silent — including the terminal
two steps later, which is where `whoami` reveals the photo and the site says
**"Welcome to my world!"** out loud. That is one of the better moments on
the site and the tour was walking people straight past it in silence.

The step now completes only on the transition back to **on**. The hint
changes to match: "press it once to mute" becomes "now press it again to
turn sound back on — the next steps have something worth hearing." The tour
cannot be left muted by its own instructions.

Verified end to end with the audio engine instrumented: the dial clicks its
detent, every task confirms with a save note, typing clicks per keystroke,
and the speech fires — `start:Welcome to my world!` → `end:true`.

## 4. A step that was quietly broken: the robot

Not on your list, but found while testing the hand.

The arena is inert until you have a name — the gate sits *on* the robot and
swallows every swing. So the tour said "click the robot to take its health
down", you clicked the robot, and the site shook a label at you. Five clicks
in the test produced five error sounds and no damage, and the step could
never complete.

There is now a step before it that asks for a name and waits for the gate to
come down. It carries returning visitors straight through, since their gate
is already down. And if the name is taken, the hint says so instead of
repeating an instruction you have just followed.

## 5. Removed

- A dangling CSS animation name (`tour-nudge-hand`) that had no keyframes
  behind it — the hand's idle nudge is one of four directional animations,
  and the base rule was naming a fifth that did not exist.
- Swept the tree for unreferenced functions, files and assets: nothing left
  to cut. Every file in `static/` is loaded, every asset is referenced, and
  the only unused-looking Python function is a required base-class override.

---

## Still on you

1. **Purge the CDN cache.** Nothing in the code can evict it. The tour files
   are versioned `?v=110` so they will come through, but the HTML that
   references them is what gets cached.
2. **Check the `keep-awake` GitHub Action is green** — a sleeping free-tier
   instance is a slow first load for every visitor.
