import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

let authReadQueue: Promise<void> = Promise.resolve();

function isAuthLockAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("lock broken by another request");
}

function isAuthSessionMissingError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('auth session missing');
}

async function queueAuthRead<T>(work: () => Promise<T>): Promise<T> {
  const previous = authReadQueue;
  let release: () => void = () => {};
  authReadQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

async function retryOnAuthLockAbort<T>(work: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let waitMs = 60;

  while (attempt < 4) {
    try {
      return await queueAuthRead(work);
    } catch (error: unknown) {
      if (!isAuthLockAbortError(error) || attempt === 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      waitMs *= 2;
      attempt += 1;
    }
  }

  throw new Error('Supabase auth lock retry exhausted');
}

export async function getSessionSafe(): Promise<Session | null> {
  const {
    data: { session },
    error,
  } = await retryOnAuthLockAbort(() => supabase.auth.getSession());

  if (error) {
    if (isAuthSessionMissingError(error)) {
      return null;
    }
    throw error;
  }
  return session;
}

export async function getUserSafe(): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await retryOnAuthLockAbort(() => supabase.auth.getUser());

  if (error) {
    if (isAuthSessionMissingError(error)) {
      return null;
    }
    throw error;
  }
  return user;
}
