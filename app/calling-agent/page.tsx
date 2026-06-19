"use client";

import { useState, useRef, useEffect } from "react";
import Vapi from "@vapi-ai/web";
import { Mic, MicOff, Phone, PhoneOff, Activity, Clock, AlertCircle } from "lucide-react";

const ASSISTANT_ID = "3015662c-9835-404d-b3b0-1dbde171cef8";
const VOICE_AGENT_PUBLIC_KEY = "d291a8c5-b555-4fe5-bef6-2d6c3e56c3e1";

type CallState = "Ready" | "Connecting" | "Live Call" | "Listening" | "Speaking" | "Call Ended" | "Error";
type LogEntry = { id: number; role: "system" | "user" | "agent" | "error"; message: string; time: string };

export default function CallingAgentPage() {
  const [callState, setCallState] = useState<CallState>("Ready");
  const [micStatus, setMicStatus] = useState<"Checking" | "Granted" | "Denied">("Checking");
  const [duration, setDuration] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const vapiRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const logIdCounter = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (role: LogEntry["role"], message: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [...prev, { id: logIdCounter.current++, role, message, time }]);
  };

  useEffect(() => {
    // Check microphone permission
    const checkMic = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const res = await navigator.permissions.query({ name: "microphone" as PermissionName });
          setMicStatus(res.state === "granted" ? "Granted" : res.state === "denied" ? "Denied" : "Checking");
          res.onchange = () => {
            setMicStatus(res.state === "granted" ? "Granted" : res.state === "denied" ? "Denied" : "Checking");
          };
        } else {
          setMicStatus("Checking"); // Fallback if query not supported
        }
      } catch (e) {
        setMicStatus("Checking");
      }
    };
    checkMic();
    addLog("system", "Agent ready");

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
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
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
      setLogs([{ id: logIdCounter.current++, role: "system", message: "Connecting call", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);

      // Request mic permission actively if not granted yet
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicStatus("Granted");
        addLog("system", "Microphone connected");
        // We stop the stream right away, the SDK will request its own.
        // This was just to ensure permission is granted before proceeding.
        stream.getTracks().forEach(track => track.stop());
      } catch (micErr) {
        setMicStatus("Denied");
        addLog("error", "Microphone access is required to start the call.");
        setCallState("Error");
        return;
      }

      const vapi = new Vapi(VOICE_AGENT_PUBLIC_KEY);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setCallState("Live Call");
        addLog("system", "Call started");
      });

      vapi.on("call-end", () => {
        setCallState("Call Ended");
        addLog("system", "Call ended");
        vapiRef.current = null;
      });

      vapi.on("speech-start", () => {
        // SDK doesn't always specify who started speaking easily in this event,
        // but typically we can assume agent is speaking if not user.
        // We'll set state to Speaking/Listening based on message events usually, but for UI feedback:
        setCallState("Speaking"); 
      });

      vapi.on("speech-end", () => {
        setCallState("Live Call");
      });

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

  // Dynamic Styles
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

  return (
    <div className="h-screen w-screen bg-[#0A0A0A] text-neutral-100 font-sans relative overflow-hidden flex flex-col">
      {/* Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 w-full p-4 lg:p-6 flex flex-col items-center justify-center text-center shrink-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-neutral-400 mb-4 tracking-wide uppercase">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          MSN Calling Agent
        </div>
        <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-500 mb-3">
          MSN Developers
        </h1>
        <p className="text-neutral-400 text-sm md:text-base max-w-lg mx-auto">
          AI-powered client qualification and sales call assistant. Secure internal calling console for MSN Developers.
        </p>
      </header>

      {/* Main Content Layout */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col lg:flex-row max-w-7xl mx-auto w-full px-4 lg:px-8 pb-6 gap-6">
        
        {/* Left/Center Stage: Call Controls */}
        <div className="flex-[1.5] min-h-0 flex flex-col items-center justify-center p-4 lg:p-8 bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-xl relative">
          
          <div className="absolute top-6 left-6 flex flex-col gap-3">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md transition-colors ${getStatusColor()}`}>
              <div className={`w-2 h-2 rounded-full ${callState === 'Error' ? 'bg-red-500' : isCallActive ? 'bg-current animate-pulse' : 'bg-neutral-500'}`} />
              {callState}
            </div>
            
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md transition-colors ${
              micStatus === "Granted" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
              micStatus === "Denied" ? "text-red-400 bg-red-500/10 border-red-500/20" :
              "text-neutral-400 bg-neutral-500/10 border-neutral-500/20"
            }`}>
              {micStatus === "Granted" ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              Mic: {micStatus}
            </div>
          </div>

          <div className="absolute top-6 right-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 font-mono text-xl text-neutral-200 tracking-wider">
              <Clock className="w-4 h-4 text-neutral-400" />
              {formatTime(duration)}
            </div>
          </div>

          {/* Central Control Button */}
          <div className="relative mt-12 flex flex-col items-center justify-center h-64 w-64">
            
            {/* Animated Rings when active */}
            {isCallActive && (
              <>
                <div className="absolute inset-0 rounded-full border border-blue-500/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                <div className="absolute inset-4 rounded-full border border-indigo-500/40 animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
                <div className="absolute inset-8 rounded-full border border-blue-400/20 animate-pulse" />
              </>
            )}

            {/* Main Button */}
            {!isCallActive ? (
              <button
                onClick={startCall}
                disabled={callState === "Connecting"}
                className="relative z-10 w-32 h-32 rounded-full bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_0_40px_rgba(59,130,246,0.3)] hover:shadow-[0_0_60px_rgba(59,130,246,0.5)] hover:scale-105 transition-all duration-300 flex flex-col items-center justify-center gap-2 border border-blue-400/50 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <Phone className="w-10 h-10 text-white fill-current opacity-90 group-hover:opacity-100 transition-opacity" />
                <span className="text-white font-bold text-sm tracking-wide">START</span>
              </button>
            ) : (
              <button
                onClick={endCall}
                className="relative z-10 w-32 h-32 rounded-full bg-gradient-to-b from-red-500 to-red-700 shadow-[0_0_40px_rgba(239,68,68,0.3)] hover:shadow-[0_0_60px_rgba(239,68,68,0.5)] hover:scale-105 transition-all duration-300 flex flex-col items-center justify-center gap-2 border border-red-400/50 group"
              >
                <PhoneOff className="w-10 h-10 text-white opacity-90 group-hover:opacity-100 transition-opacity" />
                <span className="text-white font-bold text-sm tracking-wide">END</span>
              </button>
            )}
            
            {/* Waveform Visualization (Simulated) */}
            <div className="absolute -bottom-16 w-full flex items-center justify-center gap-1 h-12">
              {isCallActive ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-1.5 rounded-full ${callState === 'Speaking' ? 'bg-emerald-400' : callState === 'Listening' ? 'bg-indigo-400' : 'bg-blue-400'}`}
                    style={{
                      height: `${Math.max(10, Math.random() * 40)}px`,
                      animation: `pulse ${0.5 + Math.random()}s ease-in-out infinite alternate`
                    }}
                  />
                ))
              ) : (
                <div className="text-neutral-600 text-xs font-medium tracking-widest uppercase">System Ready</div>
              )}
            </div>

          </div>
        </div>

        {/* Right Stage: Activity Feed */}
        <div className="flex-1 min-h-0 flex flex-col bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-white/5 bg-white/[0.01]">
            <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-neutral-500" />
              Activity Feed
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-600 text-sm">
                Awaiting connection...
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex gap-3">
                  <div className="mt-1 flex-shrink-0">
                    {log.role === 'system' && <div className="w-2 h-2 rounded-full bg-neutral-500 mt-1.5" />}
                    {log.role === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                    {log.role === 'user' && <Mic className="w-4 h-4 text-indigo-400" />}
                    {log.role === 'agent' && <Phone className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        log.role === 'system' ? 'text-neutral-500' :
                        log.role === 'error' ? 'text-red-500' :
                        log.role === 'user' ? 'text-indigo-400' :
                        'text-emerald-400'
                      }`}>
                        {log.role === 'agent' ? 'Calling Agent' : log.role === 'user' ? 'Client' : log.role}
                      </span>
                      <span className="text-[10px] text-neutral-600 font-mono">{log.time}</span>
                    </div>
                    <p className={`text-sm leading-relaxed ${
                      log.role === 'system' ? 'text-neutral-400' :
                      log.role === 'error' ? 'text-red-400' :
                      'text-neutral-200'
                    }`}>
                      {log.message}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

      </main>
    </div>
  );
}
