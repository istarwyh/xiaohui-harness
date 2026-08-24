# Agent Note: Personal workbench branding

Status: implemented

English | [中文](2026-08-23-personal-workbench-branding.zh.md)

## Problem

XiaoHui Harness ships as one opinionated workbench, but the visible identity is still fixed by the distribution. Users who adopt it as their own Agent workspace need a small, understandable way to name it without rebuilding the Web client or replacing broad UI surfaces.

## Decision

The distribution includes `dsh-personal-workbench`, a product plugin with one General settings card. The card edits a workbench name and uploaded Logo, previews the draft, applies it to the sidebar and empty-conversation mark, and restores the XiaoHui fallback on request. Values persist in the current Profile's `personal-workbench` settings namespace.

The card follows the shared theme's primary-button recipe: `--dsw-alias-button-primary-fill` supplies the surface and `--dsw-alias-label-primary-foreground` supplies its paired text. It never hardcodes a light foreground, because the primary fill becomes light in dark mode and dark in light mode.

Custom presentation occupies only `sidebar.brand.name`, `sidebar.brand.mark`, and `conversation.hero.brand.mark`. Disabled or missing values register no occupant for that field, so the owning shell remains the fallback authority. Personal occupants use priority `-10` to shadow an existing brand occupant without modifying that package.

## Alternatives considered

**Fold branding into Harbor Evolution.** Rejected because evaluation and workbench identity have different users, lifecycles, and settings; coupling them would make Harbor responsible for unrelated shell presentation.

**Build a complete theme or white-label system.** Rejected because the current need is only a recognizable name and Logo. Browser title, desktop icon, themes, fonts, wallpapers, and global copy remain with their existing owners.

**Replace XiaoHui defaults in generated assets.** Rejected because every personal change would require a rebuild and would not follow the Profile across ordinary DSH configuration changes.

## Consequences

Users can personalize the workbench from the running application and return to the distribution default without editing YAML. The feature adds one Profile namespace and three conditional slot occupants. It intentionally does not provide per-Workspace identities or broader skinning.

The package is copied into the desktop's trimmed workspace, included in the CLI dependency closure, and activated by the desktop overlay. Focused tests pin settings defaults, apply/reset occupant lifecycle, the theme-safe primary-button token pair, bundle inclusion, and overlay activation.
