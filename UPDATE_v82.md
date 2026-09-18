# v82 — Profile backdrop lock + halo emphasis

This build hard-locks the floating code and generated algorithm trees behind the portfolio workspace in every dialer theme. The coded-human and revealed real portrait are on an explicit foreground stack, so neither decorative layer can paint over them.

Both profile states now receive an adaptive theme-aware halo. The halo is a soft radial layer behind the silhouette rather than a drop-shadow attached to the photograph, which keeps the face and shoulder clean and avoids the cropped rectangular backlight seen in earlier mobile builds. The existing portrait dimensions, offsets, object positioning, responsive sizing, and face-safe text layout are unchanged.

Additional safeguards:
- coded-human visibility is strengthened on desktop, tablet, and mobile without changing geometry;
- real-photo reveal remains normal-blend/opaque over the decorative world;
- halo colors follow the active dialer theme automatically, including monochrome themes;
- the halo fades to transparent before its bounds, preventing a visible crop edge at the hero boundary.
