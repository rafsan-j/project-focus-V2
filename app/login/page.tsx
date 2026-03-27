'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const supabase = createClient()

  async function handleAuth() {
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (error) setError(error.message)
        else setMessage('Check your email to confirm your account, then log in.')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          setError(error.message)
        } else if (data.session) {
          // Hard redirect — bypasses Next.js router, ensures cookies are set
          window.location.href = '/'
        } else {
          setError('Login failed. Please confirm your email first.')
        }
      }
    } catch (err: any) {
      setError('Connection error: ' + err.message)
    }

    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:'20px'}}>
      <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--r3)',padding:'40px',width:'100%',maxWidth:'380px'}}>
        
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:'28px'}}>
          <div style={{width:'44px',height:'44px',background:'var(--accent)',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
            </svg>
          </div>
          <div style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'20px',letterSpacing:'-0.5px',marginBottom:'4px'}}>
            PROJECT FOCUS
          </div>
          <div style={{color:'var(--text2)',fontSize:'13px'}}>
            {isSignUp ? 'Create your account' : 'Access your learning path'}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{background:'var(--red-bg)',border:'1px solid rgba(255,92,122,0.3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:'16px',fontSize:'13px',color:'var(--red)'}}>
            {error}
          </div>
        )}

        {/* Success */}
        {message && (
          <div style={{background:'var(--green-bg)',border:'1px solid rgba(61,220,132,0.3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:'16px',fontSize:'13px',color:'var(--green)'}}>
            {message}
          </div>
        )}

        {/* Email */}
        <div style={{marginBottom:'14px'}}>
          <label style={{display:'block',fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--text2)',marginBottom:'6px'}}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            placeholder="you@email.com"
            style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 12px',color:'var(--text)',fontSize:'14px',outline:'none'}}
          />
        </div>

        {/* Password */}
        <div style={{marginBottom:'22px'}}>
          <label style={{display:'block',fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--text2)',marginBottom:'6px'}}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            placeholder="••••••••"
            style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 12px',color:'var(--text)',fontSize:'14px',outline:'none'}}
          />
        </div>

        {/* Button */}
        <button
          onClick={handleAuth}
          disabled={loading}
          style={{width:'100%',background:'var(--accent)',border:'none',borderRadius:'var(--r)',padding:'12px',color:'#fff',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'14px',cursor:loading?'not-allowed':'pointer',letterSpacing:'.5px',opacity:loading?0.7:1}}
        >
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Log In'}
        </button>

        {/* Toggle signup/login */}
        <div style={{textAlign:'center',marginTop:'16px',fontSize:'13px',color:'var(--text2)'}}>
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <span
            style={{color:'var(--accent)',cursor:'pointer'}}
            onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage('') }}
          >
            {isSignUp ? 'Log in' : 'Sign up'}
          </span>
        </div>

        {/* Debug info - remove after login works */}
        <div style={{marginTop:'20px',padding:'10px',background:'var(--bg)',borderRadius:'var(--r)',fontSize:'11px',color:'var(--text3)',wordBreak:'break-all'}}>
          <div>Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ MISSING'}</div>
          <div>Anon Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ MISSING'}</div>
        </div>

      </div>
    </div>
  )
}
