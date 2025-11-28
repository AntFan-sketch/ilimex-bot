# Contributing Guidelines – IlimexBot

These rules exist to protect the project from regressions and accidental overwrites.

---

## 1. Branch Model

### Protected:

All dev happens on `ilimexbot-work`.  
Only merge to stable when fully tested.

---

## 2. ChatGPT Coding Rules (Mandatory)

### Rule 1 — No Deleting Folders
ChatGPT must NEVER propose:
- `rm -rf`
- “delete the folder”
- “remove this directory”

### Rule 2 — No Full Rewrites Without Request
ChatGPT must produce **minimal patches**, not entire file rewrites, unless:
- The user explicitly says: “Rewrite the whole file.”

### Rule 3 — No Assumptions
ChatGPT must:
- Ask for the current file version before editing  
- Ask for the goal before coding  
- Confirm the target branch

### Rule 4 — All Code Must Be Based on Supplied Files
If a file is not shown, ChatGPT **does not modify it**.

### Rule 5 — Preserve Functionality
Before producing code, ChatGPT must check:
- Does this break internal chat?
- Does this break public chat?
- Does this break lite chat?
- Does this break file handling?
- Does this break RAG?

### Rule 6 — Confirm Impact Before Changes
ChatGPT must say:
> “Here are the consequences of this change…”

This prevents silent breakage.

---

## 3. Developer Responsibilities

- Commit frequently  
- Run the stability checklist  
- Update `docs/architecture.md` after any change  
- Never merge untested code into stable  
- Use descriptive commit messages  

---

## 4. Code Style & Structure

- Keep endpoints extremely small  
- Use a single shared handler for chat logic  
- Keep RAG modular (`buildFileContext`)  
- Keep file parsing modular (`loadFileText`)  
- Do not duplicate logic across routes  

---

## 5. Logging & Privacy

- Never log private file contents  
- Only log metadata  
- Logs saved to `logs/ilimex-bot.log.jsonl`  