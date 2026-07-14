# How to edit this bot in Codex

1. Create a GitHub repository, for example: `olye-business-ai-bot`.
2. Upload all files from this folder to the repository root.
3. In ChatGPT/Codex, connect GitHub and allow access to that repository.
4. Create a Codex cloud environment for this repository.
5. Use Node.js as the runtime.
6. Setup command:

```bash
npm install
```

7. Check command:

```bash
npm run check
```

8. Put real secrets only in Render/Supabase, not in GitHub.
9. When asking Codex to edit, tell it to read `AGENTS.md` first.

Recommended first Codex task:

```text
Read AGENTS.md, README.md, index.js, and supabase.sql. Do not change anything yet. Summarize the current bot flow, admin commands, database tables, and risky areas that could break if edited carelessly.
```
