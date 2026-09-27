import React, { useState, useEffect, useRef } from 'react';
import { FiMessageSquare, FiX, FiSend, FiTrash2, FiActivity } from 'react-icons/fi';
import { sendAIChatMessage, wakeUpBackend } from '../../aiService';
import MarkdownRenderer from './MarkdownRenderer';

const SUGGESTION_PROMPTS = [
  "How is hive swarming detected and prevented?",
  "Honey purity standards (FSSAI & Codex)",
  "Telemetry thresholds (Acoustic tone & temperature)"
];

export default function AIChatbotModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Namaste. I am the **HoneyChain Assistant**.\n\nYou can ask about real-time smart hive telemetry, swarming mitigation, honey purity standards (FSSAI/Codex), or blockchain batch traceability in Hindi, English, or your local language.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      inputRef.current?.focus();
      wakeUpBackend(); // Silently warm up Render backend on chatbot open
    }
  }, [isOpen, messages]);

  const handleSend = async (userText) => {
    const textToSend = typeof userText === 'string' ? userText : input;
    if (!textToSend || !textToSend.trim() || isLoading) return;

    const newMessages = [...messages, { role: 'user', content: textToSend.trim() }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendAIChatMessage({
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        userRole: 'HoneyChain User',
        pageContext: window.location.pathname
      });

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response.content }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Unable to reach the assistant service at this moment. Please try again in a few seconds.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Conversation history cleared. How can I assist you with your apiary or honey batch today?'
      }
    ]);
  };

  return (
    <div className="ai-assistant-float-btn">
      {/* Sleek Minimalist Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open Assistant"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 15px',
            background: '#0F172A',
            color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '24px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.18)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.82rem',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#1E293B')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#0F172A')}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#10B981',
              display: 'inline-block'
            }}
          />
          <FiMessageSquare size={14} />
          <span>Assistant</span>
        </button>
      )}

      {/* Clean Minimalist Modal */}
      {isOpen && (
        <div
          className="ai-assistant-window"
          style={{
            width: '430px',
            maxWidth: 'calc(100vw - 24px)',
            height: '560px',
            maxHeight: 'calc(100vh - 80px)',
            background: '#FFFFFF',
            borderRadius: '10px',
            boxShadow: '0 16px 36px rgba(15, 23, 42, 0.16)',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              background: '#0F172A',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #1E293B'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                HoneyChain Assistant
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#10B981',
                    display: 'inline-block'
                  }}
                />
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                KVIC Apiculture & Quality Intelligence
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={handleClear}
                title="Clear Chat"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  width: '26px',
                  height: '26px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
              >
                <FiTrash2 size={13} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  width: '26px',
                  height: '26px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
              >
                <FiX size={15} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div
            style={{
              flex: 1,
              padding: '14px',
              overflowY: 'auto',
              background: '#FAFAFA',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div
                  style={{
                    maxWidth: m.role === 'user' ? '82%' : '94%',
                    padding: '9px 13px',
                    borderRadius: m.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                    background: m.role === 'user' ? '#0F172A' : '#FFFFFF',
                    color: m.role === 'user' ? '#FFFFFF' : '#1E293B',
                    fontSize: '0.82rem',
                    lineHeight: '1.5',
                    border: m.role === 'user' ? 'none' : '1px solid #E2E8F0',
                    boxShadow: m.role === 'user' ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                    overflowX: 'auto'
                  }}
                >
                  {m.role === 'assistant' ? (
                    <MarkdownRenderer content={m.content} />
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px 8px 8px 2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    color: '#64748B'
                  }}
                >
                  <FiActivity className="spin" size={13} color="#0F172A" />
                  <span>Processing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts (only when starting) */}
          {messages.length <= 2 && (
            <div
              style={{
                padding: '8px 12px',
                background: '#FFFFFF',
                borderTop: '1px solid #F1F5F9',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
                Suggested Topics
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {SUGGESTION_PROMPTS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(s)}
                    style={{
                      textAlign: 'left',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      color: '#334155',
                      borderRadius: '5px',
                      padding: '5px 8px',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Bar */}
          <div
            style={{
              padding: '10px 12px',
              background: '#FFFFFF',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about hives, telemetry, or purity..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '8px 10px',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '0.82rem',
                outline: 'none',
                transition: 'border 0.15s'
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#0F172A')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#CBD5E1')}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              style={{
                width: '34px',
                height: '34px',
                background: input.trim() && !isLoading ? '#0F172A' : '#F1F5F9',
                color: input.trim() && !isLoading ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                borderRadius: '6px',
                cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
            >
              <FiSend size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
