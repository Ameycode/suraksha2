import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Camera, Check, Loader2, Lock, LogIn, Mail, ShieldAlert, ShieldCheck, Sparkles, User, UserPlus } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { generateFaceEmbedding, matchFaceEmbedding, verifyGender } from '../services/faceRecognition';
import { auth, createUserWithEmailAndPassword, db, get, ref, set, signInWithEmailAndPassword } from '../services/firebase';

interface FaceAuthProps {
  onSuccess: (profile: any) => void;
}

type AuthView = 'face-scan' | 'face-login' | 'face-signup' | 'manual-login' | 'manual-signup' | 'denied';
type ScanStatus = 'idle' | 'detecting' | 'verifying' | 'matching' | 'success' | 'failed';

export const FaceAuth: React.FC<FaceAuthProps> = ({ onSuccess }) => {
  const [view, setView] = useState<AuthView>('face-scan');
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Position your face in the frame');
  const [logoError, setLogoError] = useState(false);
  const [capturedFaceData, setCapturedFaceData] = useState<string | null>(null);
  const [faceEmbedding, setFaceEmbedding] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const LOGO_SRC = "components/surakshaLogo.png";

  // Cleanup timer
  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Start camera when on face scan views OR manual signup/login (for face capture)
  useEffect(() => {
    if (view === 'face-scan' || view === 'face-login' || view === 'face-signup' || view === 'manual-signup' || view === 'manual-login') {
      startCamera();
    } else {
      stopCamera();
      clearTimer();
    }
    return () => {
      stopCamera();
      clearTimer();
    };
  }, [view]);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      setScanStatus('detecting');
      setStatusMessage('Detecting face...');

      clearTimer();
      // Auto-capture after 2 seconds
      timerRef.current = window.setTimeout(handleFaceScan, 2000);
    } catch (err) {
      setError("Camera access required for facial authentication");
      setScanStatus('failed');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    }
    return null;
  };

  const handleFaceScan = async () => {
    if (scanStatus === 'verifying' || scanStatus === 'matching') return;

    setScanStatus('verifying');
    setStatusMessage('Capturing face...');

    const base64 = captureFrame();
    if (!base64) {
      setScanStatus('detecting');
      timerRef.current = window.setTimeout(handleFaceScan, 2000);
      return;
    }

    try {
      // Step 1: Single API call - Verify gender only
      setStatusMessage('Verifying identity...');
      const genderResult = await verifyGender(base64);

      if (!genderResult.faceDetected) {
        setStatusMessage('No face detected. Please adjust position.');
        setScanStatus('detecting');
        timerRef.current = window.setTimeout(handleFaceScan, 2000);
        return;
      }

      if (!genderResult.isFemale) {
        setError("Access restricted: Suraksha is a dedicated space for women's safety.");
        setView('denied');
        stopCamera();
        return;
      }

      // Step 2: Store captured face data for reuse
      setCapturedFaceData(base64);

      // Step 3: Try to match with existing users (using simple image comparison first)
      setScanStatus('matching');
      setStatusMessage('Searching for your account...');

      const usersRef = ref(db, 'users');
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const users = snapshot.val();
        let matchFound = false;
        let matchAttempts = 0;
        const MAX_MATCH_ATTEMPTS = 3; // Only try matching against first 3 users to save API calls

        for (const uid in users) {
          const userData = users[uid];

          // Skip if no face data
          if (!userData.faceData?.embedding) continue;

          // Limit API calls - only check first few users
          if (matchAttempts >= MAX_MATCH_ATTEMPTS) {
            console.log('Max match attempts reached, proceeding to signup');
            break;
          }

          matchAttempts++;

          // Try to match using AI
          const matchResult = await matchFaceEmbedding(base64, userData.faceData.embedding);

          if (matchResult.match && matchResult.confidence >= 85) {
            // Face matched! Auto-login
            setScanStatus('success');
            setStatusMessage(`Welcome back, ${userData.name}! (${matchResult.confidence}% match)`);

            setTimeout(() => {
              localStorage.setItem('suraksha_sid', uid);
              onSuccess(userData);
            }, 1500);

            matchFound = true;
            break;
          }
        }

        if (!matchFound) {
          // No match found - new user, proceed to signup
          // Generate embedding ONCE and store it
          setScanStatus('success');
          setStatusMessage('New user detected! Generating face signature...');

          const embedding = await generateFaceEmbedding(base64);
          setFaceEmbedding(embedding);

          setTimeout(() => {
            setView('face-signup');
            setScanStatus('idle');
          }, 1500);
        }
      } else {
        // No users yet - first user signup
        setScanStatus('success');
        setStatusMessage('Welcome! Generating face signature...');

        const embedding = await generateFaceEmbedding(base64);
        setFaceEmbedding(embedding);

        setTimeout(() => {
          setView('face-signup');
          setScanStatus('idle');
        }, 1500);
      }

    } catch (err) {
      console.error("Face scan error:", err);

      // Check if it's a rate limit error
      if (err instanceof Error && err.message.includes('429')) {
        setError('API rate limit reached. Please use manual login or wait a moment.');
        setScanStatus('failed');
        // Don't retry automatically on rate limit
        return;
      }

      setStatusMessage('Scan failed. Retrying...');
      setScanStatus('detecting');
      timerRef.current = window.setTimeout(handleFaceScan, 3000);
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const userRef = ref(db, `users/${userCred.user.uid}`);
      const snapshot = await get(userRef);
      const profileData = snapshot.exists() ? snapshot.val() : {
        uid: userCred.user.uid,
        name: email.split('@')[0],
        isFemale: true,
        status: 'verified'
      };
      localStorage.setItem('suraksha_sid', userCred.user.uid);
      onSuccess(profileData);
    } catch (err: any) {
      setError("Incorrect email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleFaceSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faceEmbedding || !capturedFaceData) {
      setError("Face data missing. Please scan again.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const profileData = {
        uid: userCred.user.uid,
        name,
        email,
        verifiedAt: new Date().toISOString(),
        isFemale: true,
        status: 'verified',
        faceData: {
          embedding: faceEmbedding,
          capturedImage: capturedFaceData,
          registeredAt: new Date().toISOString(),
          confidence: 100
        }
      };
      await set(ref(db, `users/${userCred.user.uid}`), profileData);
      localStorage.setItem('suraksha_sid', userCred.user.uid);
      onSuccess(profileData);
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let faceData = null;

      // Check if we already have captured face data (from initial scan)
      if (capturedFaceData && faceEmbedding) {
        // Reuse already captured and processed face data!
        faceData = {
          embedding: faceEmbedding,
          capturedImage: capturedFaceData,
          registeredAt: new Date().toISOString(),
          confidence: 100
        };
        setStatusMessage('Using captured face data...');
      }
      // Otherwise, try to capture fresh if camera is active
      else if (stream && videoRef.current) {
        setStatusMessage('Capturing your face for registration...');
        const base64 = captureFrame();

        if (base64) {
          // Verify gender
          const genderResult = await verifyGender(base64);

          if (!genderResult.faceDetected) {
            setError("Please ensure your face is visible in the camera for registration.");
            setLoading(false);
            return;
          }

          if (!genderResult.isFemale) {
            setError("Access restricted: Suraksha is a dedicated space for women's safety.");
            setView('denied');
            setLoading(false);
            return;
          }

          // Generate face embedding
          setStatusMessage('Generating face signature...');
          const embedding = await generateFaceEmbedding(base64);

          faceData = {
            embedding: embedding,
            capturedImage: base64,
            registeredAt: new Date().toISOString(),
            confidence: 100
          };
        }
      }

      // Create account
      setStatusMessage('Creating your account...');
      const userCred = await createUserWithEmailAndPassword(auth, email, password);

      const profileData: any = {
        uid: userCred.user.uid,
        name,
        email,
        verifiedAt: new Date().toISOString(),
        isFemale: true,
        status: 'verified'
      };

      // Add face data if captured
      if (faceData) {
        profileData.faceData = faceData;
      }

      await set(ref(db, `users/${userCred.user.uid}`), profileData);
      localStorage.setItem('suraksha_sid', userCred.user.uid);
      onSuccess(profileData);
    } catch (err: any) {
      // Better error handling for rate limits
      if (err.message && err.message.includes('429')) {
        setError('API rate limit reached. Your account was not created. Please try again in a few moments.');
      } else {
        setError(err.message || "Signup failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-soft-lavender via-white to-blush-pink z-[3000] flex items-center justify-center p-4 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-20 w-64 h-64 bg-calm-teal rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-lavender-deep rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="max-w-5xl w-full relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-lavender-medium/20"
        >
          <div className="flex flex-col md:flex-row">
            {/* Left side - Camera/Visual */}
            <div className="w-full md:w-1/2 bg-gradient-to-br from-lavender-deep to-calm-teal-deep p-8 md:p-12 flex flex-col items-center justify-center relative overflow-hidden min-h-[500px]">
              {/* Logo */}
              <div className="absolute top-6 left-6">
                {!logoError ? (
                  <img
                    src={LOGO_SRC}
                    alt="Logo"
                    className="w-16 h-16 object-contain drop-shadow-lg rounded-full bg-white/10 backdrop-blur-sm p-2"
                    onError={() => setLogoError(true)}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                    <ShieldCheck size={32} className="text-white" />
                  </div>
                )}
              </div>

              {/* Camera view for face scanning */}
              {(view === 'face-scan' || view === 'face-login' || view === 'face-signup' || view === 'manual-signup' || view === 'manual-login') && (
                <div className="w-full max-w-sm">
                  <div className={`aspect-square bg-black rounded-3xl overflow-hidden relative border-4 transition-all duration-500 ${scanStatus === 'success' ? 'border-calm-teal shadow-[0_0_30px_rgba(45,212,191,0.5)]' :
                    scanStatus === 'failed' ? 'border-red-500' :
                      'border-white/30'
                    }`}>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className={`w-full h-full object-cover transition-all duration-700 ${scanStatus === 'success' ? 'scale-105' : 'opacity-80'
                        }`}
                    />

                    {/* Scan overlay */}
                    {scanStatus !== 'success' && scanStatus !== 'failed' && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-48 h-60 border-2 border-white/30 rounded-[3rem] relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-full h-full border-[60px] border-black/50"></div>
                          <motion.div
                            className="absolute w-full h-1 bg-calm-teal shadow-[0_0_15px_#2DD4BF]"
                            animate={{ top: ['0%', '100%', '0%'] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Success overlay */}
                    <AnimatePresence>
                      {scanStatus === 'success' && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-calm-teal/20 backdrop-blur-sm flex items-center justify-center"
                        >
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', duration: 0.5 }}
                            className="bg-white rounded-full p-4 shadow-xl"
                          >
                            <Check size={48} className="text-calm-teal" strokeWidth={3} />
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Status bar */}
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="bg-black/70 backdrop-blur-xl py-3 px-4 rounded-2xl border border-white/10">
                        <div className="flex items-center gap-3">
                          {scanStatus === 'verifying' || scanStatus === 'matching' ? (
                            <Loader2 size={16} className="animate-spin text-calm-teal" />
                          ) : scanStatus === 'success' ? (
                            <Check size={16} className="text-calm-teal" />
                          ) : (
                            <Sparkles size={16} className="text-calm-teal" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/50 leading-none mb-1">
                              {scanStatus === 'matching' ? 'Facial Recognition' : 'Face Analysis'}
                            </p>
                            <p className="text-xs font-bold text-white leading-none truncate">
                              {statusMessage}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              {/* Branding for manual login/signup views */}
              {(view === 'manual-login' || view === 'manual-signup') && (
                <div className="text-center text-white">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', duration: 0.6 }}
                    className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm"
                  >
                    <ShieldCheck size={48} className="text-white" />
                  </motion.div>
                  <h2 className="text-3xl font-black mb-2">Suraksha</h2>
                  <p className="text-white/80 text-sm">Women's Safety Network</p>
                </div>
              )}

              {/* Denied view */}
              {view === 'denied' && (
                <div className="text-center text-white">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', duration: 0.6 }}
                    className="w-24 h-24 bg-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border-4 border-red-500"
                  >
                    <AlertTriangle size={48} className="text-red-500" />
                  </motion.div>
                  <h2 className="text-2xl font-black mb-2">Access Denied</h2>
                  <p className="text-white/80 text-sm max-w-xs mx-auto">
                    Gender verification failed. Suraksha is exclusively for women's safety.
                  </p>
                  <button
                    onClick={() => {
                      setView('face-scan');
                      setScanStatus('idle');
                      setError(null);
                    }}
                    className="mt-6 px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-bold text-sm transition-all backdrop-blur-sm"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>

            {/* Right side - Forms */}
            <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
              <AnimatePresence mode="wait">
                {/* Initial face scan view */}
                {view === 'face-scan' && (
                  <motion.div
                    key="face-scan"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <h1 className="text-3xl font-black text-lavender-deep mb-2">Welcome</h1>
                      <p className="text-slate-500">Facial authentication for secure access</p>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-soft-lavender/30 border border-lavender-medium rounded-2xl p-4">
                        <div className="flex items-start gap-3">
                          <Camera className="text-calm-teal mt-1" size={20} />
                          <div>
                            <p className="font-bold text-sm text-slate-700 mb-1">Automatic Recognition</p>
                            <p className="text-xs text-slate-500">
                              Position your face in the camera. We'll automatically recognize you or help you sign up.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-lavender-medium"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="px-3 bg-white text-slate-400 font-bold uppercase tracking-wider">
                            Or use manual login
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setView('manual-login')}
                          className="flex items-center justify-center gap-2 py-3 bg-white border-2 border-lavender-medium rounded-xl text-lavender-deep font-bold text-sm hover:bg-soft-lavender transition-all"
                        >
                          <LogIn size={18} />
                          Login
                        </button>
                        <button
                          onClick={() => setView('manual-signup')}
                          className="flex items-center justify-center gap-2 py-3 bg-lavender-deep text-white rounded-xl font-bold text-sm hover:bg-lavender-medium transition-all"
                        >
                          <UserPlus size={18} />
                          Sign Up
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Face-based signup (after face verified) */}
                {view === 'face-signup' && (
                  <motion.div
                    key="face-signup"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <button
                      onClick={() => setView('face-scan')}
                      className="flex items-center gap-2 text-slate-400 hover:text-lavender-deep mb-4 transition-colors"
                    >
                      <ArrowLeft size={18} />
                      <span className="text-sm font-bold">Back</span>
                    </button>

                    <h1 className="text-2xl font-black text-lavender-deep mb-2">Complete Registration</h1>
                    <p className="text-slate-500 text-sm mb-6">Face verified! Just a few more details.</p>

                    <form onSubmit={handleFaceSignup} className="space-y-4">
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                        <input
                          type="text"
                          placeholder="Full Name"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all"
                        />
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                        <input
                          type="email"
                          placeholder="Email Address"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all"
                        />
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                        <input
                          type="password"
                          placeholder="Password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-lavender-deep to-calm-teal-deep text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Complete Registration'}
                      </button>
                    </form>
                  </motion.div>
                )}

                {/* Manual login */}
                {view === 'manual-login' && (
                  <motion.div
                    key="manual-login"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <button
                      onClick={() => setView('face-scan')}
                      className="flex items-center gap-2 text-slate-400 hover:text-lavender-deep mb-4 transition-colors"
                    >
                      <ArrowLeft size={18} />
                      <span className="text-sm font-bold">Back</span>
                    </button>

                    <h1 className="text-2xl font-black text-lavender-deep mb-2">Welcome Back</h1>
                    <p className="text-slate-500 text-sm mb-6">Sign in to your account</p>

                    <form onSubmit={handleManualLogin} className="space-y-4">
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                        <input
                          type="email"
                          placeholder="Email Address"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all"
                        />
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                        <input
                          type="password"
                          placeholder="Password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-lavender-deep to-calm-teal-deep text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
                      </button>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => setView('manual-signup')}
                          className="text-sm text-slate-500 hover:text-lavender-deep font-bold transition-colors"
                        >
                          Don't have an account? Sign up
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}

                {/* Manual signup */}
                {view === 'manual-signup' && (
                  <motion.div
                    key="manual-signup"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <button
                      onClick={() => setView('face-scan')}
                      className="flex items-center gap-2 text-slate-400 hover:text-lavender-deep mb-4 transition-colors"
                    >
                      <ArrowLeft size={18} />
                      <span className="text-sm font-bold">Back</span>
                    </button>

                    <h1 className="text-2xl font-black text-lavender-deep mb-2">Create Account</h1>
                    <p className="text-slate-500 text-sm mb-6">Join the Suraksha safety network</p>

                    <form onSubmit={handleManualSignup} className="space-y-4">
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                        <input
                          type="text"
                          placeholder="Full Name"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all"
                        />
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                        <input
                          type="email"
                          placeholder="Email Address"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all"
                        />
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium" size={18} />
                        <input
                          type="password"
                          placeholder="Password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-soft-lavender/30 border border-lavender-medium rounded-xl py-3.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none transition-all"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-lavender-deep to-calm-teal-deep text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Create Account'}
                      </button>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => setView('manual-login')}
                          className="text-sm text-slate-500 hover:text-lavender-deep font-bold transition-colors"
                        >
                          Already have an account? Sign in
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error message */}
              {error && view !== 'denied' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 bg-blush-pink border border-blush-medium p-3 rounded-xl flex items-start gap-3 text-blush-deep text-sm"
                >
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
