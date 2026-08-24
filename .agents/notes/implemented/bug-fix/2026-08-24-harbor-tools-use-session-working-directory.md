# Agent Note: Harbor Agent tools use the calling session workspace

Status: implemented

English | [中文](2026-08-24-harbor-tools-use-session-working-directory.zh.md)

## Problem

XiaoHui runs one shared Harbor Plugin instance for every Web session. Its configured `projectRoot` points at the application-data workspace so the global Harbor Workbench has a stable directory, but the bundled Skill treated that process-wide value as the write root for every Agent session. A conversation opened at a user-selected workspace was told to stop when the two paths differed, and the registered Tools would have resolved relative paths against the application-data directory even if the model continued.

Changing the single Plugin config whenever a conversation becomes active would make concurrent sessions redirect one another. The Tool invocation already carries the owning Agent session and its immutable header working directory, so the request has a more precise source of workspace identity than the shared Plugin instance.

## Decision

Every Agent-facing Harbor Tool receives the DSH Tool execution context and requires an absolute `exec.agent.session.header.cwd`. The Tool adapter creates an immutable `EvolutionService` for that call with the session working directory as `projectRoot`; it does not mutate shared Plugin config. Existing path-containment checks then constrain Candidate, Dataset, Job, Policy, evaluator, and generated paths to the calling session workspace.

The process-wide service and configured application-data `projectRoot` remain available only to the global Web Workbench and non-Agent callers. The bundled Skill proposes `./harbor-evolution/` below the current session workspace and no longer blocks initialization merely because the fallback configuration differs. XiaoHui carries the matching JavaScript Plugin and Python Adapter as integration version `0.7.2`.

## Testing

The Harbor Plugin suite runs two snapshot Tools concurrently with different session working directories and one deliberately different configured root. It verifies each manifest is written only to its owning session, the configured root stays untouched, traversal remains rejected, and a missing absolute session directory fails before filesystem access. The Skill registration test rejects the retired mismatch instruction. The complete Plugin suite passes 48 tests, its Python Adapter passes 53 tests, and XiaoHui's bundle, offline-runtime, Overlay, and focused Rust tests verify the synchronized product assembly.

## Alternatives considered

**Update the shared Plugin config when the selected conversation changes.** Rejected because one Host serves multiple sessions; changing shared mutable state lets the most recently focused session redirect in-flight work from another session.

**Remove `projectRoot` from the desktop Overlay and rely on Profile patch merging.** Rejected after composed-config verification showed Cordis replaces the later entry's entire `config` object instead of merging fields. Omitting the field deletes the earlier value and still cannot represent multiple concurrent session roots.

**Ask the model to pass an absolute workspace path in every Tool argument.** Rejected because it duplicates authoritative session state, increases prompt burden, and weakens containment by making a model-authored value the root of trust.

## Consequences

Once integration version `0.7.2` is running, users can initialize and operate Harbor inside whichever workspace their XiaoHui session selected, including `/Users/mac/Documents/Harness`, without changing desktop configuration. Concurrent sessions stay isolated by construction. Direct Tool invocation without an Agent session now fails explicitly; non-Agent integrations use the service or Web routes backed by configured `projectRoot`. The global Workbench still shows the configured fallback workspace until it gains an explicit session selector.
