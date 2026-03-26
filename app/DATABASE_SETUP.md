# 🚨 DATABASE SETUP REQUIRED

You're seeing this error because the database tables haven't been created yet in your Supabase project.

## Quick Fix (5 minutes)

### Option 1: Using Supabase Web Interface (Recommended)

1. **Open Supabase Dashboard**
   - Go to [https://supabase.com](https://supabase.com)
   - Sign in and select your project

2. **Open SQL Editor**
   - Click **"SQL Editor"** in the left sidebar
   - Click **"New query"** button

3. **Copy the Schema**
   - Open the file: `app/supabase/schema.sql`
   - Select ALL (Ctrl+A / Cmd+A)
   - Copy (Ctrl+C / Cmd+C)

4. **Paste and Run**
   - Paste into the Supabase SQL Editor
   - Click **"Run"** button (or press Ctrl+Enter / Cmd+Enter)
   - Wait for "Success" message

5. **Verify Tables**
   - Click **"Table Editor"** in left sidebar
   - You should see 5 tables:
     - ✅ employees
     - ✅ stores
     - ✅ shifts
     - ✅ shift_assignments
     - ✅ vacations

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

## What the Schema Creates

The SQL schema creates:

- **5 Tables**: employees, stores, shifts, shift_assignments, vacations
- **4 Indexes**: For better query performance
- **5 RLS Policies**: Security policies for authenticated users

## Troubleshooting

### "Policy already exists" error
- This is OK! The script includes `DROP POLICY IF EXISTS` statements
- You can safely re-run the entire script

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
3. Check that RLS policies were created (should see 5 policies)

## Need More Help?

Visit `/setup-check` in your app for an automated setup verification tool.
