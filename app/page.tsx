'use client';

import { useState, KeyboardEvent, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  IconButton,
  Stack,
  Avatar,
  Chip,
  Link,
  Collapse,
  Button,
  CircularProgress,
  InputAdornment,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Send as SendIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  School as SchoolIcon,
  Person as PersonIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useColorMode } from './theme-provider';

/* ---------------- Types ---------------- */

type ApiRole = 'user' | 'assistant';
type ApiMessage = { role: ApiRole; content: string };

type Match = {
  score: number;
  professor: string;
  url: string;
  chunkBlock: string;
  snippet: string;
};

type Message = {
  id: string;
  role: ApiRole;
  content: string;
  matches?: Match[];
};

/* ---------------- UI helpers ---------------- */

const scrollbarStyles = {
  '&::-webkit-scrollbar': { width: '8px' },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(145, 158, 171, 0.48)',
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
};

const MAX_MESSAGES_TO_SEND = 12;

/* ---------------- Page ---------------- */

export default function ChatPage() {
  const theme = useTheme();
  const { mode, toggleColorMode } = useColorMode();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm your TUM professor assistant.\n\nTry asking:\n• Who works on quantum computing?\n• Which professor focuses on AI for medical imaging?\n• Who is working on robotics?",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Build strongly-typed history for API (exclude welcome)
  const apiHistory = useMemo<ApiMessage[]>(() => {
    return messages
      .filter((m) => m.id !== 'welcome')
      .map<ApiMessage>((m) => ({
        role: m.role,
        content: m.content,
      }));
  }, [messages]);

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setError(null);
    setLoading(true);

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const payloadMessages: ApiMessage[] = [
        ...apiHistory,
        { role: 'user', content: question },
      ].slice(-MAX_MESSAGES_TO_SEND);

      const res = await fetch('/api/prof-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed with ${res.status}`);
      }

      const data: { answer?: string; matches?: Match[] } = await res.json();

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'No answer returned.',
        matches: data.matches || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <SchoolIcon />
            </Avatar>
            <Typography variant="h6" fontWeight={700}>
              TUM Professor Assistant
            </Typography>
          </Stack>
          <IconButton onClick={toggleColorMode}>
            {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Box>

        {/* Messages */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3, ...scrollbarStyles }}>
          <Stack spacing={3}>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
              />
            ))}
            {loading && <Typography color="text.secondary">Thinking…</Typography>}
          </Stack>
        </Box>

        {/* Error */}
        {error && (
          <Box sx={{ px: 3 }}>
            <Typography color="error.main">{error}</Typography>
          </Box>
        )}

        {/* Input */}
        <Box sx={{ p: 3 }}>
          <TextField
            fullWidth
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about a TUM professor…"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={sendMessage}
                    disabled={!input.trim() || loading}
                    sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}
                  >
                    <SendIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Card>
    </Box>
  );
}

/* ---------------- Message bubble ---------------- */

type MessageBubbleProps = {
  message: Message;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
};

function MessageBubble({ message, expandedId, setExpandedId }: MessageBubbleProps) {
  const theme = useTheme();
  const isUser = message.role === 'user';
  const matches = message.matches || [];

  return (
    <Stack direction="row" spacing={2} justifyContent={isUser ? 'flex-end' : 'flex-start'}>
      {!isUser && (
        <Avatar sx={{ bgcolor: 'primary.main' }}>
          <SchoolIcon />
        </Avatar>
      )}

      <Box sx={{ maxWidth: '75%' }}>
        <Box
          sx={{
            bgcolor: isUser ? 'primary.main' : alpha(theme.palette.grey[500], 0.08),
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography variant="body2" whiteSpace="pre-wrap">
            {message.content}
          </Typography>
        </Box>

        {!isUser && matches.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Button
              size="small"
              onClick={() => setExpandedId(expandedId === message.id ? null : message.id)}
              endIcon={expandedId === message.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            >
              {matches.length} sources
            </Button>

            <Collapse in={expandedId === message.id}>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {matches.map((m, i) => (
                  <Card key={i} variant="outlined">
                    <CardContent>
                      <Link href={m.url} target="_blank" fontWeight={700}>
                        {m.professor} <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </Link>
                      {m.chunkBlock && (
                        <Typography variant="caption" display="block">
                          {m.chunkBlock}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {m.snippet}
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </Collapse>
          </Box>
        )}
      </Box>

      {isUser && (
        <Avatar sx={{ bgcolor: 'secondary.main' }}>
          <PersonIcon />
        </Avatar>
      )}
    </Stack>
  );
}
