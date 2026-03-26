# Quick Setup Guide

## ⚠️ IMPORTANT: Database Setup Required

The error you're seeing (`Could not find the table 'public.employees'`) means the database tables haven't been created yet.

## Step-by-Step Database Setup

### 1. Open Supabase Dashboard

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in to your account
3. Select your project (or create a new one if you haven't)

### 2. Open SQL Editor

1. In your Supabase project dashboard, click on **"SQL Editor"** in the left sidebar
2. Click **"New query"** button

### 3. Copy and Run the Schema

1. Open the file `app/supabase/schema.sql` in your project
2. **Copy the entire contents** of that file
3. **Paste it into the SQL Editor** in Supabase
4. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)

You should see a success message indicating all tables, indexes, and policies were created.

### 4. Verify Tables Were Created

1. In Supabase dashboard, go to **"Table Editor"** in the left sidebar
2. You should see these tables:
   - `employees`
   - `stores`
   - `shifts`
   - `shift_assignments`
   - `vacations`

If you see all 5 tables, the schema was applied successfully!

### 5. Create an Admin User

1. In Supabase dashboard, go to **"Authentication"** → **"Users"**
2. Click **"Add user"** → **"Create new user"**
3. Enter:
   - **Email**: (e.g., `admin@example.com`)
   - **Password**: (choose a strong password)
   - **Auto Confirm User**: ✅ (check this box)
4. Click **"Create user"**

### 6. Test the Application

1. Make sure your `.env.local` file has the correct Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. Restart your Next.js dev server:
   ```bash
   # Stop the server (Ctrl+C) and restart
   npm run dev
   ```

3. Go to [http://localhost:3000](http://localhost:3000)
4. You should be redirected to `/login`
5. Log in with the admin credentials you created

## Troubleshooting

### If you get "policy already exists" errors

The schema includes `DROP POLICY IF EXISTS` statements, so you can safely re-run the entire SQL script.

### If tables still don't appear

1. Check the SQL Editor for any error messages
2. Make sure you're running the SQL in the correct project
3. Try refreshing the Table Editor page

### If you can't log in after creating tables

1. Verify the user was created in Authentication → Users
2. Make sure "Auto Confirm User" was checked when creating the user
3. Check that your `.env.local` file has the correct credentials

## Need Help?

If you continue to have issues:
1. Check the Supabase SQL Editor for any error messages
2. Verify your environment variables are set correctly
3. Make sure your Supabase project is active (not paused)
