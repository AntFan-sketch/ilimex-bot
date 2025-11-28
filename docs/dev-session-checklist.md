
---

# 📗 **2. `docs/dev-session-checklist.md`**

```md
# IlimexBot – Dev Session Checklist

This checklist must be used at the **start and end** of every development session.

---

# START OF SESSION

## 1. Confirm Working Branch
- Are we on: `ilimexbot-work`?
- NOT: `ilimexbot-stable` (protected)

## 2. Pull Latest Code

## 3. Review Architecture
Open and review:
This tells ChatGPT the exact current architecture.

## 4. Provide Context Files (mandatory before coding)
Paste the current versions of modified files:
- The chat route being edited  
- The shared handler (`lib/ilimexChat.ts`)  
- Upload route  
- Chat component UI  

**No file edits will be generated unless full current code is provided.**

## 5. State the Goal Clearly
Example:
> "Goal: Fix docx reading in chat-internal only."

## 6. Confirm No Destructive Operations Allowed
Before coding:
- No folder deletions  
- No rewrites of entire folders  
- Only minimal patch-style changes  

---

# END OF SESSION

## 7. Run the Stability Checklist
- Internal chat answers normal prompts?  
- Public chat answers safely?  
- Lite chat answers briefly?  
- TXT reading works?  
- DOCX reading works?  
- UI loads?  
- Uploads work?  
- Logging works?

## 8. Commit Changes to Work Branch

## 9. Merge to Stable (only after full testing)

## 10. Update Architecture
Update:
to reflect any changes made.

---

# This checklist prevents:
- Regressions  
- Lost functionality  
- Nuking folders  
- Untracked assumptions by ChatGPT  
