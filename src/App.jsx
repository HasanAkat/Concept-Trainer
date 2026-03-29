import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import './App.css'

const APP_NAME = 'Kavram Atlası'
const APP_TAGLINE =
  'Kavram ekle • Açıkla • Kendini test et'

const shuffle = (list) => {
  const array = [...list]
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

const buildQuestions = (concepts) =>
  concepts.flatMap((concept) =>
    (concept.items || []).map((text) => ({
      conceptId: concept.id,
      conceptName: concept.name,
      text,
    })),
  )

const makeOptions = (question, concepts) => {
  const others = concepts.filter((concept) => concept.id !== question.conceptId)
  const picks = shuffle(others)
    .slice(0, 3)
    .map((concept) => concept.name)
  return shuffle([question.conceptName, ...picks])
}

const getAuthMessage = (error) => {
  const code = error?.code || ''
  if (code.includes('auth/invalid-email')) {
    return 'E-posta adresi geçersiz.'
  }
  if (code.includes('auth/user-not-found')) {
    return 'Kullanıcı bulunamadı.'
  }
  if (code.includes('auth/wrong-password')) {
    return 'Şifre hatalı.'
  }
  if (code.includes('auth/email-already-in-use')) {
    return 'Bu e-posta zaten kullanımda.'
  }
  if (code.includes('auth/weak-password')) {
    return 'Şifre en az 6 karakter olmalı.'
  }
  return 'Bir hata oluştu. Lütfen tekrar dene.'
}

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const [view, setView] = useState('home')
  const [activeCourseId, setActiveCourseId] = useState(null)

  const [courses, setCourses] = useState([])
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [courseError, setCourseError] = useState('')

  const [concepts, setConcepts] = useState([])
  const [conceptsLoading, setConceptsLoading] = useState(false)

  const [entryMode, setEntryMode] = useState('new')
  const [conceptName, setConceptName] = useState('')
  const [detailText, setDetailText] = useState('')
  const [entryError, setEntryError] = useState('')
  const [entryBusy, setEntryBusy] = useState(false)

  const [quiz, setQuiz] = useState(null)
  const [quizError, setQuizError] = useState('')

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    window.localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!user) {
      setCourses([])
      setCoursesLoading(false)
      return
    }

    setCoursesLoading(true)
    const coursesRef = collection(db, 'users', user.uid, 'courses')
    const coursesQuery = query(coursesRef, orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(coursesQuery, (snapshot) => {
      const nextCourses = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      setCourses(nextCourses)
      setCoursesLoading(false)
    })

    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!user || !activeCourseId) {
      setConcepts([])
      setConceptsLoading(false)
      return
    }

    setConceptsLoading(true)
    const conceptsRef = collection(
      db,
      'users',
      user.uid,
      'courses',
      activeCourseId,
      'concepts',
    )
    const conceptsQuery = query(conceptsRef, orderBy('name'))
    const unsub = onSnapshot(conceptsQuery, (snapshot) => {
      const nextConcepts = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      setConcepts(nextConcepts)
      setConceptsLoading(false)
    })

    return () => unsub()
  }, [user, activeCourseId])

  const activeCourse = courses.find((course) => course.id === activeCourseId)

  const questionPool = useMemo(() => buildQuestions(concepts), [concepts])
  const currentQuestion = quiz?.questions?.[quiz.index]
  const isCorrect =
    quiz?.selected && currentQuestion?.conceptName === quiz.selected

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthBusy(true)
    try {
      if (authMode === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (error) {
      setAuthError(getAuthMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
    setView('home')
    setActiveCourseId(null)
    setQuiz(null)
  }

  const handleAddCourse = async (event) => {
    event.preventDefault()
    const name = courseName.trim()
    if (!name) {
      setCourseError('Ders adı boş olamaz.')
      return
    }

    if (!user) return

    setCourseError('')
    await addDoc(collection(db, 'users', user.uid, 'courses'), {
      name,
      createdAt: serverTimestamp(),
    })
    setCourseName('')
  }

  const handleOpenCourse = (courseId) => {
    setActiveCourseId(courseId)
    setView('course')
    setQuiz(null)
    setEntryMode('new')
    setConceptName('')
    setDetailText('')
    setEntryError('')
  }

  const handleAddEntry = async (event) => {
    event.preventDefault()
    const detail = detailText.trim()

    if (!detail) {
      setEntryError('Açıklama boş olamaz.')
      return
    }

    if (!user || !activeCourseId) return

    setEntryBusy(true)
    setEntryError('')
    try {
      const conceptsRef = collection(
        db,
        'users',
        user.uid,
        'courses',
        activeCourseId,
        'concepts',
      )

      if (entryMode === 'new') {
        const name = conceptName.trim()
        if (!name) {
          setEntryError('Yeni kavram için ad gerekli.')
          setEntryBusy(false)
          return
        }
        await addDoc(conceptsRef, {
          name,
          items: [detail],
          createdAt: serverTimestamp(),
        })
        setConceptName('')
      } else {
        const selectedConcept = concepts.find(
          (concept) => concept.id === entryMode,
        )
        if (!selectedConcept) {
          setEntryError('Kavram bulunamadı.')
          setEntryBusy(false)
          return
        }
        const conceptRef = doc(
          db,
          'users',
          user.uid,
          'courses',
          activeCourseId,
          'concepts',
          entryMode,
        )
        await updateDoc(conceptRef, {
          items: arrayUnion(detail),
        })
      }
      setDetailText('')
    } catch (error) {
      setEntryError('Kayıt sırasında bir hata oluştu.')
    } finally {
      setEntryBusy(false)
    }
  }

  const startQuiz = () => {
    setQuizError('')
    if (concepts.length < 4) {
      setQuizError('Teste başlamak için en az 4 kavram eklemelisin.')
      return
    }
    if (questionPool.length === 0) {
      setQuizError('Teste başlamak için en az 1 açıklama eklemelisin.')
      return
    }

    const questions = shuffle(questionPool)
    const first = questions[0]
    setQuiz({
      questions,
      index: 0,
      selected: null,
      options: makeOptions(first, concepts),
    })
    setView('test')
  }

  const handleSelectOption = (option) => {
    if (!quiz || quiz.selected) return
    setQuiz({ ...quiz, selected: option })
  }

  const handleNextQuestion = () => {
    if (!quiz) return
    if (quiz.index + 1 >= quiz.questions.length) {
      setView('course')
      setQuiz(null)
      return
    }
    const nextIndex = quiz.index + 1
    const nextQuestion = quiz.questions[nextIndex]
    setQuiz({
      ...quiz,
      index: nextIndex,
      selected: null,
      options: makeOptions(nextQuestion, concepts),
    })
  }

  const handleExitQuiz = () => {
    setView('course')
    setQuiz(null)
  }

  const handleDeleteConcept = async (concept) => {
    if (!user || !activeCourseId) return
    const confirmed = window.confirm(
      `"${concept.name}" kavramını silmek istiyor musun? Bu işlem tüm açıklamaları da siler.`,
    )
    if (!confirmed) return

    setEntryBusy(true)
    setEntryError('')
    try {
      const conceptRef = doc(
        db,
        'users',
        user.uid,
        'courses',
        activeCourseId,
        'concepts',
        concept.id,
      )
      await deleteDoc(conceptRef)
      if (entryMode === concept.id) {
        setEntryMode('new')
      }
    } catch (error) {
      setEntryError('Kavram silinirken bir hata oluştu.')
    } finally {
      setEntryBusy(false)
    }
  }

  const handleDeleteItem = async (concept, index) => {
    if (!user || !activeCourseId) return
    const confirmed = window.confirm(
      'Bu açıklamayı silmek istiyor musun?',
    )
    if (!confirmed) return

    const nextItems = (concept.items || []).filter(
      (_, itemIndex) => itemIndex !== index,
    )
    setEntryBusy(true)
    setEntryError('')
    try {
      const conceptRef = doc(
        db,
        'users',
        user.uid,
        'courses',
        activeCourseId,
        'concepts',
        concept.id,
      )
      await updateDoc(conceptRef, {
        items: nextItems,
      })
    } catch (error) {
      setEntryError('Açıklama silinirken bir hata oluştu.')
    } finally {
      setEntryBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>{APP_NAME}</h1>
          <p className="subtitle">{APP_TAGLINE}</p>
        </div>
        <div className="header-actions">
          
          {user && (
            <>
              <div className="pill">{user.email}</div>
              <button
            type="button"
            className="btn ghost"
            onClick={() =>
              setTheme((current) => (current === 'light' ? 'dark' : 'light'))
            }
          >
            {theme === 'light' ? '⏾' : '☀︎'}
          </button>
              <button className="btn ghost" onClick={handleSignOut}>
                ➜]
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        {authLoading && (
          <section className="panel">
            <p className="muted">Oturum kontrol ediliyor...</p>
          </section>
        )}

        {!authLoading && !user && (
          <section className="panel auth-panel">
            <div className="panel-head">
              <h2>Giriş</h2>
              <p className="muted">
                Derslerini ve kavramlarını kaydetmek için hesabınla giriş yap.
              </p>
            </div>
            <form className="form" onSubmit={handleAuthSubmit}>
              <label className="field">
                <span>E-posta</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ornek@mail.com"
                  required
                />
              </label>
              <label className="field">
                <span>Şifre</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="En az 6 karakter"
                  required
                />
              </label>
              {authError && <p className="error">{authError}</p>}
              <div className="form-actions">
                <button className="btn primary" type="submit" disabled={authBusy}>
                  {authMode === 'signin' ? 'Giriş Yap' : 'Hesap Oluştur'}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setAuthError('')
                    setAuthMode(authMode === 'signin' ? 'signup' : 'signin')
                  }}
                  disabled={authBusy}
                >
                  {authMode === 'signin'
                    ? 'Hesap Oluştur'
                    : 'Zaten hesabım var'}
                </button>
              </div>
            </form>
          </section>
        )}

        {!authLoading && user && view === 'home' && (
          <section className="panel">
            <div className="panel-head split">
              <div>
                <h2>Dersler</h2>
                <p className="muted">
                  Her ders kendi kavram listesine ve test akışına sahiptir.
                </p>
              </div>
              <form className="inline-form" onSubmit={handleAddCourse}>
                <input
                  type="text"
                  value={courseName}
                  onChange={(event) => {
                    setCourseName(event.target.value)
                    if (courseError) setCourseError('')
                  }}
                  placeholder="Ders adı"
                  maxLength={80}
                />
                <button className="btn primary" type="submit">
                  Ders Ekle
                </button>
              </form>
            </div>
            {courseError && <p className="error">{courseError}</p>}
            {coursesLoading && <p className="muted">Dersler yükleniyor...</p>}
            {!coursesLoading && courses.length === 0 && (
              <div className="empty">
                <h3>Henüz ders yok</h3>
                <p>
                  İlk dersini ekleyerek kavramlarını toplamaya başlayabilirsin.
                </p>
              </div>
            )}
            <div className="course-grid">
              {courses.map((course) => (
                <button
                  className="course-card"
                  key={course.id}
                  onClick={() => handleOpenCourse(course.id)}
                >
                  <span className="course-title">{course.name}</span>
                  <span className="course-meta">Ders sayfasını aç</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {!authLoading && user && view === 'course' && activeCourse && (
          <section className="panel">
            <div className="panel-head split">
              <div>
                <button className="btn ghost" onClick={() => setView('home')}>
                  ← Derslere Dön
                </button>
                <h2>{activeCourse.name}</h2>
                <p className="muted">
                  Kavramları ve açıklamalarını ekle, ardından test moduna geç.
                </p>
              </div>
              <div className="pill">
                {concepts.length} kavram, {questionPool.length} açıklama
              </div>
            </div>

            <div className="course-layout">
              <div className="card form-card">
                <h3>Kavram ve Açıklama Ekle</h3>
                <form className="form" onSubmit={handleAddEntry}>
                  <label className="field">
                    <span>Kavram seç</span>
                    <select
                      value={entryMode}
                      onChange={(event) => setEntryMode(event.target.value)}
                    >
                      <option value="new">Yeni kavram</option>
                      {concepts.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {entryMode === 'new' && (
                    <label className="field">
                      <span>Yeni kavram adı</span>
                      <input
                        type="text"
                        value={conceptName}
                        onChange={(event) => {
                          setConceptName(event.target.value)
                          if (entryError) setEntryError('')
                        }}
                        placeholder="Yeni kavram adı"
                        maxLength={80}
                      />
                    </label>
                  )}

                  <label className="field">
                    <span>Açıklama</span>
                    <textarea
                      rows="4"
                      value={detailText}
                      onChange={(event) => {
                        setDetailText(event.target.value)
                        if (entryError) setEntryError('')
                      }}
                      placeholder="Kavramla ilgili bir açıklama ekle"
                      maxLength={240}
                    />
                  </label>

                  {entryError && <p className="error">{entryError}</p>}

                  <button className="btn primary" type="submit" disabled={entryBusy}>
                    Kaydet
                  </button>
                </form>
              </div>

              <div className="card list-card">
                <h3>Kavramlar</h3>
                {conceptsLoading && (
                  <p className="muted">Kavramlar yükleniyor...</p>
                )}
                {!conceptsLoading && concepts.length === 0 && (
                  <div className="empty">
                    <h4>Henüz kavram yok</h4>
                    <p>Sol taraftan kavram ve açıklama ekleyebilirsin.</p>
                  </div>
                )}
                <div className="concept-list">
                  {concepts.map((concept) => (
                    <div className="concept-card" key={concept.id}>
                      <div className="concept-header">
                        <div className="concept-title">{concept.name}</div>
                        <button
                          type="button"
                          className="btn ghost-danger small"
                          onClick={() => handleDeleteConcept(concept)}
                          disabled={entryBusy}
                        >
                          ✖
                        </button>
                      </div>
                      <ul className="concept-items">
                        {(concept.items || []).map((item, index) => (
                          <li className="concept-item" key={`${concept.id}-${index}`}>
                            <span className="concept-text">{item}</span>
                            <button
                              type="button"
                              className="btn ghost-danger small"
                              onClick={() => handleDeleteItem(concept, index)}
                              disabled={entryBusy}
                            >
                              ✖
                            </button>
                          </li>
                        ))}
                        {!concept.items?.length && (
                          <li className="concept-item muted concept-empty">
                            Henüz açıklama yok.
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="test-bar">
              <div>
                <h3>Test Modu</h3>
                <p className="muted">
                  Açıklamayı doğru kavramla eşleştirmek için pratik yap.
                </p>
                {quizError && <p className="error">{quizError}</p>}
              </div>
              <button className="btn primary" onClick={startQuiz}>
                Teste Başla
              </button>
            </div>
          </section>
        )}

        {!authLoading && user && view === 'test' && quiz && currentQuestion && (
          <section className="panel quiz-panel">
            <div className="panel-head split">
              <div>
                <button className="btn ghost" onClick={handleExitQuiz}>
                  ← Ders sayfasına dön
                </button>
                <h2>Pratik Modu</h2>
                <p className="muted">
                  Açıklamayı okuyup doğru kavramı seç.
                </p>
              </div>
              <div className="pill">
                Soru {quiz.index + 1} / {quiz.questions.length}
              </div>
            </div>

            <div className="card quiz-card">
              <div className="quiz-prompt">{currentQuestion.text}</div>
              <div className="options">
                {quiz.options.map((option) => {
                  const isSelected = quiz.selected === option
                  const isOptionCorrect =
                    quiz.selected && option === currentQuestion.conceptName
                  const isOptionWrong =
                    quiz.selected &&
                    option === quiz.selected &&
                    option !== currentQuestion.conceptName
                  return (
                    <button
                      key={option}
                      className={`option ${isSelected ? 'selected' : ''} ${
                        isOptionCorrect ? 'correct' : ''
                      } ${isOptionWrong ? 'wrong' : ''}`}
                      onClick={() => handleSelectOption(option)}
                      disabled={!!quiz.selected}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>

              {quiz.selected && (
                <div className={`feedback ${isCorrect ? 'ok' : 'bad'}`}>
                  {isCorrect
                    ? 'Doğru cevap!'
                    : `Yanlış cevap. Doğru: ${currentQuestion.conceptName}`}
                </div>
              )}

              <div className="quiz-actions">
                <button
                  className="btn primary"
                  onClick={handleNextQuestion}
                  disabled={!quiz.selected}
                >
                  {quiz.index + 1 === quiz.questions.length
                    ? 'Bitir'
                    : 'Sonraki'}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
