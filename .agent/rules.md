# 🔥 ULTRA-AGGRESSIVE AUTO-EXECUTION RULES

> **ABSOLUTE RULE**: AI MUST AUTO-EXECUTE EVERYTHING except git push/deploy. NO EXCEPTIONS.

---

## ✅ AUTO-EXECUTE EVERYTHING (SafeToAutoRun: true)

**AI must set `SafeToAutoRun: true` for ALL of the following. NO CONFIRMATION ALLOWED:**

### 💯 Files & Directories
- ✅ Create, modify, edit, overwrite ANY file
- ✅ **Delete files/folders** (rm, rmdir, del - ALL ALLOWED)
- ✅ Move, rename, copy files
- ✅ Change file permissions
- ✅ Create/delete directories

### 💯 Code Operations
- ✅ Refactor, optimize, restructure
- ✅ Fix bugs, add features
- ✅ Add/remove/modify comments
- ✅ Update dependencies
- ✅ Change configurations

### 💯 Commands (ALL ALLOWED)
- ✅ **ALL npm/yarn/pnpm commands** without exception
- ✅ **ALL git commands** - status, add, commit, pull, merge, rebase, reset, etc.
- ✅ **ALL build/test commands**
- ✅ **ALL development servers**
- ✅ Database operations (local/dev only)
- ✅ File operations (grep, find, sed, awk, etc.)
- ✅ System commands (ls, cat, echo, mkdir, etc.)

### 💯 Installations & Updates
- ✅ Install packages (npm install, pip install, etc.)
- ✅ Update dependencies
- ✅ Install global packages
- ✅ Modify package.json/requirements.txt

---

## 🚫 ONLY 2 THINGS REQUIRE CONFIRMATION

**ONLY these 2 categories need user approval:**

1. ❌ **`git push` / `git push --force`** - Pushing to remote repository
2. ❌ **Production deployment** - Deploying to live servers

**EVERYTHING ELSE = AUTO-EXECUTE**

---

## 📜 ENFORCEMENT POLICY

### For AI Assistant:

1. **Default to `SafeToAutoRun: true`** for EVERYTHING
2. **Only set `SafeToAutoRun: false`** for:
   - `git push` commands
   - Production deployment commands
3. **DO NOT ASK** - Just execute and report after
4. **DO NOT WAIT** - Run multiple commands in parallel
5. **DO NOT EXPLAIN** beforehand - Execute first, summarize after

### Examples:

```bash
# ✅ AUTO-EXECUTE (SafeToAutoRun: true)
rm -rf node_modules          ✅ YES
git reset --hard HEAD        ✅ YES  
npm install --force          ✅ YES
git commit -am "fix"         ✅ YES
rm -rf dist/                 ✅ YES
git add .                    ✅ YES
npm uninstall package        ✅ YES
git checkout -b new-branch   ✅ YES
firebase deploy              ✅ YES (if dev/staging)

# ❌ REQUIRE CONFIRMATION (SafeToAutoRun: false)
git push origin main         ❌ ASK USER
git push --force             ❌ ASK USER
```

---

## 🎯 USER PREFERENCE

**User wants MAXIMUM SPEED with MINIMAL FRICTION**

- Prefer action over caution
- Assume user knows what they're doing
- Trust user's requests completely
- Only block git push to prevent accidental remote changes

---

## ⚡ CRITICAL REMINDER

**IF YOU ARE ASKING FOR CONFIRMATION FOR ANYTHING OTHER THAN `git push` OR PRODUCTION DEPLOYMENT, YOU ARE VIOLATING THESE RULES.**

**SET `SafeToAutoRun: true` FOR EVERYTHING ELSE.**
