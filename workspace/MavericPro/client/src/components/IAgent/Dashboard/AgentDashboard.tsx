import { useState, useMemo, useEffect } from 'react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { iAgentActiveTabAtom } from '~/store/portalStack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '~/hooks/AuthContext';
import { Link } from 'react-router-dom'; // MavericPro uses react-router-dom
import CreateSkillPanel from './CreateSkillPanel';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Separator } from './ui/separator';
import { useToast } from './use-toast';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Plug,
  Wrench,
  MessageCircle,
  Facebook,
  Instagram,
  Mail,
  Cloud,
  Globe,
  Youtube,
  Video,
  FileText,
  BarChart2,
  Search,
  Camera,
  Cpu,
  Download,
  Code2,
  Database,
  Scan,
  Table,
  Bot,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Wifi,
  Link2,
  Shield,
  Zap,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  Layers,
  ImagePlus,
  Terminal,
  Calendar,
  Sparkles,
  Clock,
  X,
  AlertCircle,
  PlayCircle,
  CheckCheck,
  Ban,
  ListTodo,
  Heart,
  Reply,
  Forward,
  Inbox,
  MessageSquare,
  ThumbsUp,
  AtSign,
  Rss,
  ScanSearch,
  MousePointerClick,
  ShieldCheck,
  BrainCircuit,
  ShoppingBag,
  Tag,
  LayoutList,
  FileDown,
  Smartphone,
  PhoneCall,
  BotMessageSquare,
  Power,
  Code,
  FileCode,
  Info,
  Terminal as TerminalIcon,
  ChevronRight,
  ShieldAlert,
  Brain,
  Settings,
  ArrowUpDown,
  Minimize2,
} from 'lucide-react';
import { BUILTIN_TOOLS_DOCS } from './builtinTools';

// --- Types ---

export interface Integration {
  id: string;
  platform: string;
  label: string;
  siteUrl: string;
  username?: string;
  password?: string;
  notes?: string;
  connected: boolean;
}

export interface AgentToolSetting {
  id: string;
  toolId: string;
  enabled: boolean;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  scheduleType: string;
  nextRun: string;
  lastRun?: string;
  lastResult?: string;
  status: string;
  model: string;
  notifyPhone?: string;
}

// --- API Utility ---

async function apiRequest(method: string, url: string, data?: any, token?: string) {
  const fullUrl = url.startsWith('/api/inexus')
    ? url
    : `/api/inexus${url.startsWith('/') ? '' : '/'}${url}`;

  const headers: Record<string, string> = {};
  if (data) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// --- Configuration ---

const PLATFORM_CONFIG: Record<string, any> = {
  custom: {
    label: 'Custom Website',
    icon: Globe,
    color: 'text-indigo-400',
    bg: 'bg-slate-900 border-slate-800',
    loginUrl: '',
    description: 'Add any website with login credentials for the agent to use',
    needsCredentials: true,
  },
};

const TOOL_CATEGORIES = [
  {
    id: 'browser',
    label: 'Web Browser',
    icon: Globe,
    color: 'text-[#58504a]',
    description: 'Control the real Chromium browser',
    tools: [
      {
        id: 'browser_navigate',
        name: 'Navigate',
        description: 'Go to any URL in the visible browser',
        icon: Link2,
      },
      {
        id: 'browser_click',
        name: 'Click',
        description: 'Click on elements at coordinates',
        icon: Eye,
      },
      { id: 'browser_type', name: 'Type', description: 'Type text into input fields', icon: Code2 },
      {
        id: 'browser_scroll',
        name: 'Scroll',
        description: 'Scroll pages up and down',
        icon: RefreshCw,
      },
      {
        id: 'browser_read_page',
        name: 'Read Page',
        description: 'Extract text content from current page',
        icon: FileText,
      },
      {
        id: 'browser_get_elements',
        name: 'Get Elements',
        description: 'Find interactive elements and coordinates',
        icon: Scan,
      },
      {
        id: 'browser_hover',
        name: 'Hover',
        description: 'Mouse hover for dropdown menus',
        icon: Eye,
      },
      {
        id: 'browser_press_key',
        name: 'Press Key',
        description: 'Press keyboard keys (Enter, Tab, etc.)',
        icon: Cpu,
      },
      {
        id: 'browser_clear_input',
        name: 'Clear Input',
        description: 'Clear text in input fields',
        icon: Trash2,
      },
      {
        id: 'browser_analyze_page',
        name: 'Analyze Page (Vision)',
        description: 'AI vision: understand page content and layout visually',
        icon: BrainCircuit,
      },
      {
        id: 'browser_find_element_visual',
        name: 'Find Element (Vision)',
        description: 'AI vision: locate any element by description, returns coordinates',
        icon: ScanSearch,
      },
      {
        id: 'browser_smart_click',
        name: 'Smart Click (Vision)',
        description: 'AI vision: find and click any element by plain-English description',
        icon: MousePointerClick,
      },
      {
        id: 'browser_verify_action',
        name: 'Verify Action (Vision)',
        description: 'AI vision: confirm if last action succeeded by analyzing screenshot',
        icon: ShieldCheck,
      },
      {
        id: 'browser_dismiss_popups',
        name: 'Dismiss Popups',
        description:
          'Auto-dismiss cookie banners, GDPR modals, alerts & overlays blocking interaction',
        icon: Ban,
      },
      {
        id: 'browser_wait_for_content',
        name: 'Wait for Content',
        description:
          'Wait until specific text/content appears on page (after forms, logins, AJAX loads)',
        icon: Clock,
      },
      {
        id: 'browser_wait_for_load',
        name: 'Wait for Load',
        description: 'Wait for page to fully finish loading before taking next action',
        icon: RefreshCw,
      },
      {
        id: 'browser_scroll_to_and_click',
        name: 'Scroll & Click',
        description:
          'Scroll element into view by CSS selector then click — for off-screen elements',
        icon: Layers,
      },
      {
        id: 'browser_detect_captcha_or_2fa',
        name: 'Detect CAPTCHA / 2FA',
        description:
          'Scan for reCAPTCHA, hCaptcha, Cloudflare Turnstile, 2FA fields, and bot-block pages',
        icon: Shield,
      },
      {
        id: 'browser_solve_captcha',
        name: 'Solve CAPTCHA',
        description: 'Auto-click reCAPTCHA checkbox or wait for Cloudflare Turnstile auto-resolve',
        icon: CheckCircle2,
      },
      {
        id: 'browser_enter_2fa_code',
        name: 'Enter 2FA Code',
        description: 'Type user-provided 2FA/OTP code into the detected field and submit',
        icon: Cpu,
      },
      {
        id: 'browser_check_bot_blocked',
        name: 'Check Bot Blocked',
        description: 'Detect if site blocked automated access with recovery suggestions',
        icon: AlertCircle,
      },
      {
        id: 'browser_apply_stealth',
        name: 'Apply Stealth Mode',
        description:
          'Hide browser automation fingerprints (webdriver flag, plugins) to reduce bot detection',
        icon: Zap,
      },
      {
        id: 'browser_wait_for_dom_change',
        name: 'Wait for DOM Change',
        description:
          'Wait for any DOM mutation — essential for SPAs, AJAX loads, and dynamic content',
        icon: Sparkles,
      },
      {
        id: 'browser_wait_for_element_appear',
        name: 'Wait for Element',
        description:
          'Wait for a specific CSS selector to appear in the DOM (more precise than Wait for Content)',
        icon: ScanSearch,
      },
      {
        id: 'browser_trigger_infinite_scroll',
        name: 'Infinite Scroll',
        description:
          'Scroll to bottom N times to load more feed items (Twitter, Instagram, Reddit, LinkedIn)',
        icon: Rss,
      },
      {
        id: 'browser_wait_for_spa_navigation',
        name: 'Wait for SPA Nav',
        description: 'Wait for SPA URL change after clicking links in React/Vue/Next.js apps',
        icon: Link2,
      },
      {
        id: 'browser_extract_dynamic_content',
        name: 'Extract Dynamic Content',
        description:
          'Extract text from all matching elements — posts, comments, products, emails in bulk',
        icon: Database,
      },
    ],
  },
  {
    id: 'background',
    label: 'Background Browser',
    icon: Bot,
    color: 'text-amber-600',
    description: "Silent browser operations (user doesn't see)",
    tools: [
      {
        id: 'bg_navigate',
        name: 'BG Navigate',
        description: 'Navigate silently without showing browser',
        icon: Link2,
      },
      { id: 'bg_click', name: 'BG Click', description: 'Click silently in background', icon: Eye },
      { id: 'bg_type', name: 'BG Type', description: 'Type silently in background', icon: Code2 },
      {
        id: 'bg_read_page',
        name: 'BG Read Page',
        description: 'Read page content in background',
        icon: FileText,
      },
      {
        id: 'bg_get_elements',
        name: 'BG Get Elements',
        description: 'Get elements in background',
        icon: Scan,
      },
      { id: 'bg_scroll', name: 'BG Scroll', description: 'Scroll in background', icon: RefreshCw },
      {
        id: 'bg_press_key',
        name: 'BG Press Key',
        description: 'Press keys in background',
        icon: Cpu,
      },
      {
        id: 'bg_clear_input',
        name: 'BG Clear Input',
        description: 'Clear input in background',
        icon: Trash2,
      },
    ],
  },

  {
    id: 'search',
    label: 'Search & Research',
    icon: Search,
    color: 'text-[#58504a]',
    description: 'Web search and information gathering',
    tools: [
      {
        id: 'search_web',
        name: 'Web Search',
        description: 'Search the web via DuckDuckGo',
        icon: Search,
      },
      {
        id: 'search_images',
        name: 'Image Search',
        description: 'Search Google Images for visuals',
        icon: Camera,
      },
      {
        id: 'scrape_website',
        name: 'Scrape Website',
        description: 'Extract text from any URL silently',
        icon: Database,
      },
      {
        id: 'extract_table_data',
        name: 'Extract Tables',
        description: 'Extract structured table data from pages',
        icon: Table,
      },
    ],
  },
  {
    id: 'scraping',
    label: 'Data Extraction',
    icon: Download,
    color: 'text-[#58504a]',
    description: 'Scrape, extract, and export structured data from any website',
    tools: [
      {
        id: 'scrape_main_content',
        name: 'Extract Main Content',
        description: 'Clean readable article/body text — strips nav, ads, footer from any page',
        icon: FileText,
      },
      {
        id: 'scrape_links',
        name: 'Extract All Links',
        description:
          'All hyperlinks on current page with anchor text and URL — filterable by keyword',
        icon: Link2,
      },
      {
        id: 'scrape_contact_info',
        name: 'Extract Contact Info',
        description: 'Find emails, phone numbers, and addresses on any page — great for lead gen',
        icon: AtSign,
      },
      {
        id: 'scrape_product_info',
        name: 'Extract Product Data',
        description:
          'Auto-detect product title, price, rating, availability, SKU, description from any e-commerce page',
        icon: ShoppingBag,
      },
      {
        id: 'scrape_page_metadata',
        name: 'Extract SEO Metadata',
        description: 'Page title, meta description, keywords, Open Graph tags, canonical URL',
        icon: Tag,
      },
      {
        id: 'scrape_repeating_elements',
        name: 'Extract Listing Data',
        description:
          'CSS selector-based bulk extraction of repeating elements — product cards, job listings, news articles',
        icon: LayoutList,
      },
      {
        id: 'scrape_paginate_collect',
        name: 'Multi-Page Scrape',
        description: 'Auto-click Next Page button and collect data across all pages of a listing',
        icon: Layers,
      },
      {
        id: 'export_data',
        name: 'Export as CSV / JSON',
        description: 'Download collected data as a CSV spreadsheet or JSON file',
        icon: FileDown,
      },
    ],
  },
  {
    id: 'content',
    label: 'Content Creation',
    icon: FileText,
    color: 'text-[#58504a]',
    description: 'Create documents, reports, presentations, and files',
    tools: [
      {
        id: 'create_pdf',
        name: 'Create PDF',
        description: 'Export any browser page to PDF',
        icon: FileText,
      },
      {
        id: 'create_report',
        name: 'Create Report',
        description: 'Generate professional HTML reports',
        icon: BarChart2,
      },
      {
        id: 'create_powerpoint',
        name: 'Create PowerPoint',
        description: 'Build polished .pptx presentations with themed slides',
        icon: Layers,
      },
      {
        id: 'take_full_screenshot',
        name: 'Full Screenshot',
        description: 'Capture full-page screenshot as PNG',
        icon: Camera,
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI Generation',
    icon: Sparkles,
    color: 'text-[#58504a]',
    description: 'Generate AI images, run code, and use AI capabilities',
    tools: [
      {
        id: 'generate_ai_image',
        name: 'Generate AI Image',
        description: 'Create AI images from text prompts using Flux (Pollinations.ai)',
        icon: ImagePlus,
      },
      {
        id: 'run_python_code',
        name: 'Run Python Code',
        description: 'Execute Python 3 code and return output — data, math, automation',
        icon: Terminal,
      },
    ],
  },
  {
    id: 'social',
    label: 'Social & Messaging',
    icon: MessageCircle,
    color: 'text-[#58504a]',
    description: 'Read, write, post, DM, like, and comment on all social platforms',
    tools: [
      {
        id: 'read_social_feed',
        name: 'Read Feed',
        description:
          'Browse the main feed/timeline on Facebook, Instagram, Twitter/X, TikTok, LinkedIn, or Telegram',
        icon: Rss,
      },
      {
        id: 'read_dm_inbox',
        name: 'Read DMs',
        description:
          'Open the messaging inbox on any platform — Facebook, Instagram, Twitter/X, Telegram, TikTok, LinkedIn',
        icon: Inbox,
      },
      {
        id: 'send_direct_message',
        name: 'Send DM',
        description:
          'Send a direct message to any person on Facebook, Instagram, Twitter/X, Telegram, or LinkedIn',
        icon: Send,
      },
      {
        id: 'read_telegram_chat',
        name: 'Read Telegram Chat',
        description: 'Open Telegram Web and read messages in a chat or group',
        icon: MessageSquare,
      },
      {
        id: 'post_to_facebook',
        name: 'Post to Facebook',
        description: 'Compose and post content to Facebook page or profile',
        icon: Facebook,
      },
      {
        id: 'post_to_instagram',
        name: 'Post to Instagram',
        description: 'Compose and publish a new Instagram post with caption',
        icon: Instagram,
      },
      {
        id: 'post_to_tiktok',
        name: 'Post to TikTok',
        description: 'Open TikTok Creator Center to upload and publish a video',
        icon: Video,
      },
      {
        id: 'post_tweet',
        name: 'Post Tweet',
        description: 'Post a new tweet or reply to an existing tweet on Twitter/X',
        icon: AtSign,
      },
      {
        id: 'comment_on_post',
        name: 'Comment on Post',
        description: 'Leave a comment or reply on the currently open social media post',
        icon: Reply,
      },
      {
        id: 'like_post',
        name: 'Like / React',
        description: 'Like, react, or heart the currently open post on any social platform',
        icon: Heart,
      },
      {
        id: 'search_social_media',
        name: 'Search Social Media',
        description: 'Search any platform for posts, accounts, or hashtags',
        icon: Search,
      },
    ],
  },
  {
    id: 'email',
    label: 'Email',
    icon: Mail,
    color: 'text-[#58504a]',
    description: 'Full email management — read, send, reply, forward, delete in Gmail & iCloud',
    tools: [
      {
        id: 'read_gmail_inbox',
        name: 'Read Gmail Inbox',
        description: 'Open Gmail and read your latest inbox emails',
        icon: Inbox,
      },
      {
        id: 'read_icloud_inbox',
        name: 'Read iCloud Inbox',
        description: 'Open iCloud Mail and read your latest inbox emails',
        icon: Cloud,
      },
      {
        id: 'read_email_message',
        name: 'Find & Read Email',
        description: 'Search Gmail or iCloud for a specific email by sender, subject, or keyword',
        icon: Search,
      },
      {
        id: 'send_email_gmail',
        name: 'Send via Gmail',
        description: 'Compose and send a new email via Gmail',
        icon: Send,
      },
      {
        id: 'send_email_icloud',
        name: 'Send via iCloud',
        description: 'Compose and send a new email via iCloud Mail',
        icon: Send,
      },
      {
        id: 'reply_to_email',
        name: 'Reply to Email',
        description: 'Reply to the currently open email in the browser',
        icon: Reply,
      },
      {
        id: 'forward_email',
        name: 'Forward Email',
        description: 'Forward the currently open email to another address',
        icon: Forward,
      },
      {
        id: 'delete_email',
        name: 'Delete Email',
        description: 'Move the currently open email to trash',
        icon: Trash2,
      },
      {
        id: 'search_email',
        name: 'Search Email',
        description: 'Search Gmail or iCloud for emails by keyword, sender, or subject',
        icon: Search,
      },
    ],
  },
  {
    id: 'scheduling',
    label: 'Scheduling & Automation',
    icon: Clock,
    color: 'text-[#58504a]',
    description: 'Schedule tasks to run automatically at a future time',
    tools: [
      {
        id: 'manage_calendar',
        name: 'Manage Calendar',
        description: 'Open Google Calendar to view or create events',
        icon: Calendar,
      },
      {
        id: 'schedule_task',
        name: 'Schedule Task',
        description: 'Schedule any task to run automatically at a future time',
        icon: Clock,
      },
      {
        id: 'list_scheduled_tasks',
        name: 'List Scheduled Tasks',
        description: 'View all scheduled tasks and their status',
        icon: ListTodo,
      },
      {
        id: 'cancel_scheduled_task',
        name: 'Cancel Task',
        description: 'Cancel a pending scheduled task by ID',
        icon: Ban,
      },
    ],
  },
  {
    id: 'multimedia',
    label: 'Media & Intelligence',
    icon: Youtube,
    color: 'text-[#58504a]',
    description: 'Process visuals and download media',
    tools: [
      {
        id: 'download_media',
        name: 'Download Media',
        description: 'Download YouTube, Instagram, TikTok, Facebook videos & audio',
        icon: Youtube,
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced & Automation',
    icon: Code2,
    color: 'text-[#58504a]',
    description: 'Power tools for automation',
    tools: [
      {
        id: 'execute_js_in_browser',
        name: 'Execute JavaScript',
        description: 'Run custom JS code in browser context',
        icon: Code2,
      },
      {
        id: 'get_credentials',
        name: 'Get Credentials',
        description: 'Retrieve saved login credentials',
        icon: Shield,
      },
      {
        id: 'smart_fill_form',
        name: 'Smart Form Fill',
        description: 'Automatically fill form fields on any website using JS injection',
        icon: Zap,
      },
      {
        id: 'messenger_read_chats',
        name: 'Read Messenger',
        description: 'Open Facebook Messenger and read all conversations',
        icon: MessageSquare,
      },
      {
        id: 'messenger_send_message',
        name: 'Send Messenger Message',
        description: 'Send a message to a Facebook contact via Messenger',
        icon: Send,
      },
    ],
  },
];

// --- Sub-components ---

function ConnectDialog({ platform, existing, open, onClose }: any) {
  const { token } = useAuthContext();
  const config = PLATFORM_CONFIG[platform];
  const qc = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState(existing?.label || config?.label || '');
  const [siteUrl, setSiteUrl] = useState(existing?.siteUrl || config?.loginUrl || '');
  // Only use existing credentials if we're editing an existing integration
  // For new integrations, always start with empty fields
  const [username, setUsername] = useState(existing ? existing.username || '' : '');
  const [password, setPassword] = useState(existing ? existing.password || '' : '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [showPassword, setShowPassword] = useState(false);

  // Reset form when dialog opens for a new integration
  useEffect(() => {
    if (open) {
      setLabel(existing?.label || config?.label || '');
      setSiteUrl(existing?.siteUrl || config?.loginUrl || '');
      setUsername(existing ? existing.username || '' : '');
      setPassword(existing ? existing.password || '' : '');
      setNotes(existing?.notes || '');
      setShowPassword(false);
    }
  }, [open, existing, config]);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/integrations', data, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/inexus/integrations'] });
      toast({ title: 'Integration added', description: `${config?.label} is now connected.` });
      onClose();
    },
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/integrations/${existing?.id}`, data, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/inexus/integrations'] });
      toast({ title: 'Integration updated' });
      onClose();
    },
  });

  const handleSave = () => {
    const data = { platform, label, siteUrl, username, password, notes, connected: true };
    if (existing) updateMut.mutate(data);
    else createMut.mutate(data);
  };

  if (!config) return null;
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="dark max-w-md overflow-hidden rounded-[32px] border-orange-500/30 bg-[#020617] p-0 text-slate-100 shadow-[0_0_50px_-12px_rgba(249,115,22,0.2)]">
        <div className="p-8">
          <DialogHeader className="mb-6">
            <div className="mb-2 flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 shadow-xl ${config.color}`}
              >
                <Icon className="h-6 w-6" />
              </div>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">
                {existing ? `Update ${config.label}` : `Connect ${config.label}`}
              </DialogTitle>
            </div>
            <DialogDescription className="font-medium text-slate-400">
              {existing
                ? `Securely update your saved access credentials.`
                : `Store your credentials locally to allow the agent to navigate this portal.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {platform === 'custom' && (
              <div className="space-y-2">
                <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Portal Name
                </Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. My Bank, Work Portal..."
                  className="h-12 rounded-2xl border-white/10 bg-slate-950/50 font-medium transition-all focus-visible:border-orange-500 focus-visible:ring-orange-500"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Login Gateway URL
              </Label>
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://..."
                className="h-12 rounded-2xl border-white/10 bg-slate-950/50 font-medium transition-all focus-visible:border-orange-500 focus-visible:ring-orange-500"
              />
            </div>
            {config.needsCredentials && (
              <>
                <div className="space-y-2">
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Access Identity (Email/User)
                  </Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your@email.com"
                    className="h-12 rounded-2xl border-white/10 bg-slate-950/50 font-medium transition-all focus-visible:border-orange-500 focus-visible:ring-orange-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Secure Passkey
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="password-input-faint h-12 rounded-2xl border-white/10 bg-slate-950/50 pr-12 font-medium transition-all focus-visible:border-orange-500 focus-visible:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-orange-500"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-start gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-[11px] font-medium leading-relaxed text-slate-400">
                <span className="mr-1 font-black uppercase text-amber-500">Local Encryption:</span>
                Credentials are stored in your local vault. The agent injects these during auth
                flows to bypass manual barriers.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between border-t border-white/5 bg-slate-900/30 p-6 px-8">
          <Button
            variant="ghost"
            onClick={onClose}
            className="rounded-xl font-bold text-slate-500 hover:bg-white/5 hover:text-white"
          >
            Abort
          </Button>
          <Button
            onClick={handleSave}
            disabled={createMut.isPending || updateMut.isPending}
            className="h-12 rounded-2xl border-0 bg-gradient-to-r from-orange-500 to-amber-500 px-8 font-black text-white shadow-lg shadow-orange-500/20 transition-all hover:from-orange-400 hover:to-amber-400 active:scale-95"
          >
            {createMut.isPending || updateMut.isPending
              ? 'Synchronizing...'
              : existing
                ? 'Update Vault'
                : 'Authorize Portal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationCard({ platform, integration, onEdit, onDelete }: any) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) return null;
  const connected = !!integration?.connected;
  const Icon = config.icon;

  return (
    <div
      className={`group relative rounded-3xl border border-white/5 bg-slate-900/40 p-6 transition-all duration-500 hover:border-orange-500/40 hover:shadow-[0_20px_40px_-15px_rgba(249,115,22,0.15)] ${connected ? 'border-orange-500/30 ring-1 ring-orange-500/20' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <div
            className={`rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-xl transition-colors group-hover:border-indigo-500/30 ${config.color}`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold tracking-tight text-white">{config.label}</h3>
            <div className="mt-1 flex items-center gap-1.5">
              {connected ? (
                <>
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
                    Active Link
                  </span>
                </>
              ) : (
                <>
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    Disconnected
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {integration && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full text-slate-600 transition-colors hover:bg-red-400/10 hover:text-red-400"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="mb-6 mt-4 line-clamp-2 h-8 text-xs font-medium leading-relaxed text-slate-400">
        {config.description}
      </p>
      <Button
        size="sm"
        variant={connected ? 'outline' : 'default'}
        className={`h-10 w-full rounded-xl text-xs font-bold transition-all ${
          connected
            ? 'border-slate-800 bg-slate-950/50 text-slate-300 hover:bg-slate-800'
            : 'border-0 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700'
        }`}
        onClick={onEdit}
      >
        {connected ? (
          <>
            <Wrench className="mr-2 h-3.5 w-3.5" />
            Manage Settings
          </>
        ) : (
          <>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Connect Account
          </>
        )}
      </Button>
    </div>
  );
}

const FUNCTIONAL_TOOLS = [
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_press_key',
  'browser_scroll',
  'browser_read_page',
  'browser_get_elements',
  'browser_clear_input',
  'browser_hover',
  'browser_analyze_page',
  'browser_find_element_visual',
  'browser_smart_click',
  'browser_verify_action',
  'browser_dismiss_popups',
  'browser_wait_for_load',
  'browser_scroll_to_and_click',
  'browser_detect_captcha_or_2fa',
  'browser_solve_captcha',
  'browser_enter_2fa_code',
  'browser_check_bot_blocked',
  'browser_apply_stealth',
  'browser_wait_for_dom_change',
  'browser_wait_for_element_appear',
  'browser_trigger_infinite_scroll',
  'browser_wait_for_spa_navigation',
  'browser_extract_dynamic_content',
  'search_web',
  'search_images',
  'present_as_graph',
  'get_credentials',
  'create_report',
  'scrape_website',
  'send_whatsapp_message',
  'post_to_facebook',
  'post_to_instagram',
  'post_to_tiktok',
  'send_email_gmail',
  'search_social_media',
  'read_social_feed',
  'read_dm_inbox',
  'send_direct_message',
  'smart_fill_form',
  'save_neural_memory',
  'bg_navigate',
  'bg_click',
  'bg_type',
  'bg_press_key',
  'bg_scroll',
  'bg_clear_input',
  'bg_read_page',
  'bg_get_elements',
  'browser_screenshot',
  'take_full_screenshot',
  'extract_table_data',
  'read_gmail_inbox',
  'read_icloud_inbox',
  'send_email_icloud',
];

function ToolRow({ tool, enabled, onToggle, onView }: any) {
  const Icon = tool.icon;
  const isFunc = FUNCTIONAL_TOOLS.includes(tool.id);

  return (
    <div
      className={`group relative rounded-2xl border border-white/5 bg-slate-900/40 p-5 transition-all duration-500 hover:scale-[1.01] hover:border-orange-500/40 hover:shadow-[0_15px_30px_-10px_rgba(249,115,22,0.15)] ${
        !enabled ? 'opacity-60' : ''
      }`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center space-x-4">
          <div
            className={`rounded-2xl p-3 ${isFunc ? 'border border-orange-500/20 bg-orange-500/10 text-orange-400 shadow-lg' : 'bg-slate-800/50 text-slate-500'}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3
              className={`mb-0.5 text-base font-bold tracking-tight ${isFunc ? 'text-white' : 'text-slate-400'}`}
            >
              {tool.name}
            </h3>
            <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">
              {tool.description}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isFunc ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onView(tool);
              }}
              className="h-8 w-8 rounded-full text-slate-500 hover:bg-indigo-500/10 hover:text-indigo-400"
            >
              <Eye className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center text-slate-700">
              <EyeOff className="h-4 w-4" />
            </div>
          )}
          <Switch
            checked={isFunc ? enabled : false}
            onCheckedChange={(v) => isFunc && onToggle(tool.id, v)}
            disabled={!isFunc}
            className="border-white/10 data-[state=checked]:bg-orange-500"
          />
        </div>
      </div>
    </div>
  );
}

function ViewSkillModal({
  tool,
  open,
  onClose,
}: {
  tool: any;
  open: boolean;
  onClose: () => void;
}) {
  const doc = BUILTIN_TOOLS_DOCS[tool?.id];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dark max-w-[750px] overflow-hidden rounded-[32px] border-emerald-500/30 bg-[#020617] p-0 text-slate-100 shadow-[0_0_50px_-12px_rgba(16,185,129,0.2)]">
        <div className="flex h-[600px] flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 bg-slate-900/30 p-8">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-500/5">
                {tool?.icon ? <tool.icon className="h-7 w-7" /> : <Brain className="h-7 w-7" />}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white">
                    {tool?.name}
                  </h3>
                  <Badge className="rounded-md border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-500">
                    Neural Skill
                  </Badge>
                </div>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  Internal logic and execution protocols
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-10 w-10 rounded-full border border-white/10 p-0 text-slate-500 hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="custom-scrollbar flex-1 space-y-10 overflow-y-auto p-8">
            {/* Description Section */}
            <section>
              <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                <Info className="h-3 w-3" /> System Description
              </h4>
              <div className="rounded-2xl border border-white/5 bg-white/5 p-5 text-sm font-medium leading-relaxed text-slate-300">
                {doc?.description ||
                  tool?.description ||
                  'This tool performs specialized browser or data operations.'}
              </div>
            </section>

            {/* Instructions Section */}
            <section>
              <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                <TerminalIcon className="h-3 w-3" /> Cognitive Integration
              </h4>
              <div className="whitespace-pre-wrap rounded-2xl border border-white/5 bg-amber-500/5 p-5 text-sm font-medium italic leading-relaxed text-slate-400">
                {doc?.instructions ||
                  'The agent triggers this skill automatically when relevant context is detected in the conversation.'}
              </div>
            </section>

            {/* Code Section */}
            <section>
              <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                <FileCode className="h-3 w-3" /> Logic Schema (TS)
              </h4>
              <div className="overflow-hidden rounded-2xl border border-white/5 bg-slate-950 shadow-inner">
                <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-5 py-3">
                  <div className="flex gap-2">
                    <div className="h-2.5 w-2.5 rounded-full border border-red-500/40 bg-red-500/20" />
                    <div className="h-2.5 w-2.5 rounded-full border border-amber-500/40 bg-amber-500/20" />
                    <div className="h-2.5 w-2.5 rounded-full border border-emerald-500/40 bg-emerald-500/20" />
                  </div>
                  <span className="font-mono text-[9px] font-black uppercase tracking-widest text-slate-600">
                    {tool?.id}.ts
                  </span>
                </div>
                <pre className="custom-scrollbar max-h-[300px] overflow-x-auto p-6 font-mono text-[11px] leading-relaxed text-emerald-400/80">
                  <code>
                    {doc?.code ||
                      `// Tool implementation details are internal
// Standard execution logic applied for ID: ${tool?.id}`}
                  </code>
                </pre>
              </div>
            </section>

            {/* Constraints */}
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-950/10">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <div className="text-sm font-bold text-amber-900 dark:text-amber-400">
                    System Constraint
                  </div>
                  <p className="mt-1 text-xs font-medium text-amber-700/80 dark:text-amber-500/70">
                    This is a protected system skill. Its fundamental logic cannot be edited by the
                    user to ensure agent stability and security.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t bg-stone-50/50 p-4 dark:bg-stone-900/20">
            <Button onClick={onClose} className="rounded-xl px-8 font-bold">
              Close View
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduledTasksPanel() {
  const { token } = useAuthContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<ScheduledTask[]>({
    queryKey: ['/api/inexus/scheduled-tasks'],
    queryFn: () => apiRequest('GET', '/scheduled-tasks', undefined, token),
    refetchInterval: 15000,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/scheduled-tasks/${id}`, undefined, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/inexus/scheduled-tasks'] });
      toast({ title: 'Task cancelled' });
    },
  });

  const pending = tasks.filter((t) => t.status === 'pending');
  const running = tasks.filter((t) => t.status === 'running');
  const completed = tasks.filter(
    (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled',
  );

  const StatusBadge = ({ status }: { status: string }) => {
    const configs: any = {
      pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700', icon: Clock },
      running: { label: 'Running', className: 'bg-blue-100 text-blue-700', icon: PlayCircle },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-700', icon: CheckCheck },
      failed: { label: 'Failed', className: 'bg-red-100 text-red-700', icon: AlertCircle },
      cancelled: { label: 'Cancelled', className: 'bg-stone-100 text-stone-500', icon: Ban },
    };
    const cfg = configs[status] || configs.pending;
    const Icon = cfg.icon;
    return (
      <div
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
      >
        <Icon className="h-3 w-3" />
        {cfg.label}
      </div>
    );
  };

  const TaskCard = ({ task }: { task: ScheduledTask }) => (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold leading-tight">{task.name}</span>
            <StatusBadge status={task.status} />
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        </div>
        {task.status === 'pending' && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => cancelMut.mutate(task.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span className="font-medium text-foreground/70">
            {task.status === 'pending' ? 'Next run:' : 'Ran:'}
          </span>
          {new Date(
            task.status === 'pending' ? task.nextRun : task.lastRun || task.nextRun,
          ).toLocaleString()}
        </span>
      </div>
      {task.lastResult && (
        <div className="max-h-[80px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-stone-200/40 bg-stone-100/50 p-2.5 font-mono text-xs leading-relaxed text-stone-600">
          {task.lastResult}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center py-20">
        <div className="relative mb-6">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orange-500" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-t-2 border-orange-500/10" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="animate-pulse text-sm font-black uppercase tracking-[0.2em] text-orange-500">
            Checking Task Matrix
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Synchronizing automated workflows...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:items-center">
          <h2 className="whitespace-nowrap text-3xl font-black uppercase tracking-tighter text-white">
            Scheduled Tasks
          </h2>
          <div className="hidden h-px flex-1 bg-white/10 lg:block" />
          <p className="max-w-xl text-[10px] font-black uppercase tracking-widest text-slate-500 lg:text-right">
            Automated workflows and periodic agent operations
          </p>
        </div>
        <Badge className="shrink-0 gap-1.5 rounded-full border-orange-500/20 bg-orange-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-orange-500 shadow-lg shadow-orange-500/5">
          <Clock className="h-3 w-3" />
          {pending.length + running.length} Active Modules
        </Badge>
      </div>
      <div className="group mb-12 rounded-[28px] border border-white/5 bg-slate-900/40 p-8 transition-all duration-700 hover:border-orange-500/20">
        <div className="flex-1">
          <h4 className="mb-2 text-[10px] font-black uppercase italic tracking-[0.3em] text-orange-500/80">
            Autonomous Hub Guide
          </h4>
          <p className="max-w-5xl text-[13px] font-medium leading-relaxed text-slate-400">
            To register a background operation, simply instruct the agent using natural language.
            For example:{' '}
            <span className="italic text-slate-200">"Check my unread messages every 2 hours"</span>{' '}
            or{' '}
            <span className="italic text-slate-200">
              "Prepare a summary of clinical research at 9:00 AM daily."
            </span>{' '}
            Intent-based registration occurs instantly.
          </p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="group relative flex flex-col items-center justify-center gap-8 overflow-hidden rounded-[40px] border border-white/5 bg-slate-900/30 py-24 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-500/[0.02] to-transparent" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-slate-800 shadow-inner transition-colors duration-500 group-hover:bg-orange-500/10">
            <Clock className="h-10 w-10 text-slate-600 transition-colors duration-500 group-hover:text-orange-500" />
          </div>
          <div className="relative space-y-2 text-center">
            <p className="text-xl font-black uppercase italic tracking-tighter text-white">
              Neural Vault Terminal
            </p>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              No automated workflows currently active in the cycle.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {running.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">Currently Running</h3>
              </div>
              <div className="space-y-3">
                {running.map((t) => (
                  <TaskCard key={t.id} task={t} />
                ))}
              </div>
            </div>
          )}
          {pending.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">Upcoming ({pending.length})</h3>
              </div>
              <div className="space-y-3">
                {pending.map((t) => (
                  <TaskCard key={t.id} task={t} />
                ))}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">History</h3>
              </div>
              <div className="space-y-3">
                {completed
                  .slice(-10)
                  .reverse()
                  .map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// WhatsAppBridgePanel removed - replaced by WhatsAppBoard.tsx

function TabsValue({ activeTab, children }: { activeTab: string; children: React.ReactNode }) {
  return (
    <Tabs value={activeTab} className="w-full duration-500 animate-in fade-in">
      {children}
    </Tabs>
  );
}

export default function AgentDashboard({
  onClose,
  onMinimize,
  onToggleMaximize,
  isMaximized,
  standalone,
}: {
  onClose?: () => void;
  onMinimize?: () => void;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
  standalone?: boolean;
}) {
  const { token } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useRecoilState(iAgentActiveTabAtom);
  const effectiveTab = standalone ? 'integrations' : activeTab;
  const [connectPlatform, setConnectPlatform] = useState<string | null>(null);
  const [editIntegration, setEditIntegration] = useState<Integration | null>(null);

  // Inject CSS for grey password dots
  useEffect(() => {
    const styleId = 'password-grey-dots';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
                .password-input-faint {
                    color: #9ca3af !important;
                }
                .dark .password-input-faint {
                    color: #6b7280 !important;
                }
                .password-input-faint::placeholder {
                    color: #d1d5db !important;
                }
                .dark .password-input-faint::placeholder {
                    color: #9ca3af !important;
                }
            `;
      document.head.appendChild(style);
    }
  }, []);

  const [viewTargetTool, setViewTargetTool] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const handleViewTool = (tool: any) => {
    setViewTargetTool(tool);
    setIsViewModalOpen(true);
  };

  const { data: integrations = [], isLoading: isIntegrationsLoading } = useQuery<Integration[]>({
    queryKey: ['/api/inexus/integrations'],
    queryFn: () => apiRequest('GET', '/integrations', undefined, token),
  });

  const { data: toolSettings = [], isLoading: isSettingsLoading } = useQuery<AgentToolSetting[]>({
    queryKey: ['/api/inexus/tool-settings'],
    queryFn: () => apiRequest('GET', '/tool-settings', undefined, token),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/integrations/${id}`, undefined, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/inexus/integrations'] });
      toast({ title: 'Integration removed' });
    },
  });

  const toolToggleMut = useMutation({
    mutationFn: ({ toolId, enabled }: { toolId: string; enabled: boolean }) =>
      apiRequest('POST', `/tool-settings/${toolId}`, { enabled }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/inexus/tool-settings'] });
    },
  });

  const getIntegrationForPlatform = (platform: string) =>
    integrations.find((i) => i.platform === platform);

  const isToolEnabled = (toolId: string) => {
    const setting = toolSettings.find((s) => s.toolId === toolId);
    return setting ? setting.enabled : true;
  };

  const totalToolsEnabled = TOOL_CATEGORIES.flatMap((c) => c.tools).filter((t) =>
    isToolEnabled(t.id),
  ).length;
  const totalTools = TOOL_CATEGORIES.flatMap((c) => c.tools).length;
  const connectedCount = integrations.filter((i) => i.connected).length;

  const handleEnableAll = () => {
    TOOL_CATEGORIES.flatMap((c) => c.tools).forEach((t) => {
      if (!isToolEnabled(t.id)) {
        toolToggleMut.mutate({ toolId: t.id, enabled: true });
      }
    });
  };

  const handleDisableAll = () => {
    TOOL_CATEGORIES.flatMap((c) => c.tools).forEach((t) => {
      if (isToolEnabled(t.id)) {
        toolToggleMut.mutate({ toolId: t.id, enabled: false });
      }
    });
  };

  const isLoading = isIntegrationsLoading || isSettingsLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-[600px] flex-col items-center justify-center bg-[#020617]">
        <div className="relative mb-8">
          <div className="h-20 w-20 animate-spin rounded-full border-b-2 border-orange-500" />
          <div className="absolute inset-0 h-20 w-20 rounded-full border-t-2 border-orange-500/10" />
          <Brain className="absolute inset-0 m-auto h-8 w-8 animate-pulse text-orange-500/50" />
        </div>
        <div className="space-y-3 text-center">
          <h3 className="animate-pulse text-xl font-black uppercase tracking-[0.4em] text-orange-500">
            Initializing INexus
          </h3>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Bridging cognitive modules with cloud matrix...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] pb-20 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Refined Maverick-style Header - Floating Sticky */}
        <div className="sticky top-4 z-50 mb-10 flex flex-col items-center justify-between gap-6 rounded-[40px] border border-orange-500/20 bg-slate-900/60 p-4 px-8 shadow-[0_20px_50px_rgba(0,0,0,0.4),0_0_20px_rgba(249,115,22,0.05)] backdrop-blur-2xl transition-all duration-300 lg:top-6 lg:flex-row">
          {/* Logo Section */}
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 opacity-20 blur-md transition duration-500 group-hover:opacity-40"></div>
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-slate-950">
                {standalone ? (
                  <ShieldCheck className="h-8 w-8 text-indigo-500" />
                ) : (
                  <Brain className="h-8 w-8 text-orange-500" />
                )}
              </div>
            </div>
            <div>
              <h1 className="flex items-center gap-1.5 text-3xl font-black uppercase tracking-tighter">
                {standalone ? (
                  <span className="text-indigo-500">iCredentials</span>
                ) : (
                  <>
                    <span className="text-orange-500">INexus</span>
                    <span className="text-slate-300">Agent</span>
                  </>
                )}
              </h1>
              <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                {standalone ? 'Universal Credentials Vault' : 'Autonomous Agent Ecosystem'}
              </p>
            </div>
          </div>

          {!standalone && (
            <>
              {/* Centered Segmented Navigation */}
              <div className="flex max-w-2xl flex-1 justify-center px-4">
                <div className="flex w-full rounded-full border border-white/5 bg-black/40 p-1 shadow-inner backdrop-blur-md">
                  {[
                    { id: 'integrations', icon: Globe, label: 'WEBSITES INTEGRATION' },
                    { id: 'tools', icon: Wrench, label: 'TOOLS & SKILLS' },
                    { id: 'scheduled', icon: Clock, label: 'SCHEDULED TASKS' },
                    { id: 'create-skills', icon: Sparkles, label: 'CREATE SKILLS' },
                  ].map((nav) => {
                    const isActive = activeTab === nav.id;
                    return (
                      <button
                        key={nav.id}
                        onClick={() => setActiveTab(nav.id)}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[10px] font-black tracking-widest transition-all duration-500 ${
                          isActive
                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20'
                            : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                        }`}
                      >
                        <nav.icon className={`h-3 w-3 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                        <span className="hidden xl:inline">{nav.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Window Controls & User Section */}
          <div className="flex items-center gap-4">
            <div className="mr-4 hidden items-center gap-2 sm:flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={onMinimize}
                className="h-7 w-7 rounded-full border border-white/20 p-0 text-slate-400 transition-colors hover:text-white"
              >
                <div className="h-[1.5px] w-2.5 bg-current" /> {/* Minimize icon */}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleMaximize}
                className="h-7 w-7 rounded-full border border-white/20 p-0 text-slate-400 transition-colors hover:text-white"
                title={isMaximized ? 'Exit Full Screen' : 'Full Screen'}
              >
                {isMaximized ? (
                  <Minimize2 className="h-3 w-3" />
                ) : (
                  <ArrowUpDown className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-7 w-7 rounded-full border border-white/20 p-0 text-slate-400 transition-all hover:border-red-500/50 hover:text-red-500"
              >
                <X className="h-3 w-3" /> {/* Close icon */}
              </Button>
            </div>
          </div>
        </div>

        <TabsValue activeTab={effectiveTab}>
          <TabsContent value="integrations" className="mt-0 outline-none">
            {/* Integration Section Styling */}
            <div className="mb-10 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <h2 className="whitespace-nowrap text-3xl font-black uppercase tracking-tighter text-white">
                Accounts & Integrations
              </h2>
              <div className="mx-4 hidden h-px flex-1 bg-white/5 lg:block" />
              <p className="max-w-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 lg:text-right">
                Link your secure credentials to allow the agent to navigate and interact with
                authenticated portals.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Object.keys(PLATFORM_CONFIG)
                .filter((k) => k !== 'custom')
                .map((p) => (
                  <IntegrationCard
                    key={p}
                    platform={p}
                    integration={getIntegrationForPlatform(p)}
                    onEdit={() => {
                      setEditIntegration(getIntegrationForPlatform(p) || null);
                      setConnectPlatform(p);
                    }}
                    onDelete={() => deleteMut.mutate(getIntegrationForPlatform(p)?.id!)}
                  />
                ))}
            </div>

            <div className="mb-6 mt-12 flex items-center gap-4">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-400">
                Custom Portals
              </h3>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {integrations
                .filter((i) => i.platform === 'custom')
                .map((i) => (
                  <div
                    key={i.id}
                    className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
                  >
                    <div className="absolute right-0 top-0 p-4 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-red-400"
                        onClick={() => deleteMut.mutate(i.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mb-4 flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                        <Globe className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate font-bold text-white">{i.label}</h4>
                        <p className="mt-0.5 text-xs font-bold text-indigo-400">Custom Site</p>
                      </div>
                    </div>
                    <div className="mb-4 truncate rounded-lg border border-slate-800/50 bg-black/20 p-3 font-mono text-[11px] text-slate-500">
                      {i.siteUrl}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full border-slate-800 bg-slate-950/50 text-slate-300 hover:bg-slate-800"
                      onClick={() => {
                        setEditIntegration(i);
                        setConnectPlatform('custom');
                      }}
                    >
                      <Wrench className="mr-2 h-3.5 w-3.5" />
                      Manage Credentials
                    </Button>
                  </div>
                ))}
              <div
                onClick={() => {
                  setEditIntegration(null);
                  setConnectPlatform('custom');
                }}
                className="group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-800 p-8 transition-all hover:border-indigo-500/50 hover:bg-indigo-500/5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 transition-colors group-hover:bg-indigo-600">
                  <Plus className="h-6 w-6 text-slate-400 group-hover:text-white" />
                </div>
                <span className="text-sm font-bold uppercase tracking-widest text-slate-400 group-hover:text-white">
                  Connect New Portal
                </span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tools" className="mt-0 outline-none">
            <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 shadow-2xl">
              <div className="border-b border-slate-800 bg-gradient-to-r from-slate-900 to-indigo-950/30 p-8">
                <div className="mb-8 flex flex-col items-center justify-between gap-6 lg:flex-row">
                  <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:items-center">
                    <h2 className="whitespace-nowrap text-3xl font-black uppercase tracking-tighter text-white">
                      Neural Skill Matrix
                    </h2>
                    <div className="hidden h-px flex-1 bg-white/10 lg:block" />
                    <p className="max-w-xl text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Configure precise operational boundaries. Modules are injected directly into
                      the cognitive core.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div
                      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest ${totalToolsEnabled === totalTools ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]' : 'bg-slate-800 text-slate-300'}`}
                    >
                      <Zap className="h-4 w-4" />
                      {totalToolsEnabled}/{totalTools} Active
                    </div>
                    <Button
                      onClick={handleEnableAll}
                      className="rounded-xl border-0 bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                    >
                      Enable All
                    </Button>
                    <Button
                      onClick={handleDisableAll}
                      className="rounded-xl border-0 bg-slate-800 font-bold text-slate-300 hover:bg-slate-700"
                    >
                      Disable All
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-12 p-8">
                {TOOL_CATEGORIES.map((category) => (
                  <div key={category.id}>
                    <div className="mb-6 flex items-center gap-4">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 ${category.color}`}
                      >
                        <category.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white">{category.label}</h3>
                        <p className="text-xs font-medium text-slate-500">{category.description}</p>
                      </div>
                      <div className="h-px flex-[4] bg-slate-800/50" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {category.tools.map((tool) => (
                        <ToolRow
                          key={tool.id}
                          tool={tool}
                          enabled={isToolEnabled(tool.id)}
                          onView={handleViewTool}
                          onToggle={(id: any, enabled: any) =>
                            toolToggleMut.mutate({ toolId: id, enabled })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scheduled" className="mt-0 outline-none">
            <div className="mx-auto max-w-4xl">
              <ScheduledTasksPanel />
            </div>
          </TabsContent>

          <TabsContent
            value="create-skills"
            className="mt-0 h-full rounded-3xl border border-slate-800 bg-slate-950/50 p-1 outline-none"
          >
            <CreateSkillPanel />
          </TabsContent>
        </TabsValue>
      </div>

      {connectPlatform && (
        <ConnectDialog
          platform={connectPlatform}
          existing={editIntegration || undefined}
          open={true}
          onClose={() => {
            setConnectPlatform(null);
            setEditIntegration(null);
          }}
        />
      )}
      {isViewModalOpen && viewTargetTool && (
        <ViewSkillModal
          tool={viewTargetTool}
          open={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
        />
      )}
    </div>
  );
}
