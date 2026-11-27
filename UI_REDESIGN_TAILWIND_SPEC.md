# SV2 reference-matched UI redesign — implementation instructions for Codex



## 1. Objective and non-negotiable scope

Restyle the existing product to match the five supplied SV2 screenshots as closely as possible. This is a visual migration, not a product rebuild. Match the classic, dense, desktop-first administrative interface, not a modern interpretation of it. Treat screenshots as the visual source of truth and the existing repository as the functional source of truth.



**Do not change any existing feature, business rule, API contract, database schema, Supabase policy, authentication, permission, route, payment calculation, messaging/WAHA integration, queue, import/export mapping, validation, or data persistence.** Preserve existing components' handlers, state, loading/error states, accessibility, and all supported workflows. Do not add reference-only features or remove existing features merely because they are absent from the screenshots. Preserve product name and logo; match the reference logo placement, not its identity. Never copy customer data, phone numbers, agent names, balances or identifiers from screenshots into the product.



## 2. Reference assets

Place the original five JPEGs in `design-references/` at the project root (keep their original names), alongside this Markdown file at the root. Inspect each image before coding.



| File in design-references/ | Purpose | Resolution |

|---|---|---|

| WhatsApp Image 2026-11-26 at 1.14.26 PM.jpeg | Advanced Filter modal | 1222 × 871 |

| WhatsApp Image 2026-11-26 at 1.14.27 PM (1).jpeg | Customer list, top of page | 1600 × 757 |

| WhatsApp Image 2026-11-26 at 1.14.27 PM (2).jpeg | Edit Customer modal, scrolled | 1600 × 769 |

| WhatsApp Image 2026-11-26 at 1.14.27 PM (3).jpeg | Add Customer form | 1600 × 825 |

| WhatsApp Image 2026-11-26 at 1.14.27 PM.jpeg | Customer list, scrolled | 1600 × 761 |



If references are missing, report that limitation; use this specification but do not claim pixel-perfect verification. Dimensions below are measured or estimated from the screenshots, not original CSS values. JPEG compression and browser scaling can introduce minor differences.



## 3. Implementation sequence

1. Inspect repository, framework, styles, layout, components, routes and existing feature inventory. Identify all screens, dialogs, tables and forms. Inspect git status and preserve unrelated changes.

2. Record existing behavior and run available baseline checks. Do not overwrite user changes or reset git history.

3. Migrate the existing native CSS styling to Tailwind CSS as required by Section 3A. Configure shared theme tokens before restyling components. Do not migrate the application framework or install unrelated dependencies.

4. Restyle shell, navigation, buttons, tables, forms and dialogs; then apply the same visual language to every existing screen, including screens not pictured.

5. Reuse existing data and event handlers. Prefer class/style changes and presentational wrappers. Any markup refactor must preserve semantics, behavior, form submission and keyboard navigation.

6. Run available lint, typecheck, build and tests. Compare browser screenshots at reference viewport sizes. Report remaining differences and any checks that could not run. Do not stop after merely producing a plan: implement the visual changes.



## 3A. Mandatory migration from native CSS to Tailwind CSS

Tailwind CSS must become the primary styling system across the entire existing application. This is an implementation requirement, not an optional recommendation. Preserve the exact reference-matched appearance and all existing functionality.

- Inspect package.json, lockfile, framework, build pipeline, existing stylesheets, CSS modules, inline styles, global selectors and third-party styles before making changes.
- If Tailwind is not installed, install and configure a compatible stable version using the existing package manager. If already installed, reuse its version unless a change is necessary. For Tailwind v4 use the appropriate framework integration and CSS-first theme configuration; for v3 use the appropriate PostCSS configuration, content paths and theme.extend. Do not mix version-specific setup instructions.
- Convert native CSS selectors, CSS modules and static inline styles into Tailwind utility classes in existing components. Use shared theme tokens for the palette, fonts, spacing, borders and dimensions in Section 4. For example, expose named utilities such as `bg-sv-primary`, `text-sv-text`, `w-sv-sidebar` and `rounded-sv` through the appropriate Tailwind theme configuration.
- Use arbitrary values when needed for screenshot fidelity, e.g. `h-[54px]`, `w-[230px]`, `rounded-[3px]`, `text-[14px]`, `gap-[38px]`. Do not substitute modern Tailwind defaults for the reference measurements.
- Use responsive, hover, focus-visible, disabled, active, odd/even and other state variants while preserving actual state and event handlers. Use complete static class names or explicit class maps so Tailwind can detect all variants in production builds.
- Reuse existing components and extract shared presentational components only when helpful. Preserve all props, handlers, refs, form semantics, routes and business logic. Do not rewrite the application or replace its UI library unnecessarily.
- Account for Tailwind Preflight/reset effects on native selects, checkboxes, radio buttons, file inputs, tables and third-party widgets. Restore the reference appearance and existing accessibility where necessary.
- Keep custom CSS only for Tailwind entry directives, theme variables, font declarations, unavoidable third-party overrides, or styling that cannot reasonably be expressed using utilities. Preserve genuinely dynamic runtime styles where needed. Document every remaining custom CSS exception; do not use a parallel native CSS styling system for ordinary components.
- Remove obsolete CSS rules, modules and imports only after confirming that every consumer has been migrated. Do not delete styles still required by other screens, external widgets or runtime behavior. Do not remove unrelated dependencies.
- Migrate page by page and validate behavior and appearance after each group. Check production CSS generation, responsive layouts, all interactive states, Tamil rendering, and screenshot fidelity. Run existing lint, typecheck, tests and production build.
- Tailwind installation and its necessary build configuration and lockfile changes are explicitly authorized. No unrelated framework, dependency, API, database or business logic changes are authorized.

## 4. Global design tokens

Expose these values through Tailwind theme tokens (v4 @theme or v3 theme.extend as appropriate). The CSS block below is a palette reference, not an instruction to retain native CSS component styling. Use these as starting values; dominant background colours were sampled from the supplied JPEGs. Other colours and dimensions are visual estimates. Adjust against screenshots rather than inventing a new theme.



```css

:root {

  --sv-primary: #AE275F;

  --sv-primary-dark: #982254;

  --sv-sidebar: #383E4C;

  --sv-sidebar-sub: #2E323D;

  --sv-sidebar-active: #851C49;

  --sv-page: #F4F4F4;

  --sv-surface: #FFFFFF;

  --sv-row-alt: #E8E8E8;

  --sv-border: #CACBCD;

  --sv-grid-border: #E2E2E2;

  --sv-text: #3C424D;

  --sv-muted: #777777;

  --sv-placeholder: #BFC3CB;

  --sv-blue: #32A9D5;

  --sv-green: #659A0C;

  --sv-orange: #F47D24;

  --sv-yellow: #F9B224;

  --sv-edit-header: #FABA3C;

  --sv-red: #E92C46;

  --sv-purple: #8874E9;

  --sv-radius: 3px;

  --sv-header-height: 54px;

  --sv-sidebar-width: 230px;

}

```



Typography: compact sans-serif resembling Open Sans, with Arial/system fallback and Noto Sans Tamil or installed Tamil-capable fallback. Exact original font cannot be determined from JPEGs. Use 14–15px body, 13–14px labels/navigation, 23–25px page headings (600 weight), 13px bold uppercase table headings, 15–16px bold Tamil/customer names, 16–18px dialog titles (Advanced Filter approximately 24px). Avoid oversized typography, pill buttons, glass effects, gradients, large rounded cards, decorative shadows, and excessive whitespace. Use mostly flat surfaces, thin borders and 2–4px corners. Maintain accessible contrast, focus indicators and readable text.



## 5. Application shell

- Full-width maroon top bar, about 54px high; dark maroon brand block aligned with sidebar. Existing product logo centered in brand block, approximately 90×28px footprint. Hamburger, home and existing navigation links left; existing account/profile controls right. White text and compact icons.

- Dark slate sidebar about 230px wide (including scrollbar), beginning below header and extending to viewport bottom. Parent rows approximately 46–48px high, muted outline icons 16px, text light grey/white. Expanded group darker slate; selected row full-width dark maroon, square edges, white text. Indent child labels and use small chevrons. Keep existing menu order/routes and permissions; map existing links into this treatment rather than creating missing modules.

- Main content begins around x=230; light grey background; approximately 30px horizontal padding and 16px top padding at 1600px viewport. Compact vertical rhythm. Preserve sidebar scroll and collapse behavior. Keep top navigation and table controls accessible during scrolling, consistent with references.



## 6. Customer list and shared data tables

- Toolbar first: compact rectangular filled action buttons, icon left and text right, 28–30px high, 3–4px radius, 4px gaps. Left group: Add Customer orange, Bulk Payment blue, Code Gen green, Invoice yellow, Message purple. Right group: Upload blue, Set Package purple, Set Agent orange, Set Area yellow, Deactivate red, Activate green. Only render actions that exist. Filter button maroon on next line, left aligned.

- Title row: Customer List heading, then compact Inactive List (red outline), Settings (neutral outline), Refresh (maroon outline), Excel (blue), Print (green), as applicable. Search fields aligned right, approximately 300px each with grey icon prefix box. Keep actual search semantics and filter state.

- Table full available width, no floating card margins. Header solid maroon, white uppercase bold text, small sort chevrons where sorting exists, about 36px high. Thin vertical dividers. Body alternating #E8E8E8 and #F4F4F4, about 39–41px rows. No excessive padding. Standard text grey, customer names bold maroon, active status small green circle beside ID (only when actual status is active). Preserve inactive states. Native-style square checkboxes; keep select-all behavior.

- Reference columns and approximate width proportions: SL 7%, Customer ID 12%, Customer Name 32%, CAF ID 7%, Mobile 9%, VC Number 12%, Outstanding Amount 10%, Action 11%. Map existing columns without deleting any. Keep numeric identifiers as text where needed, preserve leading zeros and Tamil Unicode. Amounts in existing currency format; never recalculate values in UI merely to match reference.

- Action cells: small blue eye, yellow edit, red trash icon buttons (\~28×24px) for existing actions, with accessible names/tooltips and existing confirmations. Do not add destructive actions if absent.

- Bottom summary: white full-width strip, 4 evenly distributed metrics when available, regular labels and bold values. Reference shows Total Customers Count, Total Installation Due, Total Monthly Rent, Total Outstanding. Use actual existing totals and semantics; preserve pagination and filtering behavior. Keep summary accessible at bottom while scrolling where feasible, without obscuring rows.

- Preserve loading, empty, error, pagination, sorting and selection states; use compact styling. For other lists, reuse same table language, retaining their own columns and actions.



## 7. Advanced Filter modal

Reference: near full-width white dialog at 1222px viewport, \~10px side margins, maroon header \~70px high, white title left and close X right. Thin border, minimal rounding, dark translucent backdrop. Body padding \~20px. Three equal columns with \~38px horizontal gaps, 26px vertical gaps; fields \~44px high. Footer white with right-aligned neutral Reset Filter and maroon Apply Filter buttons (\~44px high). Scroll body if needed, keep footer visible.



Reference arrangement (only map fields already supported):



| Left | Middle | Right |

|---|---|---|

| Customer ID | Customer Name | Mobile Number |

| VC Number | IRD Number | NUID Number |

| Select Street | Select Area | Resident Type |

| Installation Due operator + amount | Monthly Rent operator + amount | Outstanding Amount operator + amount |

| Connection Type | Collection Agent | Customer Status |

| Select Sub LCO | Existing relevant filter if any | Select Main Package |

| Select Addon Package | Existing relevant filter if any | Select Internet Plan |



Full-width CSV Box Numbers textarea at bottom if supported. Keep all current filters, operators, defaults, reset and apply behavior. The open Collection Agent dropdown in screenshot uses native-style white options and blue selection; use equivalent compact dropdowns with actual configured agents. Do not hardcode agents or default status from reference. Use existing modal focus trap, escape/close behavior and validation.



## 8. Add Customer form

- Full-width white panel, thin maroon outline, maroon header about 52px tall. Title left, last inserted customer ID right only if already available.

- Two nearly equal columns with \~30px gutter and 22–24px internal padding. Left: CUSTOMER DETAILS and CONTACT DETAILS uppercase grey bold section labels. Right: CONNECTION DETAILS. At desktop use label/input alignment: labels occupy \~35%, inputs \~65%, 38–40px field height, 12–14px vertical gap. Native-style radio buttons, checkboxes and file input appearance. No floating labels.

- Left reference order: Sub LCO selector, Full Name, Customer ID, Barcode ID, CAF No, GST, Date Of Birth, Gender, Photo; then Residence Type, Door/Flat Number, House/Flat Name & Floor, Street, Area. Continue with existing address/contact fields. Retain all existing required/optional fields, validations and input types. Do not change ID generation or date handling.

- Right: Cable and Internet tabs (if both exist), plain white tabs with thin grey borders and active tab visually connected to content. Number of connections control with red minus, grey count, green plus; preserve actual limits and handlers.

- Connection panel thin yellow border and yellow title strip, white body. Reference order: Cable Type, Free Connection checkbox, MSO Name, Activation Date, Box Type (SD/HD), NUID/IRD/VC Number with small blue search buttons, Box Comment textarea. Preserve existing lookup and connection behavior.

- Main Package and Billing Structure inside green block with white labels and white selects. Keep actual available packages and billing options. Do not introduce cable or internet capabilities if not already present.

- Keep current save/cancel controls and submission behavior; screenshot does not show full bottom of Add form, so style unseen controls consistently rather than inventing their placement or functionality.



## 9. Edit Customer modal

- At 1600px viewport, reference dialog spans x≈120 to 1468 (about 84% width), y≈3 to 758; yellow header \~54px with white title and close icon. White body, thin yellow border, subtle corner radius, dark backdrop. Internal vertical scrollbar, footer with neutral Close button at right. Preserve existing Save action even if not visible in screenshot.

- Use same two-column label/input layout as Add Customer. Left reference visible fields: Door/Flat Number, House/Flat Name & Floor, Street, Area, Landmark, City/District, State, Pincode, Location (latitude/longitude), Use my location, Email, Mobile, Alternate Number, Upload ID Proof. Preserve existing permissions and location behavior.

- Right: green package/billing selector block, blue full-width Add Bouquets/Add On/Ala Carte button, compact subscription table (Subscription, MRP, GST, Total) with alternating rows and bold total row, full-width maroon Recalculate button. Below: Installation Amount, Fully Paid/Installment radio options, Outstanding Balance, Monthly Rent, Alter Current Bill checkbox, if present. Preserve all actual pricing/tax logic and confirmation requirements. Do not create new billing operations.

- Reference is scrolled; unseen fields must remain accessible. Do not hide fields to match screenshot crop.



## 10. Apply across the whole existing product

For dashboards, billing, customer management, unpaid customer messaging, broadcast, settings, reports and any other existing pages, reuse the same shell, colours, compact controls, table treatment, section headers and dialogs. These pages are not shown in the references, so use the shared visual system rather than claiming exact screen replication. Preserve every existing feature and role-specific view. Keep existing charts and workflows, only restyle their presentation. Do not replace real data with mock data. Keep existing branding and user language support.



## 11. Responsive and accessibility requirements

Desktop fidelity is priority at 1600×757, 1600×761, 1600×769, 1600×825 and 1222×871. On narrower screens wrap toolbars, allow horizontal table scroll, use existing collapsible navigation and reduce forms/filter grids to two or one column when needed. Keep all controls reachable; no clipped dialog footer or horizontal page overflow. Mobile layouts are not supplied, so these are adaptation rules, not reference measurements. Keep keyboard navigation, labels, focus, contrast, screen reader names and existing reduced-motion support. Avoid animations not present in reference.



## 12. Acceptance checklist and final report

- [ ] All five reference images inspected and mapped to corresponding existing screens.

- [ ] Maroon top bar, dark sidebar, active row, page background, typography, compact spacing and button colours match visually.

- [ ] Customer list top and scrolled states compared at reference viewport sizes; table density, zebra rows, toolbar, searches and summary verified.

- [ ] Advanced Filter, Add Customer and Edit Customer visually compared where corresponding features exist.

- [ ] Existing routes, actions, permissions, filters, search, selection, forms, validations, data and integrations preserved.

- [ ] No schema migrations, API contract changes, unrelated dependency upgrades or unrelated changes. Only necessary Tailwind installation/configuration changes are allowed.
- [ ] All existing pages migrated to Tailwind utilities; obsolete native CSS removed safely and remaining CSS exceptions documented.
- [ ] Tailwind theme tokens and production class generation verified; no visual or functional regressions from Preflight.

- [ ] Tamil/English rendering, keyboard access, narrow-screen overflow and dialog scrolling checked.

- [ ] Available lint, typecheck, build and tests run; report failures honestly.

- [ ] Inspect git diff for unintended logic changes. Report files changed, visual decisions, tests, remaining differences and blockers.



Use browser screenshot tooling if available. Compare screenshots side by side and refine until close; do not claim exact pixel matching without evidence. If a visual requirement conflicts with functionality, preserve functionality and report the conflict. If a reference-only feature is missing, leave it missing and report it rather than implementing it. Do not deploy, commit, push, or modify production data unless separately authorized.
