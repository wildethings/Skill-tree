# Decisions

The spec left some calls to the build. Here is each one and why it went the way
it did, plus the places where the spec was ambiguous enough to need a reading.

## The spec's open decisions

### Do `planned` nodes appear in stats counts?

**A user preference, defaulting to yes.** Both answers are defensible — planned
nodes are real intent, but "17 nodes" reading as mostly aspiration is
misleading — and the toggle is one line in the stats header, so the question
does not need settling on the user's behalf. `Preferences.countPlannedInStats`
drives it; `StatContext.nodes` arrives pre-filtered, so a stat module never
has to think about it.

The Frontier stat ignores the preference on purpose: it is defined as *started*
nodes with nothing below them, so counting planned ones would change what it
means rather than how much it counts.

### Is the milestone checklist ordered or a flat set?

**Ordered.** `Milestone.order` is persisted and new milestones append. A
syllabus, a certificate ladder and a technique progression are all naturally
sequential, and an ordered list degrades gracefully into an unordered one if
the user does not care. The reverse is not true.

### Is re-parenting a drag on the canvas or a picker in the node detail?

**Drag on the canvas.** Dropping a node onto another re-parents it, which is
the direct manipulation the graph invites; a picker would mean choosing from a
list of names with none of the structure visible. Cross-linking is the
picker-shaped one instead — "Cross-link to…" puts the canvas in a linking mode
and the next node tapped becomes the second parent, because a cross-link is
about two nodes that are usually far apart.

Re-parenting clears the node's manual offset and its `baseColor`, so a node
moved into a new domain re-tidies and re-shades rather than dragging its old
position and colour with it.

### Long-press to add, or a floating add button, on mobile?

**Both, for different things.** Long-press (450ms) or right-click on a node
opens Advance / Branch — that is the two-taps-from-canvas flow the spec asks
for, and it needs a node to act on. The floating button creates a *root*, which
has no node to long-press. The node detail card also carries Advance and
Branch, so nothing depends on discovering the long-press.

## Readings the spec left open

### D is a property of the root, not of a node's own subtree

The tint formula is `L = L_root + (L_max - L_root) * (d / D)` where D is "the
deepest descendant". Read per-node, two siblings with differently deep subtrees
would get different tints — but the spec also requires that siblings at the
same depth share a tint. So D is the deepest depth anywhere under the root.
This also gives the spec's other stated consequence for free: adding a node
anywhere changes D and re-shades the whole root.

### Dark mode inverts the ramp rather than shifting it

"Lighten the base" plus "inverted mapping" could mean shifting the ramp upward
and keeping its direction. It does not, because that loses what the ramp
encodes. In light mode the root is the darkest thing on a light canvas and each
step down sits back a little further; the ramp is really about *contrast
against the canvas* falling off with depth. Preserving that on a dark canvas
means running the ramp downward: root `L 0.80`, deepest `L 0.42`. Nothing sinks
into the background at either end, and depth still reads the same way.

Chroma tapers as a function of lightness alone, so one rule covers both themes:
pale steps shed chroma to stay inside sRGB instead of clipping to something
chalky, dark steps keep the full saturation of the base.

### Cross-link gradients interpolate in Oklab

The spec is explicit that colour maths happens in OKLCH because sRGB
interpolation passes through a muddy grey midpoint. For a two-stop gradient,
interpolating in OKLCH proper sweeps the hue between the two stops and reads as
a rainbow. Oklab is the Cartesian form of the same colour space, so it keeps
the perceptual uniformity that matters and simply lets the two colours meet.
The stops sit at 22% and 78% so each parent holds a solid corner.

The dashed cross-link edge is drawn in the source parent's ramp read at the
*child's* depth — which is exactly that parent's stop in the child's gradient,
so the edge and the tile agree.

### Only primary edges go into dagre

Cross-links are drawn, not laid out. Feeding them to dagre would let a
cross-link push a node into a deeper rank than its primary depth, and vertical
position would stop meaning what the tint means. Keeping the layout graph to
primary edges makes rank, depth and tint step all say the same thing. Each root
is laid out as its own subgraph and the subgraphs are placed left to right in
the user's chosen order — the orchard.

Sideways edges leave from the foot of each card and swing below the row rather
than running straight through whatever sits between them.

### Tapping a root focuses it; tapping it again opens it

The spec says tapping a node opens its detail card, and that tapping a root
enters focus mode. Roots are both. Focus wins on the first tap because it is
the navigational move and the one that matters on a phone; the second tap opens
the card. Tapping empty canvas leaves focus.

### Branch from a root

Advance adds a child. Branch adds a sibling — a child of the node's own parent.
A root has no parent, so Branch on a root degrades to adding a child, which is
the right thing anyway: a root's children *are* the distinct skills in that
domain. A root's siblings are the other roots, and those are created outright.

### Fit on load has a legibility floor

"Fit the whole graph to the viewport" makes a node unreadable on a phone once
there are several roots. The fit clamps at `0.45`, and when the graph overflows
at that zoom it anchors to the first root instead of centring — landing in the
middle of an orchard you cannot read is worse than landing at its start. The
vertical axis always hangs from the top, which is the composition.

Focus mode fits the focused branch (clamped to `1.1`) rather than only
centring it, which is what makes it useful on a small screen.

## Smaller calls

- **New nodes default to `started`, not `planned`.** Recording what you are
  doing is the common case; mapping ahead is the deliberate one, and it is a
  single checkbox in the create form.
- **A new node inherits its parent's icon**; a new root gets `sparkle`. Both
  are one tap from the picker. An inherited icon at least looks deliberate.
- **Children of a deleted root inherit its `baseColor`**, so a branch keeps its
  identity when the thing above it goes away.
- **Deletion is undoable from a toast**, which is what "soft delete everything"
  buys the user in practice. Undo restores the exact pre-delete rows —
  re-parented children and root order included — rather than only clearing
  `deletedAt`.
- **A day's node creations fold into one timeline row.** Mapping out a branch
  creates several nodes at once; a row each would bury the log entries that the
  timeline exists to show.
- **The icon picker is code-split.** Its search catalog is ~160KB of tags that
  nothing else needs, so it loads on first open rather than at boot.
