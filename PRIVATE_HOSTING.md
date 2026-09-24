# Private hosting boundary

The repository is private and the benchmark media must remain accessible only to authorized collaborators. This personal-account repository has no verified private GitHub Pages access control, so this project has no Pages deployment workflow. GitHub documents [private Pages visibility as an Enterprise Cloud organization feature](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site).

The verified static output is `dist/` after `npm ci`, the export checks, and `npm run build`. An approved institutional or organization host can serve those files behind authenticated access restricted to the same authorized collaborator group. Keep the host private, disable public indexing and anonymous asset access, and test authorization for both the HTML entry point and all `/data/` and `/media/` URLs before sharing a link. No backend is required for normal browsing.

Until such a host is configured, collaborators with repository access can clone the private repository (including through GitHub Desktop), run `npm ci && npm run dev`, and inspect the site locally. Do not enable public GitHub Pages or copy `dist/` to an anonymous host.
