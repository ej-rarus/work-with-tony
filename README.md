# work-with-tony

Personal Claude Code and Codex plugin catalog by Tony (Eunjae Lee).

Claude Code marketplace:

```
/plugin marketplace add ej-rarus/work-with-tony
```

Codex marketplace:

```text
codex plugin marketplace add ej-rarus/work-with-tony
```

| Plugin | What it does | Install |
|---|---|---|
| [linkedin-post](plugins/linkedin-post/) | Draft LinkedIn posts in conversation and publish to your profile via the official API | `/plugin install linkedin-post@work-with-tony` |
| [suno-music](plugins/suno-music/) | Prepare Suno's Advanced form with approved lyrics and style, stopping before generation | Claude: `/plugin install suno-music@work-with-tony`<br>Codex: `codex plugin add suno-music@work-with-tony` |
| [plugin-release](plugins/plugin-release/) | Validate plugin packages, sync marketplace metadata, and complete authorized Git releases with remote verification | Claude: `/plugin install plugin-release@work-with-tony`<br>Codex: `codex plugin add plugin-release@work-with-tony` |

Each plugin lives under `plugins/<name>/` with its own README, tests and manifest.
