'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface TableStatus {
  name: string;
  exists: boolean;
  error?: string;
}

export default function SetupCheckPage() {
  const [tables, setTables] = useState<TableStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [envCheck, setEnvCheck] = useState({
    hasUrl: false,
    hasKey: false,
  });

  useEffect(() => {
    checkSetup();
  }, []);

  const checkSetup = async () => {
    // Check environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    setEnvCheck({
      hasUrl: !!url,
      hasKey: !!key,
    });

    if (!url || !key) {
      setLoading(false);
      return;
    }

    // Check each table
    const requiredTables = ['employees', 'stores', 'shifts', 'shift_assignments', 'vacations'];
    const tableChecks: TableStatus[] = [];

    for (const tableName of requiredTables) {
      try {
        const { error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          tableChecks.push({
            name: tableName,
            exists: false,
            error: error.message,
          });
        } else {
          tableChecks.push({
            name: tableName,
            exists: true,
          });
        }
      } catch (err: any) {
        tableChecks.push({
          name: tableName,
          exists: false,
          error: err.message || 'Unknown error',
        });
      }
    }

    setTables(tableChecks);
    setLoading(false);
  };

  const allTablesExist = tables.every((t) => t.exists);
  const allEnvSet = envCheck.hasUrl && envCheck.hasKey;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">Setup Verification</h1>

        {/* Environment Variables Check */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Environment Variables</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">NEXT_PUBLIC_SUPABASE_URL</span>
              <span
                className={`rounded px-2 py-1 text-sm font-medium ${
                  envCheck.hasUrl
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {envCheck.hasUrl ? '✓ Set' : '✗ Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
              <span
                className={`rounded px-2 py-1 text-sm font-medium ${
                  envCheck.hasKey
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {envCheck.hasKey ? '✓ Set' : '✗ Missing'}
              </span>
            </div>
          </div>
        </div>

        {/* Database Tables Check */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Database Tables</h2>
          {loading ? (
            <div className="text-center text-gray-600">Checking tables...</div>
          ) : (
            <div className="space-y-2">
              {tables.map((table) => (
                <div key={table.name} className="flex items-center justify-between">
                  <div className="flex-1">
                    <span className="font-mono text-gray-700">{table.name}</span>
                    {table.error && (
                      <div className="mt-1 text-sm text-red-600">{table.error}</div>
                    )}
                  </div>
                  <span
                    className={`rounded px-2 py-1 text-sm font-medium ${
                      table.exists
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {table.exists ? '✓ Exists' : '✗ Missing'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Setup Instructions */}
        {(!allEnvSet || !allTablesExist) && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-6">
            <h2 className="mb-4 text-xl font-semibold text-yellow-900">
              Setup Required
            </h2>
            {!allEnvSet && (
              <div className="mb-4">
                <h3 className="font-semibold text-yellow-800 mb-2">
                  1. Configure Environment Variables
                </h3>
                <p className="text-yellow-700 mb-2">
                  Create a <code className="bg-yellow-100 px-1 rounded">.env.local</code> file in
                  the <code className="bg-yellow-100 px-1 rounded">app</code> directory with:
                </p>
                <pre className="bg-yellow-100 p-3 rounded text-sm overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key`}
                </pre>
                <p className="text-yellow-700 mt-2 text-sm">
                  Then restart your dev server.
                </p>
              </div>
            )}
            {!allTablesExist && (
              <div>
                <h3 className="font-semibold text-yellow-800 mb-2">
                  2. Create Database Tables
                </h3>
                <p className="text-yellow-700 mb-2">
                  You need to run the SQL schema in your Supabase project:
                </p>
                <ol className="list-decimal list-inside text-yellow-700 space-y-1 text-sm">
                  <li>Go to your Supabase project dashboard</li>
                  <li>Click on <strong>"SQL Editor"</strong> in the left sidebar</li>
                  <li>Click <strong>"New query"</strong></li>
                  <li>Open the file <code className="bg-yellow-100 px-1 rounded">app/supabase/schema.sql</code></li>
                  <li>Copy the entire contents and paste into the SQL Editor</li>
                  <li>Click <strong>"Run"</strong> (or press Ctrl+Enter)</li>
                </ol>
                <p className="text-yellow-700 mt-2 text-sm">
                  After running the SQL, refresh this page to verify the tables were created.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Success Message */}
        {allEnvSet && allTablesExist && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-6">
            <h2 className="mb-2 text-xl font-semibold text-green-900">
              ✓ Setup Complete!
            </h2>
            <p className="text-green-700">
              All environment variables are set and all database tables exist. You can now use the
              application.
            </p>
            <a
              href="/dashboard"
              className="mt-4 inline-block rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              Go to Dashboard
            </a>
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={checkSetup}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Re-check Setup
          </button>
        </div>
      </div>
    </div>
  );
}
