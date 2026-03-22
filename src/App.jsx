import React, { useState, useRef, useEffect, useCallback } from 'react'

// ── CONFIG ────────────────────────────────────────────────────────────────────
// ⚠️  CHANGE THIS to your current ngrok URL when it rotates
const WEBHOOK_URL = 'https://first-sponge-noble.ngrok-free.app/webhook-test/webhook-path-123'

// How long to wait for n8n (ms). n8n AI agents can take 30-60 s.
const FETCH_TIMEOUT_MS = 90_000

// ── HELPERS ──────────────────────────────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

function parseBotReply(data) {
  if (typeof data === 'string') return data
  // n8n "Respond to Webhook" node typically returns an array or object
  if (Array.isArray(data)) {
    const first = data[0]
    if (first?.output) return first.output
    if (first?.message?.content) return first.message.content
    if (first?.text) return first.text
    if (first?.reply) return first.reply
    return JSON.stringify(data, null, 2)
  }
  return data.output || data.reply || data.message || data.text || data.response
       || JSON.stringify(data, null, 2)
}

// ── ICONS ────────────────────────────────────────────────────────────────────
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
  </svg>
)
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="3" width="6" height="10" rx="3"/>
    <path strokeLinecap="round" d="M5 11a7 7 0 0014 0"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="9" y1="23" x2="15" y2="23"/>
  </svg>
)
const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
)
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="11" width="18" height="10" rx="2"/>
    <circle cx="9" cy="16" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="16" r="1.5" fill="currentColor"/>
    <path d="M12 3v3M9 6h6" strokeLinecap="round"/>
    <path d="M8 11V9a4 4 0 018 0v2" strokeLinecap="round"/>
  </svg>
)

// ── COMPONENTS ────────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <span className="typing-dots inline-flex gap-1 items-center py-1">
      {[0,1,2].map(i => (
        <span key={i} className="w-2 h-2 rounded-full bg-violet-400" style={{
          animation: `bounce 1.2s ease-in-out ${i*0.2}s infinite`
        }}/>
      ))}
    </span>
  )
}

function FileChip({ file, onRemove }) {
  const ext = file.name.split('.').pop().toUpperCase()
  const isAudio = file.type.startsWith('audio')
  return (
    <span className="inline-flex items-center gap-1.5 bg-violet-900/40 border border-violet-700/50 text-violet-200 text-xs rounded-full px-3 py-1">
      <span className="font-bold text-violet-400">{isAudio ? '🎵' : ext}</span>
      <span className="max-w-[120px] truncate">{file.name}</span>
      <button onClick={onRemove} className="hover:text-white transition-colors">
        <CloseIcon/>
      </button>
    </span>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'
  const isImage = msg.imageUrl

  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-xs text-zinc-500 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
          {msg.text}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-900 border border-violet-700 flex items-center justify-center text-violet-300">
          <BotIcon/>
        </div>
      )}
      <div className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
        isUser
          ? 'bg-violet-600 text-white rounded-br-sm'
          : 'bg-zinc-800 border border-zinc-700/60 text-zinc-100 rounded-bl-sm'
      }`}>
        {isImage
          ? <img src={msg.imageUrl} alt="bot image" className="max-w-full rounded-lg"/>
          : <span style={{whiteSpace:'pre-wrap'}}>{msg.text}</span>
        }
      </div>
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hello! 👋 I\'m your AI assistant powered by n8n. You can type a message, upload files (PDF, audio), or use the mic to speak.' }
  ])
  const [input, setInput] = useState('')
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recorder, setRecorder] = useState(null)
  const [webhookStatus, setWebhookStatus] = useState('unknown') // 'ok' | 'error' | 'unknown'

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

  // ── CORE SEND ──────────────────────────────────────────────────────────────
  const postToWebhook = useCallback(async (formData) => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout(WEBHOOK_URL, {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type — browser sets it with the correct boundary for FormData
        headers: {
          // ngrok requires this to skip the browser warning page
          'ngrok-skip-browser-warning': 'true',
        }
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} — ${res.statusText}`)
      }

      setWebhookStatus('ok')
      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('image/')) {
        const blob = await res.blob()
        const imageUrl = URL.createObjectURL(blob)
        setMessages(prev => [...prev, { role: 'bot', imageUrl }])
      } else if (contentType.includes('application/json')) {
        const data = await res.json()
        const botReply = parseBotReply(data)
        setMessages(prev => [...prev, { role: 'bot', text: botReply }])
      } else {
        const text = await res.text()
        setMessages(prev => [...prev, { role: 'bot', text: text || '(no response)' }])
      }
    } catch (err) {
      setWebhookStatus('error')
      if (err.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'bot', text: '⏱ Request timed out. The n8n workflow may still be running. Try again in a moment.' }])
      } else {
        setMessages(prev => [...prev, { role: 'bot', text: `⚠️ Error: ${err.message}\n\nMake sure:\n• n8n workflow is ACTIVE (not in test mode)\n• Webhook URL is production URL (not /webhook-test/)\n• ngrok tunnel is running` }])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const sendMessage = useCallback(async () => {
    if (loading || (!input.trim() && files.length === 0)) return

    const userText = input.trim() || '(sent file)'
    setMessages(prev => [...prev, { role: 'user', text: userText }])
    setInput('')
    setFiles([])

    const formData = new FormData()
    formData.append('text', input.trim())
    files.forEach(f => formData.append('files', f, f.name))

    await postToWebhook(formData)
  }, [input, files, loading, postToWebhook])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── VOICE RECORDING ────────────────────────────────────────────────────────
  const toggleRecording = async () => {
    if (recording) {
      recorder?.stop()
      setRecording(false)
      setRecorder(null)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mr = new MediaRecorder(stream)
        chunksRef.current = []

        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        mr.onstop = async () => {
          stream.getTracks().forEach(t => t.stop())
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const audioFile = new File([blob], 'voice.webm', { type: 'audio/webm' })
          setMessages(prev => [...prev, { role: 'user', text: '🎙 Voice message' }])
          const formData = new FormData()
          formData.append('files', audioFile, audioFile.name)
          formData.append('text', '(voice message)')
          await postToWebhook(formData)
        }

        mr.start()
        setRecorder(mr)
        setRecording(true)
        setMessages(prev => [...prev, { role: 'system', text: '🎙 Recording… click again to stop' }])
      } catch (err) {
        alert('Microphone access denied: ' + err.message)
      }
    }
  }

  const clearChat = () => {
    setMessages([{ role: 'bot', text: 'Chat cleared. How can I help you?' }])
    setWebhookStatus('unknown')
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Sora', sans-serif; background: #0c0c10; }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: .4 }
          40% { transform: translateY(-6px); opacity: 1 }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-appear { animation: fadeUp .25s ease forwards; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
      `}</style>

      <div style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(160deg, #0c0c10 0%, #13111a 100%)',
        color: '#e4e4f0',
        fontFamily: "'Sora', sans-serif",
      }}>

        {/* ── HEADER ── */}
        <header style={{
          padding: '14px 20px',
          borderBottom: '1px solid #1e1b2e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(12,12,16,0.8)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>🤖</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>n8n Assistant</div>
              <div style={{ fontSize: 11, color: webhookStatus === 'ok' ? '#4ade80' : webhookStatus === 'error' ? '#f87171' : '#71717a' }}>
                {webhookStatus === 'ok' ? '● Connected' : webhookStatus === 'error' ? '● Error' : '● Standby'}
              </div>
            </div>
          </div>
          <button onClick={clearChat} style={{
            background: 'transparent', border: '1px solid #27272a', borderRadius: 8,
            color: '#71717a', padding: '5px 12px', fontSize: 12, cursor: 'pointer',
            transition: 'all .15s',
          }}
          onMouseEnter={e => e.target.style.color = '#e4e4f0'}
          onMouseLeave={e => e.target.style.color = '#71717a'}
          >Clear</button>
        </header>

        {/* ── MESSAGES ── */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          maxWidth: 800,
          width: '100%',
          margin: '0 auto',
          alignSelf: 'center',
          width: '100%',
        }}>
          {messages.map((m, i) => (
            <div key={i} className="msg-appear">
              <Message msg={m}/>
            </div>
          ))}
          {loading && (
            <div className="msg-appear" style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#3b1d8a', border: '1px solid #5b21b6',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa',
                flexShrink: 0,
              }}><BotIcon/></div>
              <div style={{
                background: '#1e1b2e', border: '1px solid #2e2b3e',
                borderRadius: '16px 16px 16px 4px',
                padding: '12px 16px',
              }}>
                <TypingDots/>
              </div>
            </div>
          )}
          <div ref={messagesEndRef}/>
        </main>

        {/* ── FILE CHIPS ── */}
        {files.length > 0 && (
          <div style={{
            padding: '8px 20px',
            display: 'flex', gap: 8, flexWrap: 'wrap',
            borderTop: '1px solid #1e1b2e',
            background: '#0e0c14',
            maxWidth: 800, width: '100%', alignSelf: 'center',
          }}>
            {files.map((f, i) => (
              <FileChip key={i} file={f} onRemove={() => setFiles(prev => prev.filter((_, j) => j !== i))}/>
            ))}
          </div>
        )}

        {/* ── INPUT AREA ── */}
        <footer style={{
          padding: '12px 16px 20px',
          borderTop: '1px solid #1a1728',
          background: 'rgba(10,9,14,0.9)',
          backdropFilter: 'blur(16px)',
        }}>
          <div style={{
            maxWidth: 800, margin: '0 auto',
            display: 'flex', alignItems: 'flex-end', gap: 10,
            background: '#13111e',
            border: '1px solid #2a2640',
            borderRadius: 20,
            padding: '8px 12px',
            boxShadow: '0 0 0 1px #1e1b2e inset',
            transition: 'border-color .2s',
          }}
          onFocusCapture={e => e.currentTarget.style.borderColor = '#6d28d9'}
          onBlurCapture={e => e.currentTarget.style.borderColor = '#2a2640'}
          >
            {/* File upload */}
            <label htmlFor="fileUp" style={{
              cursor: 'pointer', color: '#52525b', padding: '6px',
              borderRadius: 10, transition: 'all .15s',
              display: 'flex', alignItems: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color='#a78bfa'; e.currentTarget.style.background='#1e1b2e' }}
            onMouseLeave={e => { e.currentTarget.style.color='#52525b'; e.currentTarget.style.background='transparent' }}
            title="Attach file">
              <PlusIcon/>
              <input id="fileUp" type="file" multiple accept=".pdf,.doc,.docx,audio/*,image/*"
                style={{ display: 'none' }}
                onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files)])}
              />
            </label>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Type a message… (Shift+Enter for new line)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: '#e4e4f0',
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: "'Sora', sans-serif",
                minHeight: 40,
                maxHeight: 160,
                overflowY: 'auto',
                padding: '6px 4px',
              }}
            />

            {/* Mic */}
            <button onClick={toggleRecording} style={{
              background: recording ? 'rgba(239,68,68,0.15)' : 'transparent',
              border: recording ? '1px solid #ef4444' : 'none',
              color: recording ? '#ef4444' : '#52525b',
              borderRadius: 10,
              padding: '6px',
              cursor: 'pointer',
              transition: 'all .15s',
              display: 'flex',
              flexShrink: 0,
              animation: recording ? 'none' : undefined,
            }}
            onMouseEnter={e => { if (!recording) { e.currentTarget.style.color='#a78bfa'; e.currentTarget.style.background='#1e1b2e' } }}
            onMouseLeave={e => { if (!recording) { e.currentTarget.style.color='#52525b'; e.currentTarget.style.background='transparent' } }}
            title={recording ? 'Stop recording' : 'Voice input'}
            >
              {recording ? <StopIcon/> : <MicIcon/>}
            </button>

            {/* Send */}
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && files.length === 0)}
              style={{
                background: (loading || (!input.trim() && files.length === 0))
                  ? '#1e1b2e' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                border: 'none',
                color: (loading || (!input.trim() && files.length === 0)) ? '#52525b' : 'white',
                borderRadius: 12,
                padding: '8px 10px',
                cursor: (loading || (!input.trim() && files.length === 0)) ? 'default' : 'pointer',
                transition: 'all .2s',
                display: 'flex', alignItems: 'center',
                flexShrink: 0,
                boxShadow: (!loading && (input.trim() || files.length > 0))
                  ? '0 0 12px rgba(124,58,237,.4)' : 'none',
              }}
              title="Send"
            >
              <SendIcon/>
            </button>
          </div>

          {/* Webhook hint */}
          <p style={{ textAlign: 'center', fontSize: 11, color: '#3f3f46', marginTop: 8 }}>
            Webhook: <code style={{ color: '#52525b' }}>{WEBHOOK_URL.replace('https://', '')}</code>
          </p>
        </footer>
      </div>
    </>
  )
}
