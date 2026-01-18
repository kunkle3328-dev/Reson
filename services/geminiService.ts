
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { Source, ChatMessage, Reflection, DiscoveryResult, Notebook, Hypothesis, TimelineEvent, SynthesisResult, AudioOverview, AudioSegment, VoiceRole } from "../types";

export class GeminiService {
  private activeSession: any = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private scheduledTime: number = 0;
  private activeAudioSources: Set<AudioBufferSourceNode> = new Set();

  constructor() {}

  private getAi() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async discoverSources(topic: string): Promise<DiscoveryResult[]> {
    const ai = this.getAi();
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Improved prompt for freshness: Explicitly asking for 90-day window and using search operators logic
    const prompt = `Target Topic: "${topic}"
Current Reference Date: ${currentDate}

TASK: Identify 6-10 high-signal intelligence artifacts (news, reports, or data) specifically published within the last 3 months (90 days). 
CRITICAL: Exclude any information older than 3 months. Use your Google Search tool to find RECENT results only. 
Grounding is mandatory for every single result.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }]
      }
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return chunks
      .filter(chunk => chunk.web)
      .map((chunk) => ({
        title: chunk.web?.title || "Knowledge Artifact",
        url: chunk.web?.uri || "",
        snippet: response.text?.substring(0, 500) || "Grounded datastream unit.",
        relevance: "Verified Grounded Source (Recent)"
      }))
      .filter(r => r.url);
  }

  async runFullSynthesis(sources: Source[]): Promise<SynthesisResult> {
    if (!sources || sources.length === 0) {
      throw new Error("Synthesis blocked: No sources indexed.");
    }
    
    const ai = this.getAi();
    const context = sources.map(s => `[${s.title}] Source Type: ${s.type}. Content: ${s.content}`).join("\n\n---\n\n");
    
    // Drastically expanded prompt for long-form content
    const prompt = `Perform an exhaustive, high-fidelity intelligence synthesis using the provided research context. 
    
    TASK 1: LONG-FORM INTELLIGENCE ASSESSMENT (Markdown Briefing)
    Generate a massive, comprehensive, multi-section intelligence report. 
    - This report must be at least 1500-2000 words.
    - Structure:
        1. Executive Summary: High-level overview.
        2. Detailed Analysis: Deep dive into every core theme discovered.
        3. Key Technical Developments: Exhaustive breakdown of progress.
        4. Strategic Implications: Long-term impact on the industry/field.
        5. Future Trajectories: Data-driven predictions.
        6. Challenges & Risks: Comprehensive identification of hurdles.
    - USE SUBSTANTIAL DETAIL. Do not be brief. Expand on every point.

    TASK 2: SPOKEN PODCAST SCRIPT
    Generate a spoken multi-voice podcast script.
    - Assign voice roles per segment: "narrator" (main storyline) or "analyst" (deep dive implications).
    - Strictly use ONLY "narrator" or "analyst" as voice roles.
    - Use clear transitions and natural spoken phrasing.

    TASK 3: METADATA
    Produce reflections, hypotheses, and a timeline.

    Structure the final output as JSON with:
    1. briefing: The massive long-form Markdown report.
    2. reflections: 4-6 meta-cognitive insights.
    3. hypotheses: 3-5 pattern predictions with confidence levels.
    4. timeline: 6-10 chronological evolution events.
    5. audioOverview: { segments: [{id, text, voice, chapterId}], chapters: [{id, title, startTime, summary}], durationEstimate: string }
    
    Context:
    ${context}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            briefing: { type: Type.STRING, description: "A massive, extremely detailed, multi-section Markdown intelligence report." },
            reflections: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, title: { type: Type.STRING }, content: { type: Type.STRING } }, required: ["type", "title", "content"] } },
            hypotheses: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { statement: { type: Type.STRING }, confidence: { type: Type.NUMBER }, status: { type: Type.STRING } }, required: ["statement", "confidence", "status"] } },
            timeline: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { timestamp: { type: Type.NUMBER }, dateString: { type: Type.STRING }, label: { type: Type.STRING }, summary: { type: Type.STRING } }, required: ["timestamp", "dateString", "label", "summary"] } },
            audioOverview: {
              type: Type.OBJECT,
              properties: {
                segments: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, text: { type: Type.STRING }, voice: { type: Type.STRING }, chapterId: { type: Type.STRING } }, required: ["id", "text", "voice", "chapterId"] } },
                chapters: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, title: { type: Type.STRING }, startTime: { type: Type.NUMBER }, summary: { type: Type.STRING } }, required: ["id", "title", "startTime", "summary"] } },
                durationEstimate: { type: Type.STRING }
              },
              required: ["segments", "chapters", "durationEstimate"]
            }
          },
          required: ["briefing", "reflections", "hypotheses", "timeline", "audioOverview"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  }

  async speakMultiVoiceSegments(segments: AudioSegment[]) {
    if (!segments || segments.length === 0) return;
    
    const ai = this.getAi();
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.scheduledTime = this.outputAudioContext.currentTime;

    const validSegments = segments.filter(s => s.voice === 'narrator' || s.voice === 'analyst');
    const script = validSegments.map(s => `${s.voice.toUpperCase()}: ${s.text}`).join("\n\n");
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Synthesize this research briefing podcast script into audio using the assigned voices:\n\n${script}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { 
                speaker: 'NARRATOR', 
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } 
              },
              { 
                speaker: 'ANALYST', 
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } 
              }
            ]
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const bytes = this.decode(base64Audio);
      const buffer = await this.decodeAudioData(bytes, this.outputAudioContext, 24000, 1);
      this.playBuffered(buffer);
    }
  }

  async connectLive(sources: Source[], onMessage: (msg: LiveServerMessage) => void) {
    const ai = this.getAi();
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.scheduledTime = this.outputAudioContext.currentTime;
    
    const context = sources.slice(0, 10).map(s => `[${s.title}] ${s.content.substring(0, 1000)}`).join("\n");

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          if (!this.micStream || !this.inputAudioContext) return;
          const source = this.inputAudioContext.createMediaStreamSource(this.micStream);
          const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const pcmBlob = this.createBlob(e.inputBuffer.getChannelData(0));
            sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(this.inputAudioContext.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.interrupted) {
            this.activeAudioSources.forEach(s => { try { s.stop(); } catch(e) {} });
            this.activeAudioSources.clear();
            this.scheduledTime = this.outputAudioContext?.currentTime || 0;
          }
          const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio && this.outputAudioContext) {
            const buffer = await this.decodeAudioData(this.decode(base64Audio), this.outputAudioContext, 24000, 1);
            this.playBuffered(buffer);
          }
          onMessage(message);
        },
        onclose: () => this.stopLive()
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        systemInstruction: `You are Reson, an expert research analyst. You are currently in a live follow-up session for an intelligence briefing. 
        Respond conversationally, helpfully, and analytically based on this context:
        ${context}`
      }
    });
    this.activeSession = sessionPromise;
  }

  private playBuffered(buffer: AudioBuffer) {
    if (!this.outputAudioContext) return;
    const source = this.outputAudioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputAudioContext.destination);
    this.scheduledTime = Math.max(this.scheduledTime, this.outputAudioContext.currentTime);
    source.start(this.scheduledTime);
    this.scheduledTime += buffer.duration;
    this.activeAudioSources.add(source);
    source.onended = () => this.activeAudioSources.delete(source);
  }

  private createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
    return { data: this.encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  private encode(bytes: Uint8Array) {
    let b = '';
    for (let i = 0; i < bytes.byteLength; i++) b += String.fromCharCode(bytes[i]);
    return btoa(b);
  }

  async stopLive() { 
    if (this.activeSession) { try { (await this.activeSession).close(); } catch(e){} this.activeSession = null; }
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
    this.activeAudioSources.forEach(s => { try { s.stop(); } catch(e){} });
    this.activeAudioSources.clear();
    if (this.inputAudioContext) { this.inputAudioContext.close(); this.inputAudioContext = null; }
    if (this.outputAudioContext) { this.outputAudioContext.close(); this.outputAudioContext = null; }
  }

  async groundedChat(query: string, sources: Source[]): Promise<{ text: string }> {
    const ai = this.getAi();
    const context = sources.slice(0, 15).map(s => `[${s.title}] ${s.content.substring(0, 2000)}`).join("\n");
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: query,
      config: { systemInstruction: `Grounded analyst chat. Use this research context:\n${context}` }
    });
    return { text: response.text || "" };
  }

  decode(b64: string): Uint8Array {
    const s = atob(b64);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const int16 = new Int16Array(data.buffer);
    const frames = int16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frames, sampleRate);
    for (let c = 0; c < numChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < frames; i++) d[i] = int16[i * numChannels + c] / 32768.0;
    }
    return buffer;
  }
}

export const geminiService = new GeminiService();
