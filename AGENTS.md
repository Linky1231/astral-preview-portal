# Interface rules
- Use an unfiltered canvas surface for the home page root; glass belongs on its individual surfaces so fixed navigation and menus stay anchored to the viewport.
- Size the home drawer to the dynamic viewport, keep its header/footer fixed, and scroll only its option list so long pages cannot stretch the menu.
- Apply the bottom navigation's device safe-area inset only in installed standalone mode; the embedded preview already reserves its surrounding device space.
- Render the publications comments tray through a body portal so card glass filters and entrance animations cannot constrain its viewport-sized layout.
- Keep publication accent lines inset and absolutely positioned so their endpoints cannot protrude through rounded card corners.