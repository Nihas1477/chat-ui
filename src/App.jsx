import React, { useState, useRef, useEffect, useCallback } from 'react'

// ── CONFIG ────────────────────────────────────────────────────────────────────
const WEBHOOK_URL = 'https://first-sponge-noble.ngrok-free.app/webhook-test/webhook-path-123'
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
  // Handle string directly
  if (typeof data === 'string') return data

  // Array response (n8n agent output is usually wrapped in array)
  if (Array.isArray(data)) {
    const first = data[0]
    if (!first) return '(empty response)'
    // Most common: agent puts result in output
    if (typeof first.output === 'string') return first.output
    // Information extractor / extractor nodes
    if (first.output?.answer) return first.output.answer
    if (first.output?.text)   return first.output.text
    // Fallback fields
    if (first.message?.content) return first.message.content
    if (first.text)    return first.text
    if (first.reply)   return first.reply
    if (first.result)  return first.result
    // Last resort: pretty-print
    return JSON.stringify(first, null, 2)
  }

  // Object response
  if (typeof data === 'object' && data !== null) {
    if (typeof data.output === 'string') return data.output
    if (data.output?.answer) return data.output.answer
    if (data.reply)   return data.reply
    if (data.message) return typeof data.message === 'string' ? data.message : data.message.content
    if (data.text)    return data.text
    if (data.response) return data.response
    return JSON.stringify(data, null, 2)
  }

  return String(data)
}

// Detect the type of an attached file
function getFileType(file) {
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf') return 'pdf'
  return 'text'
}

// ── ICONS ────────────────────────────────────────────────────────────────────
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{width:18,height:18}} stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
  </svg>
)
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{width:18,height:18}} stroke="currentColor" strokeWidth="2">
    <rect x="9" y="3" width="6" height="10" rx="3"/>
    <path strokeLinecap="round" d="M5 11a7 7 0 0014 0"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="9" y1="23" x2="15" y2="23"/>
  </svg>
)
const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:18,height:18}}>
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
)
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{width:18,height:18}} stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}} stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

// ── COMPONENTS ────────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <span style={{display:'inline-flex',gap:5,alignItems:'center',padding:'4px 0'}}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width:8, height:8, borderRadius:'50%', background:'#7c3aed',
          animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite`
        }}/>
      ))}
    </span>
  )
}

function FileChip({ file, onRemove }) {
  const label = file.type.startsWith('audio') ? '🎵'
    : file.type.startsWith('image') ? '🖼'
    : file.type === 'application/pdf' ? 'PDF' : 'FILE'
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6,
      background:'rgba(124,58,237,0.15)', border:'1px solid rgba(124,58,237,0.35)',
      color:'#c4b5fd', fontSize:12, borderRadius:20, padding:'4px 10px',
    }}>
      <span style={{fontWeight:600, fontSize:11, color:'#a78bfa'}}>{label}</span>
      <span style={{maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{file.name}</span>
      <button onClick={onRemove} style={{background:'none',border:'none',cursor:'pointer',color:'inherit',padding:0,display:'flex'}}>
        <CloseIcon/>
      </button>
    </span>
  )
}

function Message({ msg }) {
  const isUser   = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div style={{display:'flex',justifyContent:'center',margin:'4px 0'}}>
        <span style={{
          fontSize:12, color:'#52525b', background:'#18181b',
          padding:'4px 14px', borderRadius:20, border:'1px solid #27272a',
        }}>{msg.text}</span>
      </div>
    )
  }

  return (
    <div style={{
      display:'flex', gap:10,
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems:'flex-end',
      padding: '0 16px',
    }}>
      {!isUser && (
        <div style={{
          flexShrink:0, width:32, height:32, borderRadius:'50%',
          background:'linear-gradient(135deg,#5b21b6,#4338ca)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:15, userSelect:'none',
        }}>🤖</div>
      )}
      <div style={{
        maxWidth:'72%',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding:'10px 14px',
        fontSize:14, lineHeight:1.6,
        background: isUser
          ? 'linear-gradient(135deg,#7c3aed,#4f46e5)'
          : '#1e1b2e',
        border: isUser ? 'none' : '1px solid #2e2b3e',
        color: '#e4e4f0',
        boxShadow: isUser ? '0 2px 8px rgba(124,58,237,.3)' : 'none',
      }}>
        {msg.imageUrl
          ? <img src={msg.imageUrl} alt="generated" style={{maxWidth:'100%',borderRadius:10,display:'block'}}/>
          : <span style={{whiteSpace:'pre-wrap'}}>{msg.text}</span>
        }
      </div>
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([
    { role:'bot', text:"Hi, I'm ARIA — your AI assistant. You can type a message, attach a file (PDF, image, audio), or use the mic." }
  ])
  const [input, setInput]           = useState('')
  const [files, setFiles]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [recording, setRecording]   = useState(false)
  const [recorder, setRecorder]     = useState(null)
  const [status, setStatus]         = useState('standby') // 'standby' | 'ok' | 'error'

  const messagesEndRef = useRef(null)
  const textareaRef    = useRef(null)
  const chunksRef      = useRef([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

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
        headers: { 'ngrok-skip-browser-warning': 'true' },
      })

      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`)

      setStatus('ok')
      const contentType = res.headers.get('content-type') || ''

      // Binary image response
      if (contentType.startsWith('image/')) {
        const blob     = await res.blob()
        const imageUrl = URL.createObjectURL(blob)
        setMessages(prev => [...prev, { role:'bot', imageUrl }])
        return
      }

      // JSON response
      if (contentType.includes('application/json')) {
        const data     = await res.json()
        const botReply = parseBotReply(data)
        setMessages(prev => [...prev, { role:'bot', text: botReply }])
        return
      }

      // Plain text (or anything else)
      const text = await res.text()
      // Try parsing as JSON anyway — some n8n nodes return JSON with text/plain header
      try {
        const data     = JSON.parse(text)
        const botReply = parseBotReply(data)
        setMessages(prev => [...prev, { role:'bot', text: botReply }])
      } catch {
        setMessages(prev => [...prev, { role:'bot', text: text || '(no response)' }])
      }

    } catch (err) {
      setStatus('error')
      if (err.name === 'AbortError') {
        setMessages(prev => [...prev, { role:'bot', text:'⏱ Request timed out. The workflow may still be running — try again shortly.' }])
      } else {
        setMessages(prev => [...prev, { role:'bot', text:`⚠️ ${err.message}\n\nCheck:\n• Workflow is active (not in test mode)\n• Webhook URL is the production URL\n• ngrok tunnel is running` }])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const sendMessage = useCallback(async () => {
    if (loading || (!input.trim() && files.length === 0)) return

    const userText = input.trim() || '(sent file)'
    setMessages(prev => [...prev, { role:'user', text: userText }])
    setInput('')
    setFiles([])

    const formData = new FormData()

    // Determine the type field for n8n Switch1 node
    if (files.length > 0) {
      const fileType = getFileType(files[0])
      formData.append('type', fileType)
      files.forEach(f => formData.append('file', f, f.name))
      // Also pass any caption/text alongside
      if (input.trim()) formData.append('caption', input.trim())
    } else {
      formData.append('type', 'text')
      formData.append('text', input.trim())
    }

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
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      const mr     = new MediaRecorder(stream)
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob      = new Blob(chunksRef.current, { type:'audio/webm' })
        const audioFile = new File([blob], 'voice.webm', { type:'audio/webm' })

        setMessages(prev => [...prev, { role:'user', text:'🎙 Voice message' }])

        const formData = new FormData()
        formData.append('type', 'audio')
        formData.append('file', audioFile, audioFile.name)
        await postToWebhook(formData)
      }

      mr.start()
      setRecorder(mr)
      setRecording(true)
      setMessages(prev => [...prev, { role:'system', text:'Recording… click the mic again to stop' }])
    } catch (err) {
      alert('Microphone access denied: ' + err.message)
    }
  }

  const clearChat = () => {
    setMessages([{ role:'bot', text:'Chat cleared. How can I help?' }])
    setStatus('standby')
  }

  const statusColor = status === 'ok' ? '#4ade80' : status === 'error' ? '#f87171' : '#52525b'
  const statusLabel = status === 'ok' ? '● Connected' : status === 'error' ? '● Error' : '● Standby'
  const canSend     = !loading && (input.trim().length > 0 || files.length > 0)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        body { font-family: 'Inter', sans-serif; background: #09090b; }
        @keyframes bounce {
          0%,80%,100% { transform:translateY(0); opacity:.4 }
          40% { transform:translateY(-6px); opacity:1 }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .msg-in { animation: fadeUp .2s ease forwards; }
        textarea::placeholder { color:#52525b; }
        textarea:focus { outline:none; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#3f3f46; border-radius:4px; }
        button { font-family: inherit; }
      `}</style>

      <div style={{
        height:'100dvh', display:'flex', flexDirection:'column',
        background:'#09090b', color:'#e4e4f0',
        fontFamily:"'Inter', sans-serif",
      }}>

        {/* ── HEADER ── */}
        <header style={{
          padding:'12px 24px',
          borderBottom:'1px solid #18181b',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'rgba(9,9,11,0.85)', backdropFilter:'blur(16px)',
          position:'sticky', top:0, zIndex:10,
          flexShrink:0,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{
              width:40, height:40, borderRadius:12,
              background:'linear-gradient(135deg,#7c3aed,#4338ca)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:20, flexShrink:0,
            }}>🤖</div>
            <div>
              <div style={{fontWeight:600, fontSize:16, letterSpacing:'-0.02em', color:'#f4f4f5'}}>
                ARIA Chat Bot
              </div>
              <div style={{fontSize:11, color: statusColor, marginTop:2}}>
                {statusLabel}
              </div>
            </div>
          </div>
          <button
            onClick={clearChat}
            style={{
              background:'transparent', border:'1px solid #27272a', borderRadius:8,
              color:'#71717a', padding:'5px 14px', fontSize:12, cursor:'pointer',
              fontFamily:'inherit', transition:'all .15s',
            }}
            onMouseEnter={e=>{e.target.style.color='#e4e4f0';e.target.style.borderColor='#52525b'}}
            onMouseLeave={e=>{e.target.style.color='#71717a';e.target.style.borderColor='#27272a'}}
          >Clear</button>
        </header>

        {/* ── MESSAGES ── */}
        <main style={{
          flex:1, overflowY:'auto',
          padding:'20px 0',
          display:'flex', flexDirection:'column', gap:12,
        }}>
          {messages.map((m, i) => (
            <div key={i} className="msg-in">
              <Message msg={m}/>
            </div>
          ))}

          {loading && (
            <div className="msg-in" style={{display:'flex',gap:10,alignItems:'flex-end',padding:'0 16px'}}>
              <div style={{
                flexShrink:0, width:32, height:32, borderRadius:'50%',
                background:'linear-gradient(135deg,#5b21b6,#4338ca)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
              }}>🤖</div>
              <div style={{
                background:'#1e1b2e', border:'1px solid #2e2b3e',
                borderRadius:'18px 18px 18px 4px', padding:'10px 16px',
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
            padding:'8px 20px', display:'flex', gap:8, flexWrap:'wrap',
            borderTop:'1px solid #18181b', background:'#0e0c14', flexShrink:0,
          }}>
            {files.map((f,i) => (
              <FileChip key={i} file={f} onRemove={()=>setFiles(prev=>prev.filter((_,j)=>j!==i))}/>
            ))}
          </div>
        )}

        {/* ── INPUT AREA ── */}
        <footer style={{
          padding:'12px 16px 18px', borderTop:'1px solid #18181b',
          background:'rgba(9,9,11,0.9)', backdropFilter:'blur(16px)', flexShrink:0,
        }}>
          <div style={{
            display:'flex', alignItems:'flex-end', gap:8,
            background:'#111117', border:'1px solid #2a2640',
            borderRadius:20, padding:'6px 10px',
            transition:'border-color .2s',
          }}
          onFocusCapture={e=>e.currentTarget.style.borderColor='#6d28d9'}
          onBlurCapture={e=>e.currentTarget.style.borderColor='#2a2640'}
          >
            {/* File attach */}
            <label htmlFor="fileUp" style={{
              cursor:'pointer', color:'#52525b', padding:'7px',
              borderRadius:10, transition:'all .15s',
              display:'flex', alignItems:'center', flexShrink:0,
            }}
            onMouseEnter={e=>{e.currentTarget.style.color='#a78bfa';e.currentTarget.style.background='#1e1b2e'}}
            onMouseLeave={e=>{e.currentTarget.style.color='#52525b';e.currentTarget.style.background='transparent'}}
            title="Attach file">
              <PlusIcon/>
              <input
                id="fileUp" type="file" multiple
                accept=".pdf,audio/*,image/*"
                style={{display:'none'}}
                onChange={e=>setFiles(prev=>[...prev,...Array.from(e.target.files)])}
              />
            </label>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Message ARIA…  (Shift+Enter for new line)"
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                flex:1, background:'transparent', border:'none', outline:'none',
                resize:'none', color:'#e4e4f0', fontSize:14, lineHeight:1.6,
                fontFamily:"'Inter', sans-serif",
                minHeight:38, maxHeight:160, overflowY:'auto',
                padding:'7px 4px',
              }}
            />

            {/* Mic */}
            <button
              onClick={toggleRecording}
              title={recording?'Stop':'Voice input'}
              style={{
                background: recording?'rgba(239,68,68,.15)':'transparent',
                border: recording?'1px solid #ef4444':'none',
                color: recording?'#ef4444':'#52525b',
                borderRadius:10, padding:'7px', cursor:'pointer',
                transition:'all .15s', display:'flex', flexShrink:0,
              }}
              onMouseEnter={e=>{if(!recording){e.currentTarget.style.color='#a78bfa';e.currentTarget.style.background='#1e1b2e'}}}
              onMouseLeave={e=>{if(!recording){e.currentTarget.style.color='#52525b';e.currentTarget.style.background='transparent'}}}
            >
              {recording ? <StopIcon/> : <MicIcon/>}
            </button>

            {/* Send */}
            <button
              onClick={sendMessage}
              disabled={!canSend}
              style={{
                background: canSend
                  ? 'linear-gradient(135deg,#7c3aed,#4f46e5)'
                  : '#1e1b2e',
                border:'none', borderRadius:12, padding:'8px 10px',
                color: canSend ? 'white' : '#52525b',
                cursor: canSend ? 'pointer' : 'default',
                transition:'all .2s', display:'flex', alignItems:'center', flexShrink:0,
                boxShadow: canSend ? '0 0 14px rgba(124,58,237,.35)' : 'none',
              }}
              title="Send"
            >
              <SendIcon/>
            </button>
          </div>

          <p style={{textAlign:'center',fontSize:11,color:'#3f3f46',marginTop:8}}>
            {WEBHOOK_URL.replace('https://','')}
          </p>
        </footer>
      </div>
    </>
  )
}
