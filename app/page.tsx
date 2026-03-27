'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Category = { id: string; name: string; hard_limit: number }
type Module = { id: string; course_id: string; title: string; resource_url: string; order_index: number; is_completed: boolean; notes: string }
type Course = { id: string; category_id: string; title: string; status: string; is_override: boolean; priority_score: number; urgency: number; importance: number; difficulty: number; modules: Module[]; categories?: Category }

const VIEWS = ['dashboard','planner','wishlist'] as const
type View = typeof VIEWS[number]

export default function App() {
  const supabase = createClient()
  const router = useRouter()
  const [view, setView] = useState<View>('dashboard')
  const [courseView, setCourseView] = useState<Course|null>(null)
  const [filterCat, setFilterCat] = useState<string>('all')
  const [categories, setCategories] = useState<Category[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [deadline, setDeadline] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [toast, setToast] = useState<string>('')
  const [modal, setModal] = useState<{title:string,body:string,label:string,fn:()=>void}|null>(null)
  const [loading, setLoading] = useState(true)

  // form state
  const [newTitle, setNewTitle] = useState('')
  const [newCatId, setNewCatId] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newModules, setNewModules] = useState('')
  const [slU, setSlU] = useState(5)
  const [slI, setSlI] = useState(5)
  const [slD, setSlD] = useState(5)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }, [])

  const score = parseFloat(((slU*0.6)+(slI*0.3)+(slD*0.1)).toFixed(1))

  // ── LOAD DATA ──
const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id || 'bypass-mode'
    setUserId(uid)

    const [{ data: cats }, { data: coursesData }, { data: settings }] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      uid !== 'bypass-mode'
        ? supabase.from('courses').select('*, categories(*), modules(*)').eq('user_id', uid).order('priority_score', {ascending:false})
        : { data: [] },
      uid !== 'bypass-mode'
        ? supabase.from('user_settings').select('*').eq('user_id', uid).single()
        : { data: null },
    ])

    if (cats) { setCategories(cats); if (!newCatId && cats.length) setNewCatId(cats[0].id) }
    if (coursesData) {
      const sorted = (coursesData as Course[]).map((c: Course) => ({
        ...c, modules: (c.modules || []).sort((a: Module, b: Module) => a.order_index - b.order_index)
      }))
      setCourses(sorted)
    }
    if (settings) setDeadline((settings as any).deadline || '')
    setLoading(false)
  }, [supabase, router, newCatId])

  useEffect(() => { loadData() }, [])

  // ── HELPERS ──
  function courseProgress(c: Course) {
    if (!c.modules?.length) return 0
    return Math.round((c.modules.filter(m=>m.is_completed).length / c.modules.length) * 100)
  }
  function currentModule(c: Course) {
    const idx = c.modules?.findIndex(m=>!m.is_completed) ?? -1
    return idx === -1 ? c.modules?.[c.modules.length-1] : c.modules?.[idx]
  }
  function activeInCat(catId: string) {
    return courses.filter(c=>c.category_id===catId&&c.status==='active').length
  }
  function daysLeft() {
    if (!deadline) return null
    const diff = Math.ceil((new Date(deadline).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
    return diff > 0 ? diff : 0
  }

  // ── SUPABASE ACTIONS ──
  async function addCourse() {
    if (!newTitle.trim()) { showToast('Please enter a course title.'); return }
    const { data: courseData, error } = await supabase.from('courses').insert({
      user_id: userId, category_id: newCatId, title: newTitle.trim(),
      status: 'wishlist', priority_score: score,
      urgency: slU, importance: slI, difficulty: slD
    }).select().single()
    if (error || !courseData) { showToast('Error adding course.'); return }

    const modLines = newModules.trim().split('\n').filter(l=>l.trim())
    if (modLines.length) {
      const mods = modLines.map((l,i) => {
        const parts = l.split('|')
        return { course_id: courseData.id, title: parts[0].trim(), resource_url: parts[1]?.trim()||newUrl||'#', order_index: i, is_completed: false, notes: '' }
      })
      await supabase.from('modules').insert(mods)
    } else if (newUrl) {
      await supabase.from('modules').insert({ course_id: courseData.id, title: 'Module 1', resource_url: newUrl, order_index: 0, is_completed: false, notes: '' })
    }

    setNewTitle(''); setNewUrl(''); setNewModules(''); setSlU(5); setSlI(5); setSlD(5)
    showToast(`"${newTitle}" added to wishlist!`)
    await loadData()
    setView('wishlist')
  }

  async function activateCourse(c: Course) {
    const active = activeInCat(c.category_id)
    if (active >= 3) { showToast('Slot full! Complete or remove a course first.'); return }
    const isOverride = active === 2
    if (isOverride) {
      setModal({ title:'Override Warning ⚠', body:`You already have 2 active courses in this category. Activating "${c.title}" uses your Override slot. A 4th course will be blocked.`, label:'Force Activate',
        fn: async () => {
          await supabase.from('courses').update({status:'active',is_override:true}).eq('id',c.id)
          await loadData(); showToast('Override activated!')
        }
      })
    } else {
      await supabase.from('courses').update({status:'active',is_override:false}).eq('id',c.id)
      await loadData(); showToast(`"${c.title}" is now active!`)
    }
  }

  async function demoteCourse(c: Course) {
    setModal({ title:'Move to Wishlist?', body:`"${c.title}" will be moved back to your wishlist.`, label:'Move',
      fn: async () => {
        await supabase.from('courses').update({status:'wishlist',is_override:false}).eq('id',c.id)
        setCourseView(null); setView('dashboard'); await loadData(); showToast('Moved to wishlist.')
      }
    })
  }

  async function completeCourse(c: Course) {
    setModal({ title:'Mark Complete?', body:`Mark "${c.title}" as completed?`, label:'Mark Complete',
      fn: async () => {
        await supabase.from('courses').update({status:'completed'}).eq('id',c.id)
        setCourseView(null); setView('dashboard'); await loadData(); showToast('Course completed! 🎉')
      }
    })
  }

  async function deleteCourse(c: Course) {
    setModal({ title:'Delete Course', body:`Permanently delete "${c.title}"? This cannot be undone.`, label:'Delete',
      fn: async () => {
        await supabase.from('courses').delete().eq('id',c.id)
        setCourseView(null); setView('dashboard'); await loadData(); showToast('Deleted.')
      }
    })
  }

  async function toggleModule(courseId: string, mod: Module) {
    await supabase.from('modules').update({is_completed: !mod.is_completed}).eq('id', mod.id)
    await loadData()
  }

  async function saveNote(modId: string, notes: string) {
    await supabase.from('modules').update({notes}).eq('id', modId)
  }

  async function saveDeadline(d: string) {
    await supabase.from('user_settings').upsert({user_id: userId, deadline: d})
    setDeadline(d); showToast('Deadline saved!')
  }

  async function signOut() {
    await supabase.auth.signOut(); router.push('/login')
  }

  // ── UI COMPONENTS ──
  const ring = (pct: number, size=44) => {
    const r=size/2-3, circ=2*Math.PI*r, fill=circ*(pct/100)
    return `<div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#22263a" stroke-width="3"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#5b7cff" stroke-width="3" stroke-dasharray="${fill} ${circ}" stroke-linecap="round"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-weight:700;font-size:10px;color:var(--text)">${pct}%</div>
    </div>`
  }

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',color:'var(--text2)',fontFamily:'var(--font-body)'}}>
      Loading Project Focus...
    </div>
  )

  const activeCourses = courses.filter(c=>c.status==='active'&&(filterCat==='all'||c.category_id===filterCat))
  const catList = filterCat === 'all' ? categories : categories.filter(c=>c.id===filterCat)
  const days = daysLeft()

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'var(--bg)'}}>

      {/* TOPBAR */}
      <div style={{display:'flex',alignItems:'center',gap:0,background:'var(--bg2)',borderBottom:'1px solid var(--border)',padding:'0 20px',height:'52px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',fontFamily:'var(--font-display)',fontWeight:800,fontSize:'16px',marginRight:'28px',letterSpacing:'-0.5px'}}>
          <div style={{width:'28px',height:'28px',background:'var(--accent)',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
          </div>
          PROJECT FOCUS
        </div>
        <div style={{display:'flex',gap:'2px',flex:1}}>
          {(['dashboard','planner','wishlist'] as View[]).map(v => (
            <button key={v} onClick={()=>{setView(v);setCourseView(null)}}
              style={{background:view===v?'var(--accent-glow)':'none',border:view===v?'1px solid rgba(91,124,255,0.25)':'1px solid transparent',color:view===v?'var(--accent)':'var(--text2)',fontFamily:'var(--font-body)',fontSize:'13px',fontWeight:500,padding:'6px 14px',borderRadius:'var(--r)',cursor:'pointer',textTransform:'capitalize'}}>
              {v}
            </button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'20px',padding:'5px 14px',fontSize:'12px',cursor:'pointer'}}
            onClick={()=>{const d=prompt('University start date (YYYY-MM-DD):',deadline);if(d&&/^\d{4}-\d{2}-\d{2}$/.test(d))saveDeadline(d)}}>
            <div>
              <div style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:'18px',color:'var(--accent)',lineHeight:1}}>{days ?? '—'}</div>
              <div style={{fontSize:'10px',color:'var(--text2)',fontWeight:500,textTransform:'uppercase',letterSpacing:'.5px'}}>Days left</div>
            </div>
            <div style={{fontSize:'10px',color:'var(--text3)'}}>Click to set date</div>
          </div>
          <button onClick={signOut} style={{background:'none',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 12px',color:'var(--text2)',cursor:'pointer',fontSize:'12px'}}>Sign out</button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* SIDEBAR */}
        <div style={{width:'200px',background:'var(--bg2)',borderRight:'1px solid var(--border)',flexShrink:0,display:'flex',flexDirection:'column',gap:'4px',padding:'16px 10px',overflowY:'auto'}}>
          <div style={{fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:'var(--text3)',padding:'8px 10px 4px'}}>Categories</div>
          {[{id:'all',name:'All courses'},...categories].map(cat => {
            const count = cat.id === 'all' ? courses.filter(c=>c.status==='active').length : courses.filter(c=>c.status==='active'&&c.category_id===cat.id).length
            const active = filterCat === cat.id
            return (
              <button key={cat.id} onClick={()=>{setFilterCat(cat.id);setView('dashboard');setCourseView(null)}}
                style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',borderRadius:'var(--r)',cursor:'pointer',fontSize:'13px',color:active?'var(--accent)':'var(--text2)',background:active?'var(--accent-glow)':'none',border:active?'1px solid rgba(91,124,255,0.2)':'1px solid transparent',width:'100%',textAlign:'left',fontFamily:'var(--font-body)'}}>
                {cat.name}
                <span style={{marginLeft:'auto',background:active?'rgba(91,124,255,0.2)':'var(--bg4)',color:active?'var(--accent)':'var(--text2)',fontSize:'10px',fontWeight:600,padding:'1px 7px',borderRadius:'20px'}}>{count}</span>
              </button>
            )
          })}
          <div style={{height:'1px',background:'var(--border)',margin:'8px 0'}}/>
          <button onClick={()=>{setView('planner');setCourseView(null)}}
            style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',borderRadius:'var(--r)',cursor:'pointer',fontSize:'13px',color:'var(--text2)',background:'none',border:'1px solid transparent',width:'100%',textAlign:'left',fontFamily:'var(--font-body)'}}>
            + New course
          </button>
        </div>

        {/* MAIN */}
        <div style={{flex:1,overflowY:'auto',padding:'28px'}} className="fade-in">

          {/* COURSE DETAIL VIEW */}
          {courseView && (() => {
            const c = courses.find(x=>x.id===courseView.id) || courseView
            const pct = courseProgress(c)
            return (
              <div>
                <button onClick={()=>{setCourseView(null);setView('dashboard')}}
                  style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'6px 14px',color:'var(--text2)',cursor:'pointer',fontSize:'12px',marginBottom:'20px'}}>
                  ← Back to Dashboard
                </button>
                <div style={{fontFamily:'var(--font-display)',fontSize:'24px',fontWeight:800,letterSpacing:'-0.5px',marginBottom:'4px'}}>{c.title}</div>
                <div style={{color:'var(--text2)',fontSize:'13px',marginBottom:'16px'}}>{c.modules?.filter(m=>m.is_completed).length}/{c.modules?.length} modules · {pct}% complete</div>
                <div style={{height:'6px',background:'var(--bg4)',borderRadius:'3px',marginBottom:'20px',overflow:'hidden'}}>
                  <div style={{height:'100%',background:'var(--accent)',width:`${pct}%`,borderRadius:'3px',transition:'width .4s'}}/>
                </div>
                <div style={{display:'flex',gap:'10px',marginBottom:'24px',flexWrap:'wrap'}}>
                  <button onClick={()=>completeCourse(c)} style={{background:'var(--accent)',border:'none',borderRadius:'var(--r)',padding:'8px 18px',color:'#fff',cursor:'pointer',fontSize:'12px',fontWeight:600}}>Mark Course Complete</button>
                  <button onClick={()=>demoteCourse(c)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'7px 14px',color:'var(--text2)',cursor:'pointer',fontSize:'12px'}}>Move to Wishlist</button>
                  <button onClick={()=>deleteCourse(c)} style={{background:'none',border:'1px solid rgba(255,92,122,0.3)',borderRadius:'var(--r)',padding:'7px 14px',color:'var(--red)',cursor:'pointer',fontSize:'12px'}}>Delete</button>
                </div>
                <div style={{fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'1.5px',color:'var(--text3)',marginBottom:'14px'}}>Module Sequence</div>
                <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                  {c.modules?.map((m, i) => {
                    const prevDone = i===0 || c.modules[i-1].is_completed
                    const isActive = !m.is_completed && prevDone
                    const isLocked = !m.is_completed && !prevDone
                    const [noteOpen, setNoteOpen] = useState(!!m.notes)
                    const [noteVal, setNoteVal] = useState(m.notes||'')
                    return (
                      <div key={m.id}>
                        <div style={{display:'flex',alignItems:'stretch',gap:'14px',background:'var(--bg2)',border:`1px solid ${isActive?'var(--accent)':isLocked?'var(--border)':'var(--border)'}`,borderRadius:'var(--r2)',overflow:'hidden',opacity:isLocked?0.45:1}}>
                          <div style={{width:'60px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'var(--bg3)',borderRight:'1px solid var(--border)',flexShrink:0,padding:'12px 0'}}>
                            <div style={{fontSize:'9px',fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:'var(--text3)'}}>MOD</div>
                            <div style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'20px',color:'var(--text)'}}>{String(i+1).padStart(2,'0')}</div>
                          </div>
                          <div style={{flex:1,padding:'14px 16px',display:'flex',alignItems:'center',gap:'14px'}}>
                            <div style={{flex:1,fontWeight:500,fontSize:'14px'}}>{m.title}</div>
                            <div style={{fontSize:'11px',fontWeight:600,color:m.is_completed?'var(--green)':isActive?'var(--accent)':'var(--text3)',whiteSpace:'nowrap'}}>
                              {m.is_completed?'✓ Done':isActive?'▶ In progress':'⬡ Locked'}
                            </div>
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:'6px',padding:'12px 14px 12px 0',alignItems:'flex-end',justifyContent:'center'}}>
                            <button disabled={isLocked} onClick={()=>window.open(m.resource_url,'_blank')}
                              style={{background:isLocked?'var(--bg4)':'var(--accent)',color:isLocked?'var(--text3)':'#fff',border:'none',borderRadius:'8px',padding:'6px 16px',fontSize:'12px',fontWeight:600,cursor:isLocked?'not-allowed':'pointer',whiteSpace:'nowrap'}}>
                              Go to lesson
                            </button>
                            <button onClick={()=>toggleModule(c.id,m)}
                              style={{background:'none',border:'1px solid var(--border)',borderRadius:'8px',padding:'4px 10px',fontSize:'11px',color:m.is_completed?'var(--green)':'var(--text2)',cursor:'pointer'}}>
                              {m.is_completed?'✓ Done':'Mark done'}
                            </button>
                            <button onClick={()=>setNoteOpen(!noteOpen)}
                              style={{background:'none',border:'none',fontSize:'11px',color:'var(--text3)',cursor:'pointer'}}>
                              Notes{noteVal.trim()?<span style={{display:'inline-block',width:'5px',height:'5px',background:'var(--accent)',borderRadius:'50%',marginLeft:'3px',verticalAlign:'middle'}}/>:null}
                            </button>
                          </div>
                        </div>
                        {noteOpen && (
                          <textarea value={noteVal} rows={3} placeholder="Notes for this module..."
                            onChange={e=>{setNoteVal(e.target.value);saveNote(m.id,e.target.value)}}
                            style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderTop:'none',borderRadius:'0 0 var(--r2) var(--r2)',color:'var(--text)',fontFamily:'var(--font-body)',fontSize:'12px',resize:'none',padding:'10px 14px',outline:'none'}}/>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* DASHBOARD */}
          {!courseView && view==='dashboard' && (
            <div>
              <div style={{fontFamily:'var(--font-display)',fontSize:'24px',fontWeight:800,letterSpacing:'-0.5px',marginBottom:'6px'}}>Focus Dashboard</div>
              <div style={{color:'var(--text2)',fontSize:'13px',marginBottom:'24px'}}>{activeCourses.length} active · {courses.filter(c=>c.status==='wishlist').length} in wishlist</div>
              {catList.map(cat => {
                const catCourses = courses.filter(c=>c.status==='active'&&c.category_id===cat.id)
                return (
                  <div key={cat.id} style={{marginBottom:'28px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
                      <div style={{fontFamily:'var(--font-display)',fontSize:'18px',fontWeight:700,letterSpacing:'-0.3px'}}>{cat.name}</div>
                      <div style={{fontSize:'12px',color:'var(--text2)',background:'var(--bg3)',padding:'2px 10px',borderRadius:'20px',border:'1px solid var(--border)'}}>{catCourses.length}/3 slots</div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:'14px'}}>
                      {catCourses.map(c => {
                        const pct = courseProgress(c)
                        const cur = currentModule(c)
                        return (
                          <div key={c.id} onClick={()=>{setCourseView(c);setView('course' as any)}}
                            style={{background:'var(--bg2)',border:`1px solid ${c.is_override?'rgba(255,92,122,0.3)':'var(--border)'}`,borderRadius:'var(--r2)',padding:'18px',cursor:'pointer',position:'relative',overflow:'hidden',transition:'all .2s'}}>
                            {c.is_override && <div style={{position:'absolute',top:'12px',right:'12px',background:'var(--red-bg)',color:'var(--red)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',padding:'2px 8px',borderRadius:'20px',border:'1px solid rgba(255,92,122,0.25)'}}>OVERRIDE</div>}
                            <div style={{fontFamily:'var(--font-display)',fontSize:'15px',fontWeight:700,marginBottom:'4px',paddingRight:'60px',lineHeight:1.3}}>{c.title}</div>
                            <div style={{fontSize:'12px',color:'var(--text2)',marginBottom:'14px'}}>{c.modules?.length||0} modules</div>
                            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
                              <div dangerouslySetInnerHTML={{__html:ring(pct)}}/>
                              <div style={{flex:1}}>
                                <div style={{height:'4px',background:'var(--bg4)',borderRadius:'2px',overflow:'hidden',marginBottom:'4px'}}>
                                  <div style={{height:'100%',background:'var(--accent)',width:`${pct}%`,borderRadius:'2px'}}/>
                                </div>
                                <div style={{fontSize:'11px',color:'var(--text2)'}}>{pct}% complete</div>
                              </div>
                            </div>
                            {cur && <div style={{fontSize:'11px',color:'var(--text2)',marginBottom:'12px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>▶ {cur.title}</div>}
                            <button onClick={e=>{e.stopPropagation();window.open(cur?.resource_url||'#','_blank')}}
                              style={{width:'100%',background:'var(--accent)',border:'none',borderRadius:'var(--r)',padding:'8px',fontSize:'12px',fontWeight:600,color:'#fff',cursor:'pointer'}}>
                              Go to lesson
                            </button>
                          </div>
                        )
                      })}
                      {catCourses.length < 2 && (
                        <div onClick={()=>setView('wishlist')}
                          style={{background:'var(--bg)',border:'1px dashed var(--border)',borderRadius:'var(--r2)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:'13px',cursor:'pointer',minHeight:'130px',transition:'all .15s'}}>
                          + Activate from wishlist
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {activeCourses.length === 0 && (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'48px 24px',textAlign:'center',gap:'10px',color:'var(--text2)'}}>
                  <div style={{fontSize:'16px',fontFamily:'var(--font-display)',fontWeight:700}}>No active courses{filterCat!=='all'?' in this category':''}</div>
                  <div style={{fontSize:'13px',color:'var(--text3)'}}>Activate a course from your wishlist to start tracking.</div>
                  <button onClick={()=>setView('wishlist')} style={{background:'var(--accent)',border:'none',borderRadius:'var(--r)',padding:'8px 20px',color:'#fff',cursor:'pointer',fontSize:'13px',fontWeight:600,marginTop:'8px'}}>View Wishlist →</button>
                </div>
              )}
            </div>
          )}

          {/* PLANNER */}
          {!courseView && view==='planner' && (
            <div>
              <div style={{fontFamily:'var(--font-display)',fontSize:'24px',fontWeight:800,letterSpacing:'-0.5px',marginBottom:'6px'}}>Add New Course</div>
              <div style={{color:'var(--text2)',fontSize:'13px',marginBottom:'24px'}}>Build your learning queue. Priority score is auto-calculated.</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
                <div>
                  {[['Course Title','text',newTitle,setNewTitle,'e.g., Learn Python for Web'],['Course URL (deep link)','url',newUrl,setNewUrl,'https://...' ]].map(([label,type,val,set,ph])=>(
                    <div key={label as string} style={{marginBottom:'16px'}}>
                      <label style={{display:'block',fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--text2)',marginBottom:'8px'}}>{label as string}</label>
                      <input type={type as string} value={val as string} onChange={e=>(set as any)(e.target.value)} placeholder={ph as string}
                        style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:'13px',outline:'none'}}/>
                    </div>
                  ))}
                  <div style={{marginBottom:'16px'}}>
                    <label style={{display:'block',fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--text2)',marginBottom:'8px'}}>Category</label>
                    <select value={newCatId} onChange={e=>setNewCatId(e.target.value)}
                      style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:'13px',outline:'none',appearance:'none'}}>
                      {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:'16px'}}>
                    <label style={{display:'block',fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--text2)',marginBottom:'8px'}}>Modules <span style={{fontSize:'11px',textTransform:'none',letterSpacing:0,color:'var(--text3)'}}>— one per line: Title | URL</span></label>
                    <textarea value={newModules} onChange={e=>setNewModules(e.target.value)} rows={5} placeholder={"Intro to Python | https://...\nVariables & Types | https://..."}
                      style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:'13px',outline:'none',resize:'vertical'}}/>
                  </div>
                  <div style={{marginBottom:'16px'}}>
                    <label style={{display:'block',fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--text2)',marginBottom:'10px'}}>Priority Sliders</label>
                    {[['Urgency',slU,setSlU],['Importance',slI,setSlI],['Difficulty',slD,setSlD]].map(([label,val,set])=>(
                      <div key={label as string} style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
                        <label style={{fontSize:'12px',color:'var(--text2)',width:'90px',flexShrink:0}}>{label as string}</label>
                        <input type="range" min={1} max={10} value={val as number} onChange={e=>(set as any)(Number(e.target.value))} style={{flex:1,accentColor:'var(--accent)'}}/>
                        <span style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:'13px',color:'var(--accent)',width:'20px',textAlign:'right'}}>{val as number}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px 16px',marginBottom:'16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div>
                      <div style={{fontSize:'11px',color:'var(--text2)',marginBottom:'2px'}}>Priority Score</div>
                      <div style={{fontFamily:'var(--font-display)',fontSize:'24px',fontWeight:800,color:'var(--accent)'}}>{score}/10</div>
                    </div>
                    <div style={{fontSize:'10px',color:'var(--text3)',fontFamily:'monospace'}}>P = (U×0.6)+(I×0.3)+(D×0.1)</div>
                  </div>
                  <button onClick={addCourse} style={{width:'100%',background:'var(--accent)',border:'none',borderRadius:'var(--r)',padding:'12px',color:'#fff',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'14px',cursor:'pointer',letterSpacing:'.5px'}}>
                    Add to Wishlist →
                  </button>
                </div>
                <div>
                  <div style={{fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'1.5px',color:'var(--text3)',marginBottom:'14px'}}>Active Slot Status</div>
                  {categories.map(cat => {
                    const a = activeInCat(cat.id)
                    return (
                      <div key={cat.id} style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--r2)',padding:'16px',marginBottom:'12px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px',fontSize:'13px'}}>
                          <span>{cat.name}</span>
                          <span style={{color:a>=3?'var(--red)':a===2?'var(--amber)':'var(--green)',fontWeight:600}}>{a}/3</span>
                        </div>
                        <div style={{height:'5px',background:'var(--bg4)',borderRadius:'3px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${(a/3)*100}%`,background:a>=3?'var(--red)':a===2?'var(--amber)':'var(--accent)',borderRadius:'3px'}}/>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--r2)',padding:'16px',marginTop:'4px'}}>
                    <div style={{fontWeight:500,fontSize:'13px',marginBottom:'8px'}}>Tips</div>
                    <p style={{color:'var(--text2)',fontSize:'12px',lineHeight:1.7}}>2 standard active slots per category. Force a 3rd with Override. A 4th is completely blocked until you complete or remove one.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WISHLIST */}
          {!courseView && view==='wishlist' && (
            <div>
              <div style={{fontFamily:'var(--font-display)',fontSize:'24px',fontWeight:800,letterSpacing:'-0.5px',marginBottom:'6px'}}>Wishlist & Backlog</div>
              <div style={{color:'var(--text2)',fontSize:'13px',marginBottom:'24px'}}>{courses.filter(c=>c.status==='wishlist').length} queued · sorted by priority</div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'24px'}}>
                {courses.filter(c=>c.status==='wishlist').sort((a,b)=>b.priority_score-a.priority_score).map(c => {
                  const cat = categories.find(x=>x.id===c.category_id)
                  const a = activeInCat(c.category_id)
                  return (
                    <div key={c.id} style={{background:'var(--bg2)',border:`1px solid ${c.is_override?'rgba(255,92,122,0.3)':'var(--border)'}`,borderRadius:'var(--r2)',padding:'14px 16px',position:'relative'}}>
                      {c.is_override&&<div style={{position:'absolute',top:'12px',right:'12px',background:'var(--red-bg)',color:'var(--red)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',padding:'2px 8px',borderRadius:'20px',border:'1px solid rgba(255,92,122,0.25)'}}>OVERRIDE</div>}
                      <div style={{display:'flex',alignItems:'flex-start',gap:'16px'}}>
                        <div style={{textAlign:'center',flexShrink:0}}>
                          <div style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',fontWeight:500,marginBottom:'2px'}}>Score</div>
                          <div style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:'22px',color:'var(--accent)',lineHeight:1}}>{c.priority_score}</div>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:'var(--font-display)',fontSize:'14px',fontWeight:700,marginBottom:'2px'}}>{c.title}</div>
                          <div style={{fontSize:'11px',color:'var(--text2)'}}>{cat?.name} · {c.modules?.length||0} module{c.modules?.length!==1?'s':''}</div>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:'10px',marginTop:'12px'}}>
                        <button disabled={a>=3} onClick={()=>activateCourse(c)}
                          style={{flex:1,background:a>=3?'var(--bg4)':'var(--accent)',border:'none',borderRadius:'8px',padding:'8px',color:a>=3?'var(--text3)':'#fff',fontSize:'12px',fontWeight:600,cursor:a>=3?'not-allowed':'pointer',fontFamily:'var(--font-body)'}}>
                          {a>=3?'Category Full':'Activate →'}
                        </button>
                        <button onClick={()=>deleteCourse(c)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'8px',padding:'7px 12px',color:'var(--text3)',cursor:'pointer',fontSize:'12px'}}>Delete</button>
                      </div>
                    </div>
                  )
                })}
                {!courses.filter(c=>c.status==='wishlist').length && (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'48px 24px',textAlign:'center',gap:'10px',color:'var(--text2)'}}>
                    <div style={{fontSize:'16px',fontFamily:'var(--font-display)',fontWeight:700}}>Wishlist is empty</div>
                    <button onClick={()=>setView('planner')} style={{background:'var(--accent)',border:'none',borderRadius:'var(--r)',padding:'8px 20px',color:'#fff',cursor:'pointer',fontSize:'13px',fontWeight:600,marginTop:'8px'}}>Add a Course →</button>
                  </div>
                )}
              </div>
              {courses.filter(c=>c.status==='completed').length > 0 && (
                <div>
                  <div style={{height:'1px',background:'var(--border)',margin:'24px 0'}}/>
                  <div style={{fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'1.5px',color:'var(--text3)',marginBottom:'14px'}}>Completed</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                    {courses.filter(c=>c.status==='completed').map(c=>(
                      <div key={c.id} style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--r2)',padding:'14px 16px',display:'flex',alignItems:'center',gap:'12px',opacity:.7}}>
                        <span style={{color:'var(--green)',fontSize:'18px'}}>✓</span>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:'var(--font-display)',fontSize:'13px',fontWeight:700}}>{c.title}</div>
                          <div style={{fontSize:'11px',color:'var(--text2)'}}>{categories.find(x=>x.id===c.category_id)?.name}</div>
                        </div>
                        <button onClick={()=>deleteCourse(c)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'8px',padding:'5px 10px',color:'var(--text3)',cursor:'pointer',fontSize:'11px'}}>Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL */}
      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,backdropFilter:'blur(2px)'}}>
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--r3)',padding:'28px',maxWidth:'380px',width:'90%'}}>
            <div style={{fontFamily:'var(--font-display)',fontSize:'18px',fontWeight:700,marginBottom:'8px'}}>{modal.title}</div>
            <p style={{color:'var(--text2)',fontSize:'13px',marginBottom:'20px',lineHeight:1.6}}>{modal.body}</p>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>setModal(null)} style={{flex:1,background:'none',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px',color:'var(--text2)',cursor:'pointer',fontSize:'13px'}}>Cancel</button>
              <button onClick={()=>{modal.fn();setModal(null)}} style={{flex:1,background:'var(--red)',border:'none',borderRadius:'var(--r)',padding:'10px',color:'#fff',cursor:'pointer',fontSize:'13px',fontWeight:600}}>{modal.label}</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{position:'fixed',bottom:'24px',right:'24px',background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:'var(--r)',padding:'10px 16px',fontSize:'13px',color:'var(--text)',zIndex:2000,boxShadow:'0 8px 24px rgba(0,0,0,.4)'}}>
          {toast}
        </div>
      )}
    </div>
  )
}
