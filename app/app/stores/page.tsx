'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Store } from '@/types/database';
import { t } from '@/lib/translations';

type StoreRow = Store & { color?: string | null };

function parseHexColor(value: string | null | undefined): string | null {
  if (value == null || typeof value !== 'string') return null;
  const v = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
  return null;
}

function textColorForBg(bg: string): string {
  const h = bg.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return L > 0.65 ? '#111827' : '#f9fafb';
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#e7e6e6');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('name');

      if (error) throw error;
      setStores((data || []) as StoreRow[]);
    } catch (error: any) {
      console.error('Error fetching stores:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const cards = useMemo(
    () =>
      stores.map((store) => {
        const accent = parseHexColor(store.color) ?? '#e7e6e6';
        return {
          ...store,
          accent,
          text: textColorForBg(accent),
        };
      }),
    [stores]
  );

  const createStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const color = parseHexColor(newColor);
      const payload = color ? { name: newName.trim(), color } : { name: newName.trim(), color: null };
      const { error } = await supabase.from('stores').insert([payload]);
      if (error) throw error;
      setShowCreate(false);
      setNewName('');
      setNewColor('#e7e6e6');
      await fetchStores();
    } catch (error: any) {
      setSaveError(error?.message || 'Store konnte nicht erstellt werden.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <Layout>
          <div className="text-center">{t.loading}</div>
        </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">{t.storesTitle}</h1>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              {t.addStore}
            </button>
          </div>

          {cards.length === 0 ? (
            <div className="rounded border border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
              No stores available.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((store) => (
                <Link
                  key={store.id}
                  href={`/stores/${store.id}`}
                  className="group rounded-lg border border-gray-300 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div
                    className="h-3 w-full rounded-t-lg"
                    style={{ backgroundColor: store.accent }}
                    aria-hidden
                  />
                  <div className="space-y-2 px-4 py-4">
                    <p className="text-sm font-semibold text-gray-900 group-hover:underline">
                      {store.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border border-gray-400"
                        style={{ backgroundColor: store.accent }}
                        aria-hidden
                      />
                      <span className="text-xs text-gray-600">
                        {store.accent}
                      </span>
                    </div>
                    <div
                      className="inline-flex rounded px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: store.accent, color: store.text }}
                    >
                      Open monthly planner
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {showCreate ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
              <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">{t.addStore}</h2>
                <form onSubmit={createStore} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t.storeName}</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      placeholder={t.storeName}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Farbe</label>
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="h-10 w-20 rounded border border-gray-300 bg-white p-1"
                    />
                  </div>
                  {saveError ? <p className="text-sm text-red-700">{saveError}</p> : null}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreate(false);
                        setSaveError(null);
                      }}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {saving ? t.loading : t.create}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      </Layout>
    </AuthGuard>
  );
}

