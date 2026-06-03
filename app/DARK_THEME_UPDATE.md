# Dark Theme Implementation

Dark theme has been added to the application with a toggle button in the navigation bar.

## Features

- 🌙 Theme toggle button (moon/sun icon) in the navigation
- 💾 Theme preference saved to localStorage
- 🎨 Automatic system preference detection
- 🔄 Smooth transitions between themes

## How to Use

Click the theme toggle button (🌙/☀️) in the top navigation bar to switch between light and dark modes.

## Updated Components

All pages and components now support dark mode:
- Login page
- Dashboard
- Employees, Stores, Shifts (CRUD pages)
- Planner
- Vacations
- Accountant View
- All modals and forms
- Tables and navigation

## Technical Details

- Uses Tailwind CSS `dark:` prefix for dark mode styles
- Theme state managed via React Context (`ThemeProvider`)
- Theme preference persisted in localStorage
- System preference detection on first load
