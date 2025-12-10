'use client';

import { useState, KeyboardEvent } from 'react';
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
  Divider,
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

// Types
type Match = {
  score: number;
  name: string;
  url: string;
  snippet: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  matches?: Match[];
};

// Minimals-style scrollbar
const scrollbarStyles = {
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(145, 158, 171, 0.48)',
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'transparent',
  },
};

export default function ChatPage() {
  const theme = useTheme();
  const { mode, toggleColorMode } = useColorMode();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm your TUM professor assistant. I can help you discover researchers based on their expertise.\n\nTry asking:\n• Who works on quantum computing and cryptography?\n• Which professor focuses on AI for medical imaging?\n• Who is working on robotics for surgery?",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const res = await fetch('/api/prof-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed with ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'No answer returned.',
        matches: data.matches || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      setError(errorMessage);
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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: { xs: 2, md: 3 },
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 900,
          height: { xs: '90vh', md: '85vh' },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: (theme) =>
            `0 0 2px 0 ${alpha(theme.palette.grey[500], 0.2)}, 0 12px 24px -4px ${alpha(theme.palette.grey[500], 0.12)}`,
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 3,
            py: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar
              sx={{
                width: 48,
                height: 48,
                bgcolor: 'primary.main',
                boxShadow: (theme) => `0 8px 16px 0 ${alpha(theme.palette.primary.main, 0.24)}`,
              }}
            >
              <SchoolIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                TUM Professor Assistant
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ask questions about TUM professors and their research
              </Typography>
            </Box>
          </Stack>
          <IconButton
            onClick={toggleColorMode}
            sx={{
              bgcolor: alpha(theme.palette.grey[500], 0.08),
              '&:hover': {
                bgcolor: alpha(theme.palette.grey[500], 0.16),
              },
            }}
          >
            {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Box>

        {/* Messages Area */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 3,
            ...scrollbarStyles,
          }}
        >
          <Stack spacing={3}>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
              />
            ))}
            {loading && (
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Avatar
                  sx={{
                    width: 36,
                    height: 36,
                    bgcolor: 'primary.main',
                    fontSize: '0.875rem',
                  }}
                >
                  <SchoolIcon sx={{ fontSize: 20 }} />
                </Avatar>
                <Box
                  sx={{
                    bgcolor: alpha(theme.palette.grey[500], 0.08),
                    borderRadius: 2,
                    px: 2.5,
                    py: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <CircularProgress size={16} thickness={5} />
                  <Typography variant="body2" color="text.secondary">
                    Thinking...
                  </Typography>
                </Box>
              </Stack>
            )}
          </Stack>
        </Box>

        {/* Error Message */}
        {error && (
          <Box sx={{ px: 3, pb: 1 }}>
            <Typography
              variant="caption"
              sx={{
                color: 'error.main',
                display: 'block',
                bgcolor: alpha(theme.palette.error.main, 0.08),
                p: 1.5,
                borderRadius: 1,
              }}
            >
              {error}
            </Typography>
          </Box>
        )}

        {/* Input Area */}
        <Box
          sx={{
            p: 3,
            pt: 2,
            borderTop: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <TextField
            fullWidth
            placeholder='Ask something like: "Who works on quantum computing?"'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={sendMessage}
                    disabled={!input.trim() || loading}
                    sx={{
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                      },
                      '&.Mui-disabled': {
                        bgcolor: alpha(theme.palette.grey[500], 0.24),
                        color: alpha(theme.palette.grey[500], 0.8),
                      },
                    }}
                  >
                    <SendIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </InputAdornment>
              ),
              sx: {
                pr: 1,
              },
            }}
          />
        </Box>
      </Card>
    </Box>
  );
}

// Message Bubble Component
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
    <Stack
      direction="row"
      spacing={2}
      alignItems="flex-start"
      justifyContent={isUser ? 'flex-end' : 'flex-start'}
    >
      {!isUser && (
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: 'primary.main',
            fontSize: '0.875rem',
          }}
        >
          <SchoolIcon sx={{ fontSize: 20 }} />
        </Avatar>
      )}

      <Box sx={{ maxWidth: '75%' }}>
        <Box
          sx={{
            bgcolor: isUser
              ? 'primary.main'
              : alpha(theme.palette.grey[500], 0.08),
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: 2,
            px: 2.5,
            py: 1.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mb: 0.5,
              opacity: 0.72,
              fontWeight: 600,
            }}
          >
            {isUser ? 'You' : 'Assistant'}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {message.content}
          </Typography>
        </Box>

        {/* Sources */}
        {!isUser && matches.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Button
              size="small"
              onClick={() =>
                setExpandedId(expandedId === message.id ? null : message.id)
              }
              endIcon={
                expandedId === message.id ? (
                  <ExpandLessIcon sx={{ fontSize: 18 }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 18 }} />
                )
              }
              sx={{
                color: 'text.secondary',
                fontWeight: 600,
                fontSize: '0.75rem',
                '&:hover': {
                  bgcolor: alpha(theme.palette.grey[500], 0.08),
                },
              }}
            >
              {matches.length} source{matches.length > 1 ? 's' : ''}
            </Button>

            <Collapse in={expandedId === message.id}>
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                {matches.map((m, idx) => (
                  <Card
                    key={m.url + idx}
                    variant="outlined"
                    sx={{
                      borderColor: alpha(theme.palette.grey[500], 0.16),
                      boxShadow: 'none',
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="flex-start"
                        spacing={1}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            sx={{
                              width: 32,
                              height: 32,
                              bgcolor: alpha(theme.palette.primary.main, 0.08),
                              color: 'primary.main',
                            }}
                          >
                            <PersonIcon sx={{ fontSize: 18 }} />
                          </Avatar>
                          <Link
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              color: 'primary.main',
                              fontWeight: 600,
                              fontSize: '0.875rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              '&:hover': {
                                color: 'primary.dark',
                              },
                            }}
                          >
                            {m.name}
                            <OpenInNewIcon sx={{ fontSize: 14 }} />
                          </Link>
                        </Stack>
                        <Chip
                          label={`${(m.score * 100).toFixed(0)}%`}
                          size="small"
                          sx={{
                            height: 24,
                            bgcolor: alpha(theme.palette.success.main, 0.08),
                            color: 'success.dark',
                            fontWeight: 700,
                            fontSize: '0.7rem',
                          }}
                        />
                      </Stack>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: 'block',
                          mt: 1,
                          lineHeight: 1.5,
                        }}
                      >
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
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: 'secondary.main',
            fontSize: '0.875rem',
          }}
        >
          <PersonIcon sx={{ fontSize: 20 }} />
        </Avatar>
      )}
    </Stack>
  );
}