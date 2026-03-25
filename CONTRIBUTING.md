# Contributing to CONDUCKS

Thanks for your interest in contributing to the Documentation Governance Engine! We’re excited to have you in the community.

## ⚖️ Legal Agreement

By submitting any contribution to this repository, including but not limited to code, documentation, assets, patches, tests, examples, or other material intended for inclusion in the project, you agree to the terms of the **Contributor License Agreement (CLA)** in [CLA.md](CLA.md).

Please do not submit any contribution unless you are willing to grant those rights. This ensures your contributions can be included in all future open-source and commercial versions of the project.

## 🚀 How to Contribute

### Pull Requests

1.  **Fork** the repository and create your branch from `main`.
2.  Follow the existing **Code Style** and indentation.
3.  Ensure your branch builds and passes all type checks (`npm run build`).
4.  **Agree to the CLA** by checking the box in the PR template.
5.  Keep PRs focused and atomized. Large changes are harder to review and merge.

### Direct Access

If you are granted direct write access as a collaborator, any commits you submit are also subject to the [CLA.md](CLA.md).

## 🎨 Code Style

-   **TypeScript**: We use strict typing. Avoid use of `any` where possible.
-   **Documentation**: All tools and features must be documented in `tools-structure/`.
-   **Logging**: Use `console.error` for internal logs to avoid polluting `stdout` (which is reserved for MCP JSON-RPC).
-   **Testing**: We value verification. Include test cases for new logic.

---

*Let’s build a better engineering constitution together!*
