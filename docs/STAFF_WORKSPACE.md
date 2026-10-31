# Staff workspace

The portal is designed for all staff on phones and laptops. The working area carries the staff sign-in design: soft pink illustrated headings, heart stickers, scalloped dividers, pill buttons, and Poppins with Instrument Serif heading accents. Dense task content stays readable and responsive. Its shared navigation groups daily work, shared resources, and management tools. Phones keep Home, Tasks, Teams, and Updates directly available; the full menu uses a native dialog with focus containment, Escape dismissal, and focus return. Navigation continues to use the destinations allowed by the server.

Home puts personal tasks and staff updates before statistics and the event countdown. Shortcuts lead to the staff member's department, shared documents, and people. Teams & departments puts the staff member's own team first. Each team workspace links directly to its tasks, updates, documents, files, and members.

Task counters use full database counts, independently of the limited task previews. No database migration is required.

## Design reference

[Microsoft Fluent UI](https://github.com/microsoft/fluentui) and its [navigation guidance](https://fluent2.microsoft.design/components/web/react/core/nav/usage) informed the grouped, familiar navigation. The portal retains its existing components and pink identity; no new UI library is installed.

## Verification

- `npm test`: 138 passing tests.
- `npm run build`: production compilation and TypeScript checks pass.
- Chromium checks of the real components with fixture data: Home, team directory, and team workspace at 320px, 390px, and 1366px; no horizontal overflow.
- Fixture interaction checks: menu dismissal, focus return, route changes, restricted navigation, nested active navigation, and team section targets.
- Existing rendered-text contrast audit run against those fixture pages in light and dark themes: passing.
- The signed-in browser suite in `tests/e2e/portal.spec.ts` includes daily phone navigation and Escape/focus coverage. The full database-backed suite was not run locally because no local database or test account is configured.
