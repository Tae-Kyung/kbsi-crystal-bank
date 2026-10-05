'use client';

import { useChat } from 'ai/react';
import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, User, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, stop } = useChat({
    api: '/api/chat',
  });

  // auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        handleSubmit(e as any);
      }
    }
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Open AI Assistant"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      <div
        className={cn(
          'fixed bottom-0 right-0 z-50 flex flex-col border-l bg-background shadow-2xl transition-all duration-300',
          isOpen
            ? 'h-full w-full sm:w-[420px] translate-x-0'
            : 'translate-x-full w-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-sm">AI Assistant</h2>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
              Online
            </span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-4">
              <Bot className="h-12 w-12 opacity-30" />
              <div>
                <p className="font-medium text-foreground">KBSI AI Assistant</p>
                <p className="text-sm mt-1">
                  단백질 검색, 결정화 조건 추천,<br />성공 확률 예측 등을 도와드립니다.
                </p>
              </div>
              <div className="grid gap-2 w-full max-w-[280px]">
                {[
                  'DB에 등록된 단백질 수는?',
                  'pH 7.0, 18도에서 결정화 추천해줘',
                  'KRAS 단백질 정보 검색',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      handleInputChange({ target: { value: suggestion } } as any);
                      setTimeout(() => {
                        const form = inputRef.current?.closest('form');
                        if (form) form.requestSubmit();
                      }, 50);
                    }}
                    className="rounded-lg border px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-2',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted rounded-bl-md'
                )}
              >
                {message.parts?.map((part, i) => {
                  if (part.type === 'text') {
                    return (
                      <div key={i} className="whitespace-pre-wrap break-words">
                        <MessageContent content={part.text} />
                      </div>
                    );
                  }
                  if (part.type === 'tool-invocation') {
                    return (
                      <div key={i} className="my-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className={cn('h-3 w-3', part.toolInvocation.state !== 'result' && 'animate-spin')} />
                        <span className="font-mono">
                          {formatToolName(part.toolInvocation.toolName)}
                        </span>
                        {part.toolInvocation.state === 'result' && (
                          <span className="text-green-600 dark:text-green-400">done</span>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
                {/* Fallback for messages without parts */}
                {!message.parts?.length && message.content && (
                  <div className="whitespace-pre-wrap break-words">
                    <MessageContent content={message.content} />
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Scroll-to-bottom button */}
        {messages.length > 3 && (
          <div className="relative">
            <button
              onClick={() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
              }}
              className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full border bg-background p-1 shadow-sm hover:bg-muted"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Input area */}
        <form onSubmit={handleSubmit} className="border-t p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="질문을 입력하세요..."
              rows={1}
              className="flex-1 resize-none rounded-xl border bg-muted/50 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            {isLoading ? (
              <Button type="button" size="icon" variant="ghost" onClick={stop} className="shrink-0 h-9 w-9">
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                className="shrink-0 h-9 w-9 rounded-xl"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

function parseInlineFormatting(text: string): React.ReactNode[] {
  // Split by bold (**...**) and inline code (`...`) patterns safely
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      tokens.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // Inline code
      tokens.push(
        <code key={match.index} className="rounded bg-foreground/10 px-1 py-0.5 text-xs font-mono">
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        // Bullet lists
        if (/^[-*]\s/.test(line)) {
          const bulletText = line.replace(/^[-*]\s/, '');
          return (
            <div key={i} className="flex gap-1.5 ml-1">
              <span className="text-muted-foreground mt-0.5">{'\u2022'}</span>
              <span>{parseInlineFormatting(bulletText)}</span>
            </div>
          );
        }
        return (
          <span key={i}>
            <span>{parseInlineFormatting(line)}</span>
            {i < lines.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}
