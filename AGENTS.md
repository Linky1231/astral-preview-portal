# Interface rules
- Use an unfiltered canvas surface for the home page root; glass belongs on its individual surfaces so fixed navigation and menus stay anchored to the viewport.
- Size the home drawer to the dynamic viewport, keep its header/footer fixed, and scroll only its option list so long pages cannot stretch the menu.
- Apply the bottom navigation's device safe-area inset only in installed standalone mode; the embedded preview already reserves its surrounding device space.
- Render the publications comments tray through a body portal so card glass filters and entrance animations cannot constrain its viewport-sized layout.
- Keep publication accent lines inset and absolutely positioned so their endpoints cannot protrude through rounded card corners.
- Filter default community feeds after enrichment to exclude game, artwork and system cards and genuinely empty posts; explicit category views keep their own content.
- Mount store dialogs in body portals with viewport-sized roots and isolated foreground layers so glass surfaces cannot trap them or cover purchase confirmations.
- Mount profile tools through ProfileOverlay to keep dialogs viewport-bound, trap focus, restore scrolling, and close only the top nested layer with Escape.
- Generate profile QR images locally with the QR library so preview and download never depend on a third-party image service.