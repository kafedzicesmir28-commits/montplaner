# Employee Shift Planning Application

A full-stack web application for managing employee shifts, vacations, and working hours, built with Next.js and Supabase.

## Features

- **Employee Management**: Create, read, update, and delete employees
- **Store Management**: Manage store locations
- **Shift Management**: Define shift templates with start/end times and break durations
- **Monthly Planner**: Interactive grid view for planning employee shifts by day
- **Vacation Management**: Track employee vacations (Ferie) with automatic planner integration
- **Hours Calculation**: Automatic calculation of total, night (22:00-06:00), and Sunday hours
- **Accountant View**: Aggregated hours summary for payroll processing
- **Authentication**: Secure login using Supabase Auth

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + API)
- **Styling**: TailwindCSS v4
- **State Management**: React Hooks

## Prerequisites

- Node.js 18+ installed
- A Supabase account and project
- npm or yarn package manager

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to your project's SQL Editor
3. Follow the canonical setup guide in `supabase/CANONICAL_SETUP.md`
4. Run `supabase/migration-multi-tenant-superadmin.sql`
5. Go to Project Settings > API and copy your Project URL and anon/public key

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Replace the placeholders with your actual Supabase credentials.

### 4. Create an Admin User

1. Go to your Supabase project dashboard
2. Navigate to Authentication > Users
3. Click "Add user" and create an admin account with email and password
4. Use these credentials to log in to the application

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

You will be redirected to the login page. Use your admin credentials to sign in.

## Project Structure

```
app/
├── app/
│   ├── accountant/       # Accountant view with hours summary
│   ├── dashboard/        # Main dashboard
│   ├── employees/        # Employee CRUD
│   ├── login/           # Authentication page
│   ├── planner/         # Monthly shift planner
│   ├── shifts/          # Shift template CRUD
│   ├── stores/          # Store CRUD
│   └── vacations/       # Vacation management
├── components/          # Reusable components
│   ├── AuthGuard.tsx   # Route protection
│   └── Layout.tsx      # Main layout with navigation
├── lib/
│   ├── supabaseClient.ts  # Supabase client initialization
│   └── utils.ts           # Utility functions (hours calculation, etc.)
├── types/
│   └── database.ts        # TypeScript types for database entities
└── supabase/
    ├── CANONICAL_SETUP.md                  # Canonical DB setup path
    └── migration-multi-tenant-superadmin.sql  # Canonical migration

```

## Database Schema

The application uses the following tables:

- **employees**: Employee information
- **stores**: Store locations
- **shifts**: Shift templates (name, start time, end time, break minutes)
- **shift_assignments**: Daily shift assignments (employee, date, shift, store)
- **vacations**: Employee vacation periods

All tables have Row Level Security (RLS) enabled for authenticated users.

## Usage

### Setting Up Data

1. **Add Employees**: Navigate to Employees and add your team members
2. **Add Stores**: Go to Stores and add your store locations
3. **Create Shifts**: Define shift templates in Shifts (e.g., "Morning", "Evening", "Night")

### Planning Shifts

1. Go to **Planner** to see the monthly grid
2. Click on any cell (employee + day) to assign a shift
3. Select a shift and store from the dropdown
4. Vacation days are automatically marked as "Ferie" and cannot be assigned

### Managing Vacations

1. Navigate to **Vacations**
2. Add vacation periods for employees
3. These will automatically appear in the planner as "Ferie" days

### Viewing Hours Summary

1. Go to **Accountant View**
2. Select a date range
3. View aggregated hours (normal, night, Sunday, total) per employee

## Building for Production

```bash
npm run build
npm start
```

## Security Notes

- All API calls go through Supabase with Row Level Security
- Authentication is required for all routes except `/login`
- Environment variables should never be committed to version control

## Troubleshooting

### "Missing Supabase environment variables" error

Make sure your `.env.local` file exists and contains both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Cannot log in

- Verify your user exists in Supabase Authentication
- Check that RLS policies are correctly set up in the database
- Ensure your Supabase project is active

### Database errors

- Verify the schema has been applied correctly
- Check that all tables exist in your Supabase project
- Ensure RLS policies are enabled and configured

## License

This project is open source and available for use.
