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

  async function handleAuth() {
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')

    const supabase = createClient()

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + '/auth/callback',
          },
        })
        if (error) setError(error.message)
        else setMessage('Account created! You can now log in.')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          setError(error.message)
          setLoading(false)
          return
        }
        if (data.session) {
          window.location.replace('/')
          return
        }
        setError('No session returned. Please try again.')
      }
    } catch (err: any) {
      setError('Error: ' + err.message)
    }

    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0f14',padding:'20px'}}>
      <div style={{background:'#13161e',border:'1px solid #2a2f45',borderRadius:'18px',padding:'40px',width:'100%',maxWidth:'380px'}}>

        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:'28px'}}>
          <div style={{width:'44px',height:'44px',background:'#5b7cff',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
            </svg>
          </div>
          <div style={{fontFamily:'sans-serif',fontWeight:800,fontSize:'20px',color:'#e8eaf2',marginBottom:'4px'}}>
            PROJECT FOCUS
          </div>
          <div style={{color:'#9aa0bb',fontSize:'13px'}}>
            {isSignUp ? 'Create your account' : 'Access your learning path'}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{background:'rgba(255,92,122,0.12)',border:'1px solid rgba(255,92,122,0.3)',borderRadius:'10px',padding:'10px 14px',marginBottom:'16px',fontSize:'13px',color:'#ff5c7a'}}>
            {error}
          </div>
        )}

        {/* Success */}
        {message && (
          <div style={{background:'rgba(61,220,132,0.1)',border:'1px solid rgba(61,220,132,0.3)',borderRadius:'10px',padding:'10px 14px',marginBottom:'16px',fontSize:'13px',color:'#3ddc84'}}>
            {message}
          </div>
        )}

        {/* Email */}
        <div style={{marginBottom:'14px'}}>
          <label style={{display:'block',fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px',color:'#9aa0bb',marginBottom:'6px'}}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            placeholder="you@email.com"
            style={{width:'100%',background:'#0d0f14',border:'1px solid #2a2f45',borderRadius:'10px',padding:'10px 12px',color:'#e8eaf2',fontSize:'14px',outline:'none'}}
          />
        </div>

        {/* Password */}
        <div style={{marginBottom:'22px'}}>
          <label style={{display:'block',fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px',color:'#9aa0bb',marginBottom:'6px'}}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            placeholder="••••••••"
            style={{width:'100%',background:'#0d0f14',border:'1px solid #2a2f45',borderRadius:'10px',padding:'10px 12px',color:'#e8eaf2',fontSize:'14px',outline:'none'}}
          />
        </div>

        {/* Button */}
        <button
          onClick={handleAuth}
          disabled={loading}
          style={{width:'100%',background:'#5b7cff',border:'none',borderRadius:'10px',padding:'12px',color:'#fff',fontWeight:700,fontSize:'14px',cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1}}
        >
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Log In'}
        </button>

        {/* Toggle */}
        <div style={{textAlign:'center',marginTop:'16px',fontSize:'13px',color:'#9aa0bb'}}>
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <span
            style={{color:'#5b7cff',cursor:'pointer'}}
            onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage('') }}
          >
            {isSignUp ? 'Log in' : 'Sign up'}
          </span>
        </div>

        {/* Env check */}
        <div style={{marginTop:'20px',padding:'10px',background:'#0d0f14',borderRadius:'8px',fontSize:'11px',color:'#5c6280'}}>
          <div>URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ '+process.env.NEXT_PUBLIC_SUPABASE_URL.slice(0,30)+'...' : '✗ MISSING'}</div>
          <div>Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ MISSING'}</div>
        </div>

      </div>
    </div>
  )
}
