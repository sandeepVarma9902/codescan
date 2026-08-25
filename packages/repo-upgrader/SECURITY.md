# Security policy

Report vulnerabilities privately through GitHub Security Advisories for this repository. Do not include customer repositories, access tokens, API keys, webhook secrets, or production logs in a public issue.

The latest major release receives security fixes. Migration targets are untrusted code: production workers must use disposable filesystems, resource limits, disabled network access by default, tenant-scoped credentials, and isolated GitHub App installation tokens. Rotate a credential immediately if it may have appeared in a migration log or report.

Before a release, maintainers must pass tests, syntax checks, the package build, the deterministic benchmark, and package-content inspection. Release artifacts are built by GitHub Actions from a version tag; npm publishing uses provenance when `NPM_TOKEN` is configured, and the container is published to GitHub Container Registry with the immutable tag and commit digest.
