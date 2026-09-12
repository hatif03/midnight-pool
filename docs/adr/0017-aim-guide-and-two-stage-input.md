# ADR-0017: Reference-accurate aim guide and two-stage shot input

Status: Accepted

## Context

Two problems with how the game played, separate from how it looked.

**The aim guide was wrong, not just generous.** `drawAim` projected the cue ball's path through up to
three rail bounces, but it only ever tested against the cushions — it passed straight *through* every
other ball on the table. So on the most common shot in pool, hitting an object ball, the guide drew a
line that could not happen. A player lining up a cut got a confident straight line into the pack.
That is worse than no guide: it is a guide that lies.

It also made the cues' `aimBonus` stat mean "a longer rail-bounce prediction", which is the least
interesting thing that stat could control.

**Power and angle were one gesture.** `pointerdown` anywhere, drag, release: the drag vector set both
the direction and the power, with power as `(min(dist, MAX_DRAG) / MAX_DRAG) ^ POWER_CURVE`. On a
phone this means your thumb is on the table while you aim — covering the exact thing you are trying
to line up — and there is no way to adjust power without also disturbing the angle you just set.

The reference (Miniclip's 8 Ball Pool) does neither of these things: it shows a short guide to the
contact point with a ghost ball, reserves long guidelines as a premium cue perk, and splits aiming
from power into two gestures.

## Decision

**Replace the guide with a real first-contact prediction.** New `predictShot(balls, cue, dirX, dirY)`
in `src/physics.js` does a ray/circle test against every ball on the table, takes the nearest hit,
and falls back to the cushion when the line is clear. `drawAim` renders what actually happens: the
line to contact, a ghost ball at the contact point, a target ring on the ball being hit, the object
ball's departure along the line of centres, and the cue ball's tangent deflection.

It lives in `physics.js` rather than `scene.js` because it mirrors the `MIN_X`/`MAX_X`/`MIN_Y`/`MAX_Y`
bounds and the ball radius that already live there, it is pure, and that module already has a
self-test block to assert it in. `scene.js` stays a pure draw layer.

`aimBonus` now extends the projected lines. `cues.js` needed no changes, and the stat gains real
competitive meaning — a longer guideline is what a better cue buys you, which is the reference's own
model.

**Split the shot into two stages.** Dragging on the table sets the angle only; dragging the power
rail and releasing takes the shot. Aiming semantics are deliberately unchanged — the direction is
still `(cue ball − pointer)`, the same pull-back metaphor — so existing muscle memory survives and
only the power source moved.

The power rail is a DOM element, not Pixi, for the same reasons `#spin-widget` is: it needs
`env(safe-area-inset-*)`, a touch target independent of the canvas's CSS scale factor, and it must not
be clipped by the fixed 1060×560 backing store's letterbox. It is driven by one `--pw` custom
property write per pointer event.

**The network protocol is untouched.** A guest still sends `{ type: 'shoot', dx, dy, power, spin }`;
only the local gesture that produces those four values changed. This is what keeps a rewrite of the
input layer from becoming a rewrite of the multiplayer layer.

## Consequences

**This is a real difficulty increase, and it is intended.** Players who learned the old long guideline
will find shots harder. The escape hatch, if it proves too harsh, is the object-line length multiplier
in `drawAim` — a one-line change, not a redesign.

**Two gestures per shot is more deliberate than one.** That is the trade: slower to fire off a casual
shot, but the table stays unobscured while aiming and power can be adjusted without disturbing the
angle. It is justified by touch feel, so the check that matters is a real device and a real hand —
if it does not feel better there, it has not worked, and this is the one phase of the overhaul that
can be reverted on its own.

**New state: `game.aimDir`.** The angle has to persist between the two stages. It is cleared in
`setupRack` so a fresh rack cannot inherit the previous one's aim, and the whole control set (guide,
stick, rail) is gated on `canShoot()` through a single `syncShotControls()` call inside `refreshHud`,
which every state-changing path already goes through. One hook rather than six call sites.

**`MAX_DRAG` is no longer the power input.** It still governs nothing now that the rail sets power
directly; `POWER_CURVE` still shapes the rail's response. If the shot feels wrong, `POWER_CURVE` is
the knob — the old values were calibrated against a 210px drag, not a ~300px vertical rail.

**Tests.** `predictShot` gets seventeen asserts in `physics.js`'s existing self-test block, covering
the ghost sitting exactly one ball-diameter short on a head-on shot, the tangent being perpendicular
to the object direction, empty space returning a rail contact, a ball *behind* the cue ball being
ignored, nearest-wins regardless of array order, potted balls being skipped, a cut deflecting the
object ball off-line, and a ray passing wider than a diameter registering as a miss. The rendering
and the gesture flow are not unit-testable and were verified by driving a real browser instead.

**Deferred.** An idle-state cue stick shown before the player starts aiming, and haptic feedback on
release. Both are polish on top of a model that has to prove itself first.
