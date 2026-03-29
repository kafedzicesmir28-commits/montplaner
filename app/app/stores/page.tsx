'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Store } from '@/types/database';
import { t } from '@/lib/translations';
import { parseStoreHexColor, resolveStoreColor } from '@/lib/storeColors';

type StoreRow = Store & { color?: string | null };

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
        const accent = resolveStoreColor(store.color);
        return {
          ...store,
          accent,
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
      const color = parseStoreHexColor(newColor);
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

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
            {cards.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-600">{t.noStoresAvailable}</div>
            ) : (
              <table className="min-w-full table-fixed divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-[80px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t.storeColor}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t.storeName}
                    </th>
                    <th className="w-[140px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Hex
                    </th>
                    <th className="w-[280px] px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {cards.map((store, index) => (
                    <tr key={store.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block h-5 w-5 rounded border border-gray-300 align-middle"
                          style={{ backgroundColor: store.accent }}
                          aria-label={t.storeColor}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{store.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{store.accent}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/stores/${store.id}`}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            {t.openPlanner}
                          </Link>
                          <Link
                            href={`/reports/stores/${store.id}`}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            {t.openStoreReport}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

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
                    <p className="mt-1 text-xs text-gray-500">{t.addStoreHint}</p>
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

