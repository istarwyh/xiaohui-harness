# Agent Note: Job-scoped Host model bridge for Harbor Candidates

Status: implemented

English | [中文](2026-08-23-harbor-host-model-bridge.zh.md)

## Problem

XiaoHui's control Agent can use `openai-codex` through Codex Auth, while a Harbor Candidate runs a second DeepSeek Harness process inside an isolated task container. That process has its own Cordis context and originally followed the Candidate's configured `deepseek-official` model. The parent model selection and Host-only OAuth state do not cross that runtime boundary, so a user who is already signed in to GPT Auth still receives a missing DeepSeek credential error when the Candidate starts.

Copying the reusable Codex credential into the Candidate would make the evaluation run work, but it would also broaden credential exposure to Candidate files, npm dependencies, task images, and Harbor artifacts. Silently replacing the Candidate config on disk would break immutable Candidate identity and make an evaluation impossible to reproduce.

## Decision

The Harbor Cordis plugin resolves a Candidate model binding before Doctor, Context preview, or Job execution. An explicit `candidateProvider` and `candidateModel` pair wins; otherwise the binding inherits the Host Agent's current model selection and optional reasoning effort. Resolution verifies that the provider and model exist. The `openai-codex` path also verifies the Host Codex Auth service is signed in, so a missing login fails before an expensive Harbor process starts.

The binding is frozen for the Job and recorded in Evaluation Context v2 as provider, model, optional reasoning effort, transport, and protocol. It participates in the comparison digest. A model-route change therefore requires a fresh comparable baseline instead of reusing measurements from another inference path. This binding applies to the Candidate Agent only; the Evaluation Stack continues to own Judge identity and credentials independently.

For each Job, the Host opens a loopback-only HTTP model broker on a random route with a random 256-bit bearer capability. The broker ignores any provider, model, or reasoning route requested by the Candidate and calls the Host LLM registry with the frozen binding. It streams only model events and non-secret model metadata. The reusable OAuth or API credential remains inside the registered Host adapter. The Job lease has a bounded request count and body size, aborts active streams during disposal, and closes when the Harbor subprocess finishes or fails.

The Python Candidate adapter receives the short-lived Job capability through the Harbor process, writes it to an owner-only file under `/run/secrets`, and checks the broker from inside the task container before installing Candidate dependencies. It then generates `.harbor-runtime/cordis.yml`, includes the immutable Candidate config, patches only the `acp-agent` model route to the synthetic `xiaohui-host` provider, and loads a dependency-free gateway adapter from the Python package. Candidate snapshot and verification reject a source `.harbor-runtime` directory so generated runtime state cannot enter the Candidate digest.

The macOS Docker path advertises the loopback broker as `host.docker.internal` while keeping the listening socket on `127.0.0.1`. A deployment whose task network cannot resolve that address must configure `modelBrokerAdvertisedHost`; the Host bind address remains a separate explicit setting.

## Alternatives considered

**Pass the Codex OAuth token into Harbor.** Rejected because the Candidate, its dependencies, and its task environment do not need a reusable provider credential. A narrow Job capability preserves the existing Host trust boundary.

**Install and sign in to Codex Auth inside every Candidate.** Rejected because it creates a second user-facing authentication state, cannot reuse the Host adapter safely, and makes ephemeral evaluation containers responsible for persistent login material.

**Keep the Candidate's configured DeepSeek model as the implicit default.** Rejected because the control Agent and Candidate would execute under different providers without an explicit experiment decision, recreating the observed failure and weakening result interpretation.

**Rewrite `cordis.yml` in the Candidate directory.** Rejected because the evaluated filesystem would no longer match the snapshotted digest. The generated overlay must remain outside the immutable source identity.

## Consequences

A GPT Auth user can run the bundled Harbor Candidate without also configuring DeepSeek Official. The Candidate and all of its sub-agent work share one frozen Host model route for the lifetime of the Job, while provider secrets remain outside the Candidate trust boundary. Context artifacts make that route auditable and prevent cross-model baseline comparison.

The bridge adds a live Host dependency to Candidate execution: Docker must reach the advertised Host address for the whole Job, and closing the desktop application interrupts the evaluation. A remote Harbor environment needs an explicitly secured network path rather than the macOS Docker default. The broker is intentionally an internal single-Host transport, not a general remote LLM API.

Focused JavaScript tests pin model inheritance, explicit-pair validation, signed-in preflight, authorization, route enforcement, stream proxying, and lease disposal. Python tests pin direct and included Cordis overlays, the reserved runtime directory, model-binding normalization, and wheel inclusion of the gateway module. Release acceptance exercises Docker-to-Host reachability and a real Candidate response through the Host GPT Auth adapter.
