import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  iSkills2OpenAtom,
  iSkills2MinimizedAtom,
  portalOffsetsSelector,
  isAnyPortalMaximizedSelector,
} from '~/store/portalStack';
import {
  X,
  Minus,
  Minimize2,
  Maximize2,
  Zap,
  ArrowLeft,
  Plus,
  Loader2,
  BookOpen,
  Activity,
  Clock,
  Trash2,
  CheckCircle2,
  XCircle,
  LogOut,
  PenTool,
  Wand2,
} from 'lucide-react';
import { cn } from '~/utils';

// ─── API helpers ──────────────────────────────────────────────────────────────

const TOKEN_KEY = 'iskills2_token';
const API_BASE = '/api/iskills2';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function setStoredToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  priority: number;
  triggerExamples: string[];
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Stats {
  totalSkills: number;
  activeSkills: number;
  totalUses: number;
}

interface SkillFormData {
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  priority: number;
  triggerExamples: string[];
}

type View = 'login' | 'register' | 'dashboard' | 'new-skill' | { type: 'edit-skill'; id: string };

// ─── Primitive UI (no external deps) ─────────────────────────────────────────

function FInput({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-[#DDD8CF] bg-white px-4 py-2.5 text-sm text-slate-800',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C4A882]/40',
        'focus:border-[#C4A882] transition-all',
        className,
      )}
      {...props}
    />
  );
}

function FTextarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-[#DDD8CF] bg-white px-4 py-2.5 text-sm text-slate-800',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C4A882]/40',
        'focus:border-[#C4A882] transition-all resize-none',
        className,
      )}
      {...props}
    />
  );
}

function Btn({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}) {
  const base =
    'inline-flex items-center justify-center rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none';
  const variants = {
    primary: 'bg-[#C4A882] text-white hover:bg-[#b8976d]',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    outline: 'border border-[#DDD8CF] bg-white text-slate-700 hover:bg-[#F5F1EB]',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1',
    md: 'px-4 py-2.5 text-sm gap-1.5',
    lg: 'px-6 py-3 text-base gap-2',
  };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-xs uppercase tracking-widest font-black text-[#C4A882] mb-1">
      {children}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors duration-200',
        checked ? 'bg-[#C4A882]' : 'bg-slate-200',
      )}
    >
      <span
        className={cn(
          'absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function InlineToast({
  msg,
  type,
  onClose,
}: {
  msg: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-[200] flex items-center gap-3 rounded-2xl px-5 py-3',
        'text-sm font-semibold shadow-xl',
        type === 'success' ? 'bg-[#C4A882] text-white' : 'bg-red-500 text-white',
      )}
    >
      {msg}
      <button onClick={onClose} className="opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginView({
  onSuccess,
  onRegister,
}: {
  onSuccess: (email: string) => void;
  onRegister: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(res.token);
      onSuccess(res.user.email);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-full bg-[#C4A882] flex items-center justify-center mb-4">
            <PenTool className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-3xl font-serif mb-1 text-slate-800">Welcome back</h2>
          <p className="text-slate-500 text-sm text-center">Continue to your skills workspace.</p>
        </div>
        <div className="bg-white border border-[#DDD8CF] rounded-3xl p-8 shadow-sm">
          {error && (
            <p className="text-red-500 text-sm mb-4 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>
          )}
          <form onSubmit={submit} className="space-y-5">
            <div>
              <FieldLabel>Email</FieldLabel>
              <FInput
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <FInput
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Btn variant="primary" size="lg" className="w-full" type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In
            </Btn>
          </form>
          <p className="mt-5 text-center text-sm text-slate-500">
            No account?{' '}
            <button
              onClick={onRegister}
              className="text-[#C4A882] hover:underline font-semibold"
            >
              Create one
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Register ─────────────────────────────────────────────────────────────────

function RegisterView({
  onSuccess,
  onLogin,
}: {
  onSuccess: (email: string) => void;
  onLogin: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(res.token);
      onSuccess(res.user.email);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-full bg-[#C4A882] flex items-center justify-center mb-4">
            <PenTool className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-3xl font-serif mb-1 text-slate-800">Create account</h2>
          <p className="text-slate-500 text-sm">Start managing your skills.</p>
        </div>
        <div className="bg-white border border-[#DDD8CF] rounded-3xl p-8 shadow-sm">
          {error && (
            <p className="text-red-500 text-sm mb-4 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>
          )}
          <form onSubmit={submit} className="space-y-5">
            <div>
              <FieldLabel>Email</FieldLabel>
              <FInput
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <FInput
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Btn variant="primary" size="lg" className="w-full" type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Account
            </Btn>
          </form>
          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <button onClick={onLogin} className="text-[#C4A882] hover:underline font-semibold">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardView({
  userEmail,
  onNewSkill,
  onEditSkill,
  onLogout,
  showToast,
}: {
  userEmail: string;
  onNewSkill: () => void;
  onEditSkill: (id: string) => void;
  onLogout: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([apiFetch('/skills'), apiFetch('/stats')]);
      setSkills(s);
      setStats(st);
    } catch (err: any) {
      showToast(err.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statCards = stats
    ? [
        { label: 'Total Skills', value: stats.totalSkills, Icon: BookOpen },
        { label: 'Active Skills', value: stats.activeSkills, Icon: Activity },
        { label: 'Total Activations', value: stats.totalUses, Icon: Zap },
      ]
    : [];

  return (
    <div className="flex h-full flex-col md:flex-row overflow-hidden">
      {/* Sidebar */}
      <aside className="md:w-56 shrink-0 border-r border-[#DDD8CF] bg-white p-5 flex flex-col gap-6 hidden md:flex">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-[#C4A882] flex items-center justify-center shrink-0">
            <PenTool className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-serif text-xl tracking-tight text-slate-800">iSkills2</span>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          <p className="text-[10px] uppercase tracking-widest font-black text-[#C4A882] mb-1">
            Menu
          </p>
          <span className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#C4A882]/10 text-[#C4A882] font-medium text-sm">
            <BookOpen className="h-4 w-4" />
            Skills Library
          </span>
        </nav>
        <div className="mt-auto">
          <div className="p-3 rounded-xl border border-[#DDD8CF] bg-[#F5F1EB] mb-3">
            <p className="text-sm font-medium truncate text-slate-700">{userEmail}</p>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-500 hover:bg-slate-100 text-sm transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-7">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif text-4xl text-slate-800 mb-1">Skills Library</h1>
            <p className="text-slate-500 text-sm">Manage and curate your automated capabilities.</p>
          </div>
          <Btn variant="primary" onClick={onNewSkill}>
            <Plus className="h-4 w-4" />
            Create Skill
          </Btn>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            {statCards.map(({ label, value, Icon }) => (
              <div
                key={label}
                className="bg-white border border-[#DDD8CF] rounded-2xl p-5 flex items-center gap-4"
              >
                <div className="h-10 w-10 rounded-full bg-[#C4A882]/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-[#C4A882]" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-2xl font-serif text-slate-800 mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Skills grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#C4A882]" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white border border-[#DDD8CF] rounded-3xl">
            <div className="h-14 w-14 bg-[#C4A882]/10 rounded-full flex items-center justify-center mb-4">
              <BookOpen className="h-7 w-7 text-[#C4A882]" />
            </div>
            <h3 className="font-serif text-2xl text-slate-800 mb-2">No skills yet</h3>
            <p className="text-slate-500 mb-5 text-center max-w-sm text-sm">
              Create your first skill to automate knowledge retrieval, formatting, or task
              execution.
            </p>
            <Btn variant="primary" onClick={onNewSkill}>
              Create your first skill
            </Btn>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <button
                key={skill.id}
                onClick={() => onEditSkill(skill.id)}
                className="group text-left bg-white border border-[#DDD8CF] hover:border-[#C4A882]/60 rounded-2xl p-5 flex flex-col gap-3 transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-800 group-hover:text-[#C4A882] transition-colors line-clamp-1">
                    {skill.name}
                  </h3>
                  <div
                    className={cn(
                      'h-2.5 w-2.5 rounded-full shrink-0 mt-1',
                      skill.enabled ? 'bg-green-500' : 'bg-slate-300',
                    )}
                  />
                </div>
                <p className="text-sm text-slate-500 line-clamp-2">{skill.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-[#DDD8CF] mt-auto">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    {skill.usageCount} uses
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {skill.lastUsedAt
                      ? new Date(skill.lastUsedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Never'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Skill form (shared by new + edit) ────────────────────────────────────────

function SkillFormView({
  initial,
  isNew,
  onBack,
  onSave,
  onDelete,
  showToast,
}: {
  initial: SkillFormData;
  isNew: boolean;
  onBack: () => void;
  onSave: (data: SkillFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [form, setForm] = useState<SkillFormData & { aiPrompt?: string }>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const set =
    <K extends keyof typeof form>(k: K) =>
    (v: (typeof form)[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  const updateExample = (i: number, v: string) => {
    const next = [...form.triggerExamples];
    next[i] = v;
    setForm((f) => ({ ...f, triggerExamples: next }));
  };

  const handleGenerate = async () => {
    if (!form.aiPrompt?.trim()) {
      showToast('Enter a description for the AI first', 'error');
      return;
    }
    setGenerating(true);
    try {
      const res = await apiFetch('/skills/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: form.aiPrompt }),
      });
      setForm((f) => ({
        ...f,
        name: res.name,
        description: res.description,
        instructions: res.instructions,
        triggerExamples: res.triggerExamples?.length ? res.triggerExamples : [''],
      }));
      showToast('Skill generated — review and save', 'success');
    } catch (err: any) {
      showToast(err.message || 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.description.trim() || !form.instructions.trim()) {
      showToast('Name, description and instructions are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        description: form.description,
        instructions: form.instructions,
        enabled: form.enabled,
        priority: form.priority,
        triggerExamples: form.triggerExamples.filter(Boolean),
      });
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testMsg.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/skills/match', {
        method: 'POST',
        body: JSON.stringify({ message: testMsg }),
      });
      setTestResult(res);
    } catch (err: any) {
      showToast(err.message || 'Test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete!();
    } catch (err: any) {
      showToast(err.message || 'Delete failed', 'error');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 max-w-3xl mx-auto w-full">
      {/* Back + title */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </button>
        <h1 className="font-serif text-4xl text-slate-800">
          {isNew ? 'Craft New Skill' : 'Edit Skill'}
        </h1>
      </div>

      {/* AI generator (new only) */}
      {isNew && (
        <div className="bg-[#F5F1EB] border border-[#DDD8CF] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 className="h-4 w-4 text-[#C4A882]" />
            <FieldLabel>AI Generator</FieldLabel>
          </div>
          <div className="flex gap-2">
            <FInput
              placeholder="Describe the skill you want to create…"
              value={form.aiPrompt || ''}
              onChange={(e) => setForm((f) => ({ ...f, aiPrompt: e.target.value }))}
              className="flex-1"
            />
            <Btn variant="outline" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
            </Btn>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        {/* Core fields */}
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 flex flex-col gap-5">
          <div>
            <FieldLabel>Skill Name</FieldLabel>
            <FInput
              placeholder="e.g. Code Review Assistant"
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <FTextarea
              rows={2}
              placeholder="What does this skill do?"
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Instructions</FieldLabel>
            <p className="text-xs text-slate-400 mb-1.5">
              System prompt injected when this skill is triggered.
            </p>
            <FTextarea
              rows={6}
              placeholder="You are an expert…"
              value={form.instructions}
              onChange={(e) => set('instructions')(e.target.value)}
            />
          </div>
        </div>

        {/* Trigger examples */}
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <FieldLabel>Trigger Examples</FieldLabel>
              <p className="text-xs text-slate-400 mt-0.5">
                Messages that should activate this skill.
              </p>
            </div>
            <Btn
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((f) => ({ ...f, triggerExamples: [...f.triggerExamples, ''] }))
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Btn>
          </div>
          {form.triggerExamples.map((ex, i) => (
            <div key={i} className="flex gap-2">
              <FInput
                value={ex}
                placeholder={`Example ${i + 1}`}
                onChange={(e) => updateExample(i, e.target.value)}
              />
              {form.triggerExamples.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      triggerExamples: f.triggerExamples.filter((_, j) => j !== i),
                    }))
                  }
                  className="text-slate-400 hover:text-red-400 transition-colors shrink-0 p-2"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Settings */}
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 flex flex-col gap-4">
          <FieldLabel>Settings</FieldLabel>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Enabled</p>
              <p className="text-xs text-slate-400">Skill will be triggered on matching messages</p>
            </div>
            <Toggle checked={form.enabled} onChange={set('enabled')} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-slate-700">
                Priority{' '}
                <span className="text-xs font-normal text-slate-400">(0 – 100)</span>
              </p>
              <span className="text-sm font-mono text-[#C4A882]">{form.priority}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={form.priority}
              onChange={(e) => set('priority')(Number(e.target.value))}
              className="w-full accent-[#C4A882]"
            />
          </div>
        </div>

        {/* Save / Delete row */}
        <div className="flex items-center gap-3 justify-between">
          {onDelete && !confirmDelete && (
            <Btn
              type="button"
              variant="ghost"
              className="text-red-400 hover:bg-red-50 hover:text-red-500"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Btn>
          )}
          {confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-500 font-medium">Delete this skill?</span>
              <Btn
                type="button"
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
              </Btn>
              <Btn
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Btn>
            </div>
          )}
          <Btn type="submit" variant="primary" disabled={saving} className="ml-auto">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? 'Create Skill' : 'Save Changes'}
          </Btn>
        </div>
      </form>

      {/* Test panel */}
      <div className="bg-white border border-[#DDD8CF] rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#DDD8CF]">
          <FieldLabel>Test Skill Matching</FieldLabel>
          <p className="text-xs text-slate-400 mt-0.5 mb-3">
            Enter a message to see if your saved skills would trigger.
          </p>
          <div className="flex gap-2">
            <FInput
              placeholder="Type a test message…"
              value={testMsg}
              onChange={(e) => setTestMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
              className="flex-1"
            />
            <Btn
              type="button"
              variant="primary"
              onClick={handleTest}
              disabled={testing || !testMsg.trim()}
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run Test'}
            </Btn>
          </div>
        </div>

        {testResult && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              {testResult.wouldTrigger ? (
                <div className="h-9 w-9 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
              ) : (
                <div className="h-9 w-9 rounded-full bg-red-500/10 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-500" />
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-800">
                  {testResult.wouldTrigger ? 'Match Found' : 'No Match'}
                </p>
                <p className="text-xs text-slate-500">
                  Confidence:{' '}
                  <span className="font-mono">{testResult.triggerScore?.toFixed(2) ?? 'N/A'}</span>
                </p>
              </div>
            </div>
            {testResult.wouldTrigger && (
              <>
                <div>
                  <FieldLabel>Injected Prompt</FieldLabel>
                  <div className="mt-1 bg-[#F5F1EB] p-4 rounded-xl text-xs font-mono whitespace-pre-wrap text-slate-600 max-h-40 overflow-y-auto border border-[#DDD8CF]">
                    {testResult.injectedPrompt}
                  </div>
                </div>
                {testResult.sampleResponse && (
                  <div>
                    <FieldLabel>Preview Response</FieldLabel>
                    <div className="mt-1 bg-white border border-[#C4A882]/20 p-4 rounded-xl text-sm whitespace-pre-wrap text-slate-700 max-h-40 overflow-y-auto">
                      {testResult.sampleResponse}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit skill (fetches data, then renders SkillFormView) ────────────────────

function EditSkillView({
  id,
  onBack,
  onDeleted,
  onSaved,
  showToast,
}: {
  id: string;
  onBack: () => void;
  onDeleted: () => void;
  onSaved: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Skill>(`/skills/${id}`)
      .then(setSkill)
      .catch((err) => showToast(err.message || 'Failed to load skill', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#C4A882]" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-slate-500">Skill not found.</p>
        <Btn variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Btn>
      </div>
    );
  }

  return (
    <SkillFormView
      isNew={false}
      initial={{
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        enabled: skill.enabled,
        priority: skill.priority,
        triggerExamples: skill.triggerExamples.length ? skill.triggerExamples : [''],
      }}
      onBack={onBack}
      showToast={showToast}
      onSave={async (data) => {
        const updated = await apiFetch<Skill>(`/skills/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        setSkill(updated);
        onSaved();
      }}
      onDelete={async () => {
        await apiFetch(`/skills/${id}`, { method: 'DELETE' });
        onDeleted();
      }}
    />
  );
}

// ─── Portal shell ─────────────────────────────────────────────────────────────

export default function ISkills2App() {
  const [isOpen, setIsOpen] = useRecoilState(iSkills2OpenAtom);
  const [isMinimized, setIsMinimized] = useRecoilState(iSkills2MinimizedAtom);
  const isAnyMaximizedValue = useRecoilValue(isAnyPortalMaximizedSelector);
  const portalOffsets = useRecoilValue(portalOffsetsSelector);
  const bottomOffset = (portalOffsets as any).iSkills2 ?? 0;

  const [isMaximized, setIsMaximized] = useState(false);
  const [view, setView] = useState<View>('login');
  const [userEmail, setUserEmail] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback(
    (msg: string, type: 'success' | 'error') => setToast({ msg, type }),
    [],
  );

  // Restore session when portal is opened
  useEffect(() => {
    if (!isOpen) return;
    const token = getToken();
    if (!token) {
      setView('login');
      return;
    }
    apiFetch('/auth/me')
      .then((u) => {
        setUserEmail(u.email);
        setView('dashboard');
      })
      .catch(() => {
        clearToken();
        setView('login');
      });
  }, [isOpen]);

  const toggleMaximize = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
      setIsMaximized(true);
    } else {
      document.exitFullscreen();
      setIsMaximized(false);
    }
  };

  useEffect(() => {
    const h = () => setIsMaximized(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  if (!isOpen) return null;

  const renderContent = () => {
    if (view === 'login') {
      return (
        <LoginView
          onSuccess={(email) => {
            setUserEmail(email);
            setView('dashboard');
          }}
          onRegister={() => setView('register')}
        />
      );
    }
    if (view === 'register') {
      return (
        <RegisterView
          onSuccess={(email) => {
            setUserEmail(email);
            setView('dashboard');
          }}
          onLogin={() => setView('login')}
        />
      );
    }
    if (view === 'dashboard') {
      return (
        <DashboardView
          userEmail={userEmail}
          onNewSkill={() => setView('new-skill')}
          onEditSkill={(id) => setView({ type: 'edit-skill', id })}
          onLogout={() => {
            clearToken();
            setUserEmail('');
            setView('login');
          }}
          showToast={showToast}
        />
      );
    }
    if (view === 'new-skill') {
      return (
        <SkillFormView
          isNew
          initial={{
            name: '',
            description: '',
            instructions: '',
            enabled: true,
            priority: 50,
            triggerExamples: [''],
          }}
          onBack={() => setView('dashboard')}
          showToast={showToast}
          onSave={async (data) => {
            const res = await apiFetch<Skill>('/skills', {
              method: 'POST',
              body: JSON.stringify(data),
            });
            showToast('Skill created!', 'success');
            setView({ type: 'edit-skill', id: res.id });
          }}
        />
      );
    }
    if (typeof view === 'object' && view.type === 'edit-skill') {
      return (
        <EditSkillView
          id={view.id}
          onBack={() => setView('dashboard')}
          onDeleted={() => {
            showToast('Skill deleted', 'success');
            setView('dashboard');
          }}
          onSaved={() => showToast('Changes saved', 'success')}
          showToast={showToast}
        />
      );
    }
    return null;
  };

  return (
    <>
      {/* Minimised floating pill */}
      <div
        className={cn(
          'fixed right-4 z-[101] flex w-56 select-none items-center gap-3 rounded-full',
          'border border-[#DDD8CF] bg-white/95 px-4 py-2 shadow-2xl backdrop-blur-2xl',
          'transition-all duration-500 ease-in-out',
          isMinimized && !isAnyMaximizedValue
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-10 opacity-0',
        )}
        style={{ bottom: `${16 + bottomOffset}px` }}
      >
        <Zap className="h-4 w-4 text-[#C4A882]" />
        <span className="mr-1 text-sm font-black tracking-tighter text-[#C4A882]">iSkills2</span>
        <button
          onClick={() => setIsMinimized(false)}
          className="ml-auto rounded-full border border-[#C4A882]/20 bg-[#C4A882]/10 px-4 py-1.5 text-[11px] font-semibold text-[#C4A882] transition-all hover:bg-[#C4A882]/20 active:scale-95"
        >
          Restore
        </button>
        <button
          onClick={handleClose}
          className="ml-1 p-1 text-slate-400 transition-colors hover:text-rose-400"
        >
          <X className="h-4 w-4 stroke-[2]" />
        </button>
      </div>

      {/* Full window */}
      <div
        className={cn(
          'fixed inset-0 z-[101] flex flex-col',
          'transition-all duration-700 ease-[cubic-bezier(0.23_1_0.32_1)]',
          isMinimized
            ? 'pointer-events-none translate-y-10 scale-95 opacity-0'
            : 'translate-y-0 scale-100 opacity-100',
        )}
      >
        <div className="flex h-full flex-col overflow-hidden border border-[#DDD8CF] bg-[#F5F1EB] font-sans text-slate-800">
          {/* Title bar */}
          <div className="sticky top-0 z-40 flex shrink-0 items-center justify-between border-b border-[#DDD8CF] bg-white px-6 py-3">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[#C4A882]" />
              <h1 className="text-lg font-black uppercase tracking-tighter text-[#C4A882]">
                iSkills2
              </h1>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Skill Manager
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                title="Minimize"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={toggleMaximize}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                title={isMaximized ? 'Exit Full Screen' : 'Full Screen'}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={handleClose}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden flex flex-col">{renderContent()}</div>
        </div>

        {toast && (
          <InlineToast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
        )}
      </div>
    </>
  );
}
