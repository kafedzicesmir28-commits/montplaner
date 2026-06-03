# 🚨 DATABASE SETUP REQUIRED

You're seeing this error because the database tables haven't been created yet in your Supabase project.

## Quick Fix (5 minutes)

### Option 1: Canonical secure setup (Recommended)

1. **Open Supabase Dashboard**
   - Go to [https://supabase.com](https://supabase.com)
   - Sign in and select your project

2. **Open SQL Editor**
   - Click **"SQL Editor"** in the left sidebar
   - Click **"New query"** button

3. **Use the Canonical Guide**
   - Open the file: `app/supabase/CANONICAL_SETUP.md`
   - Select ALL (Ctrl+A / Cmd+A)
   - Copy (Ctrl+C / Cmd+C)

4. **Paste and Run**
   - Paste into the Supabase SQL Editor
   - Run `app/supabase/migration-multi-tenant-superadmin.sql`
   - Click **"Run"** button (or press Ctrl+Enter / Cmd+Enter)
   - Wait for "Success" message

5. **Verify Tables**
   - Click **"Table Editor"** in left sidebar
   - You should see at least these core tables:
     - ✅ employees
     - ✅ stores
     - ✅ shifts
     - ✅ shift_assignments
     - ✅ vacations
     - ✅ companies
     - ✅ profiles
     - ✅ login_logs

6. **Create Admin User**
   - Click **"Authentication"** → **"Users"**
   - Click **"Add user"** → **"Create new user"**
   - Enter email and password
   - ✅ Check **"Auto Confirm User"**
   - Click **"Create user"**

7. **Test the App**
   - Restart your dev server: `npm run dev`
   - Go to http://localhost:3000
   - Log in with your admin credentials

### Option 2: Using Supabase CLI (Advanced)

If you have Supabase CLI installed:

```bash
supabase db push
```

But you'll need to set up the migration files first.

## What the Canonical Migration Creates

The SQL schema creates:

- **Tenant-aware tables**: including companies/profiles and company ownership columns
- **Strict RLS policies**: per-tenant isolation and superadmin-only management actions
- **Security helpers/triggers**: profile mutation guard and tenant company auto-assignment

## Troubleshooting

### "Policy already exists" error
- This is OK! The canonical migration uses idempotent policy updates
- You can safely re-run `app/supabase/migration-multi-tenant-superadmin.sql`

### "Extension already exists" error
- This is OK! The `CREATE EXTENSION IF NOT EXISTS` handles this
- Continue running the script

### Tables still not showing
1. Check the SQL Editor for error messages (red text)
2. Make sure you're in the correct Supabase project
3. Try refreshing the Table Editor page
4. Verify your `.env.local` file has the correct project URL

### Can't log in after setup
1. Verify user exists in Authentication → Users
2. Make sure "Auto Confirm User" was checked
3. Check that strict policies exist (for tenant tables and superadmin controls)

## Need More Help?

Visit `/setup-check` in your app for an automated setup verification tool.
