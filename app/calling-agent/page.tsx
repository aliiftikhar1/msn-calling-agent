"use client";

import { useState, useRef, useEffect } from "react";
import Vapi from "@vapi-ai/web";
import { Mic, MicOff, Phone, PhoneOff, Activity, Clock, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";

const ASSISTANT_ID = "3015662c-9835-404d-b3b0-1dbde171cef8";
const VOICE_AGENT_PUBLIC_KEY = "d291a8c5-b555-4fe5-bef6-2d6c3e56c3e1";

type CallState = "Ready" | "Connecting" | "Live Call" | "Listening" | "Speaking" | "Call Ended" | "Error";
type LogEntry = { id: number; role: "system" | "user" | "agent" | "error"; message: string; time: string };

export default function CallingAgentPage() {
  const [callState, setCallState] = useState<CallState>("Ready");
  const [micStatus, setMicStatus] = useState<"Checking" | "Granted" | "Denied">("Checking");
  const [duration, setDuration] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [feedOpen, setFeedOpen] = useState(false); // mobile drawer toggle

  const vapiRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const logIdCounter = useRef(0);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const addLog = (role: LogEntry["role"], message: string) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { id: logIdCounter.current++, role, message, time }]);
  };

  useEffect(() => {
    const checkMic = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const res = await navigator.permissions.query({ name: "microphone" as PermissionName });
          setMicStatus(res.state === "granted" ? "Granted" : res.state === "denied" ? "Denied" : "Checking");
          res.onchange = () => {
            setMicStatus(res.state === "granted" ? "Granted" : res.state === "denied" ? "Denied" : "Checking");
          };
        } else {
          setMicStatus("Checking");
        }
      } catch {
        setMicStatus("Checking");
      }
    };
    checkMic();
    addLog("system", "Agent ready");
    window.scrollTo(0, 0);

    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
        vapiRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (callState === "Live Call" || callState === "Listening" || callState === "Speaking") {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
    // Auto-open feed on mobile when new logs arrive during a call
    if (logs.length > 1) setFeedOpen(true);
  }, [logs]);

  const startCall = async () => {
    if (micStatus === "Denied") {
      addLog("error", "Microphone access is required to start the call.");
      setCallState("Error");
      return;
    }
    try {
      setCallState("Connecting");
      setDuration(0);
      setLogs([{ id: logIdCounter.current++, role: "system", message: "Connecting call", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }]);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicStatus("Granted");
        addLog("system", "Microphone connected");
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        setMicStatus("Denied");
        addLog("error", "Microphone access is required to start the call.");
        setCallState("Error");
        return;
      }

      const vapi = new Vapi(VOICE_AGENT_PUBLIC_KEY);
      vapiRef.current = vapi;

      vapi.on("call-start", () => { setCallState("Live Call"); addLog("system", "Call started"); });
      vapi.on("call-end", () => { setCallState("Call Ended"); addLog("system", "Call ended"); vapiRef.current = null; });
      vapi.on("speech-start", () => setCallState("Speaking"));
      vapi.on("speech-end", () => setCallState("Live Call"));

      vapi.on("message", (msg: any) => {
        if (msg.type === "transcript" && msg.transcriptType === "final") {
          const role = msg.role === "assistant" ? "agent" : "user";
          addLog(role, msg.transcript);
          if (role === "agent") setCallState("Speaking");
          if (role === "user") setCallState("Listening");
        } else if (msg.type === "speech-update") {
          if (msg.status === "started" && msg.role === "assistant") setCallState("Speaking");
          if (msg.status === "stopped" && msg.role === "assistant") setCallState("Live Call");
          if (msg.status === "started" && msg.role === "user") setCallState("Listening");
        }
      });

      vapi.on("error", (e: any) => {
        setCallState("Error");
        addLog("error", `Error: ${e.message || "An unexpected error occurred"}`);
        vapiRef.current = null;
      });

      await vapi.start(ASSISTANT_ID);
    } catch (err: any) {
      setCallState("Error");
      addLog("error", `Failed to connect: ${err.message || err}`);
      vapiRef.current = null;
    }
  };

  const endCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop();
      addLog("system", "Ending call...");
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const isCallActive = callState === "Connecting" || callState === "Live Call" || callState === "Listening" || callState === "Speaking";

  const getStatusColor = () => {
    switch (callState) {
      case "Ready":
      case "Call Ended": return "text-neutral-400 bg-neutral-500/10 border-neutral-500/20";
      case "Connecting": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "Live Call": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "Speaking": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "Listening": return "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
      case "Error": return "text-red-400 bg-red-500/10 border-red-500/20";
      default: return "text-neutral-400 bg-neutral-500/10 border-neutral-500/20";
    }
  };

  const getMicColor = () =>
    micStatus === "Granted"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : micStatus === "Denied"
      ? "text-red-400 bg-red-500/10 border-red-500/20"
      : "text-neutral-400 bg-neutral-500/10 border-neutral-500/20";

  /* ─── Activity Feed (shared between desktop panel & mobile drawer) ─── */
  const ActivityFeedContent = () => (
    <div ref={logsContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {logs.length === 0 ? (
        <div className="h-full flex items-center justify-center text-neutral-600 text-sm">
          Awaiting connection...
        </div>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex gap-3">
            <div className="mt-1 flex-shrink-0">
              {log.role === "system" && <div className="w-2 h-2 rounded-full bg-neutral-500 mt-1.5" />}
              {log.role === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
              {log.role === "user" && <Mic className="w-4 h-4 text-indigo-400" />}
              {log.role === "agent" && <Phone className="w-4 h-4 text-emerald-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-0.5 gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider truncate ${
                  log.role === "system" ? "text-neutral-500" :
                  log.role === "error" ? "text-red-500" :
                  log.role === "user" ? "text-indigo-400" : "text-emerald-400"
                }`}>
                  {log.role === "agent" ? "Calling Agent" : log.role === "user" ? "Client" : log.role}
                </span>
                <span className="text-[10px] text-neutral-600 font-mono shrink-0">{log.time}</span>
              </div>
              <p className={`text-sm leading-relaxed break-words ${
                log.role === "system" ? "text-neutral-400" :
                log.role === "error" ? "text-red-400" : "text-neutral-200"
              }`}>
                {log.message}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="h-[100dvh] w-full bg-[#0A0A0A] text-neutral-100 font-sans relative overflow-hidden flex flex-col">

      {/* Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* ══════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════ */}
      <header className="relative z-10 w-full pt-3 pb-2 px-4 flex flex-col items-center justify-center text-center shrink-0">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] sm:text-xs font-medium text-neutral-400 mb-1.5 tracking-wide uppercase">
          <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400" />
          MSN Calling Agent
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white mb-0.5 sm:mb-1">
          MSN Developers
        </h1>
        {/* Hide subtitle on very small screens to save space */}
        <p className="hidden sm:block text-neutral-400 text-xs sm:text-sm max-w-lg mx-auto">
          AI-powered client qualification and sales call assistant. Secure internal calling console for MSN Developers.
        </p>
      </header>

      {/* ══════════════════════════════════════════
          MAIN — desktop: row | mobile: column
      ══════════════════════════════════════════ */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col lg:flex-row max-w-7xl mx-auto w-full px-3 sm:px-4 lg:px-8 pb-3 sm:pb-4 gap-3 sm:gap-4">

        {/* ── CALL CONTROLS PANEL ── */}
        <div className={`relative flex flex-col bg-white/[0.02] border border-white/5 rounded-2xl sm:rounded-3xl backdrop-blur-xl overflow-hidden
          transition-all duration-300
          ${feedOpen
            /* mobile: shrink to a compact strip when feed is open */
            ? "flex-none"
            /* mobile: take all available space when feed is closed */
            : "flex-1 min-h-0"
          }
          lg:flex-[1.5] lg:min-h-0`}
        >
          {/* Status row — compact on mobile, absolute on lg */}
          <div className="flex items-center justify-between px-3 sm:px-4 pt-3 sm:pt-0 lg:absolute lg:top-6 lg:left-6 lg:right-6 lg:pt-0">
            <div className="flex items-center gap-2">
              {/* Call state badge */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold border backdrop-blur-md transition-colors ${getStatusColor()}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${callState === "Error" ? "bg-red-500" : isCallActive ? "bg-current animate-pulse" : "bg-neutral-500"}`} />
                {callState}
              </div>
              {/* Mic badge */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold border backdrop-blur-md transition-colors ${getMicColor()}`}>
                {micStatus === "Granted" ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                <span className="hidden sm:inline">Mic: </span>{micStatus}
              </div>
            </div>

            {/* Timer */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 font-mono text-sm sm:text-base text-neutral-200 tracking-widest">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              {formatTime(duration)}
            </div>
          </div>

          {/* Centre: button + waveform */}
          <div className={`flex-1 min-h-0 flex flex-col items-center justify-center
            gap-4 sm:gap-6
            py-4 sm:py-6 lg:py-8
            ${feedOpen ? "py-3 sm:py-4" : ""}`}
          >
            {/* Ring container */}
            <div className="relative flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40 lg:w-52 lg:h-52 shrink-0">
              {isCallActive && (
                <>
                  <div className="absolute inset-0 rounded-full border border-blue-500/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                  <div className="absolute inset-4 rounded-full border border-indigo-500/40 animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
                  <div className="absolute inset-8 rounded-full border border-blue-400/20 animate-pulse" />
                </>
              )}

              {!isCallActive ? (
                <button
                  onClick={startCall}
                  aria-label="Start call"
                  className="relative z-10 w-20 h-20 sm:w-24 sm:h-24 lg:w-32 lg:h-32 rounded-full bg-gradient-to-b from-blue-500 to-blue-700
                    shadow-[0_0_40px_rgba(59,130,246,0.3)] hover:shadow-[0_0_60px_rgba(59,130,246,0.5)]
                    active:scale-95 hover:scale-105 transition-all duration-300
                    flex flex-col items-center justify-center gap-1.5 sm:gap-2
                    border border-blue-400/50 group touch-manipulation"
                >
                  <Phone className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white fill-current opacity-90 group-hover:opacity-100 transition-opacity" />
                  <span className="text-white font-bold text-[10px] sm:text-xs lg:text-sm tracking-wide">START</span>
                </button>
              ) : (
                <button
                  onClick={endCall}
                  aria-label="End call"
                  className="relative z-10 w-20 h-20 sm:w-24 sm:h-24 lg:w-32 lg:h-32 rounded-full bg-gradient-to-b from-red-500 to-red-700
                    shadow-[0_0_40px_rgba(239,68,68,0.3)] hover:shadow-[0_0_60px_rgba(239,68,68,0.5)]
                    active:scale-95 hover:scale-105 transition-all duration-300
                    flex flex-col items-center justify-center gap-1.5 sm:gap-2
                    border border-red-400/50 group touch-manipulation"
                >
                  <PhoneOff className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white opacity-90 group-hover:opacity-100 transition-opacity" />
                  <span className="text-white font-bold text-[10px] sm:text-xs lg:text-sm tracking-wide">END</span>
                </button>
              )}
            </div>

            {/* Waveform / status text */}
            <div className="w-40 sm:w-48 flex items-center justify-center gap-1 h-6 sm:h-8">
              {isCallActive ? (
                Array.from({ length: 13 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 sm:w-1.5 rounded-full ${callState === "Speaking" ? "bg-emerald-400" : callState === "Listening" ? "bg-indigo-400" : "bg-blue-400"}`}
                    style={{
                      height: `${Math.max(6, Math.random() * 28)}px`,
                      animation: `pulse ${0.5 + Math.random()}s ease-in-out infinite alternate`,
                    }}
                  />
                ))
              ) : (
                <div className="text-neutral-600 text-[10px] sm:text-xs font-medium tracking-widest uppercase">
                  System Ready
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            ACTIVITY FEED
            • Desktop (lg+): fixed side panel
            • Mobile: slide-up drawer pinned to bottom
        ══════════════════════════════════════════ */}

        {/* ── DESKTOP PANEL (hidden on mobile) ── */}
        <div className="hidden lg:flex flex-1 min-h-0 flex-col bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 bg-white/[0.01] shrink-0">
            <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-neutral-500" />
              Activity Feed
            </h3>
          </div>
          <ActivityFeedContent />
        </div>

        {/* ── MOBILE DRAWER (hidden on lg+) ── */}
        <div className={`lg:hidden flex flex-col bg-white/[0.03] border border-white/8 rounded-2xl backdrop-blur-xl overflow-hidden
          transition-all duration-300 ease-in-out
          ${feedOpen ? "flex-1 min-h-0" : "flex-none h-12"}`}
        >
          {/* Drawer handle / header — always visible */}
          <button
            onClick={() => setFeedOpen((v) => !v)}
            aria-label={feedOpen ? "Collapse activity feed" : "Expand activity feed"}
            className="flex items-center justify-between px-4 py-3 shrink-0 w-full touch-manipulation active:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
              <Activity className="w-3.5 h-3.5 text-neutral-500" />
              Activity Feed
              {logs.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold">
                  {logs.length}
                </span>
              )}
            </span>
            {feedOpen
              ? <ChevronDown className="w-4 h-4 text-neutral-500" />
              : <ChevronUp className="w-4 h-4 text-neutral-500" />
            }
          </button>

          {/* Feed content — only rendered when open */}
          {feedOpen && <ActivityFeedContent />}
        </div>

      </main>
    </div>
  );
}
