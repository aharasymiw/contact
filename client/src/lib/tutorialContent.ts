export interface ProtocolCard {
  eyebrow: string;
  title: string;
  summary: string;
  bullets: string[];
  snippet: string;
}

export interface ImplementationStep {
  title: string;
  detail: string;
  snippet: string;
}

export const stackTargets = [
  "Node 24.14.1 LTS",
  "Express 5.2.1",
  "PostgreSQL 18.3",
  "React 19.2.4",
  "pg 8.20.0",
  "Tailwind CSS 4.2.2",
  "Vite 8.0.3",
];

export const protocolCards: ProtocolCard[] = [
  {
    eyebrow: "Stage 01",
    title: "Signaling Is Just Coordination",
    summary:
      "WebRTC does not define how two browsers find each other. The app uses ordinary HTTP plus Server-Sent Events so you can see that signaling is an app concern, not a browser magic trick.",
    bullets: [
      "Caller sends a plain POST request to invite another user.",
      "The Express server relays responses and SDP payloads over SSE.",
      "Nothing in this stage carries video frames yet; it is only metadata exchange.",
    ],
    snippet: `await fetch('/api/calls/:callId/signal', {\n  method: 'POST',\n  body: JSON.stringify({ kind: 'offer', payload: localDescription })\n});`,
  },
  {
    eyebrow: "Stage 02",
    title: "SDP Describes The Session",
    summary:
      "Offer/answer is a negotiation document. Session Description Protocol tells each peer which codecs, tracks, and transport parameters it is willing to use.",
    bullets: [
      "The caller creates an offer with createOffer().",
      "The callee replies with createAnswer() after inspecting the offer.",
      "setLocalDescription() and setRemoteDescription() move the peer connection state machine forward.",
    ],
    snippet: `const offer = await pc.createOffer();\nawait pc.setLocalDescription(offer);\nawait pc.setRemoteDescription(remoteAnswer);`,
  },
  {
    eyebrow: "Stage 03",
    title: "ICE Finds A Viable Path",
    summary:
      "Interactive Connectivity Establishment tries host, reflexive, and relay candidates until both browsers agree on a route that can move packets.",
    bullets: [
      "Each candidate represents a possible network path.",
      "STUN helps reveal public-facing addresses.",
      "Production apps usually add TURN so the call can still work when direct paths fail.",
    ],
    snippet: `pc.onicecandidate = ({ candidate }) => {\n  if (candidate) sendCandidate(candidate.toJSON());\n};`,
  },
  {
    eyebrow: "Stage 04",
    title: "Media Tracks Are Separate From Signaling",
    summary:
      "After signaling sets up the peer connection, the audio and video packets flow peer-to-peer. The server is no longer in the media path for the happy-case demo.",
    bullets: [
      "Local tracks come from getUserMedia().",
      "Tracks are attached with addTrack().",
      "Remote tracks arrive through the ontrack event and get attached to a MediaStream for playback.",
    ],
    snippet: `const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });\nstream.getTracks().forEach((track) => pc.addTrack(track, stream));`,
  },
];

export const implementationSteps: ImplementationStep[] = [
  {
    title: "Persist users and sessions in PostgreSQL",
    detail:
      "The Express API stores registered users and hashed session tokens in PostgreSQL 18. The browser only keeps an httpOnly cookie, which means the JavaScript app cannot read it directly.",
    snippet: `insert into user_sessions (user_id, token_hash, expires_at)\nvalues ($1, $2, now() + interval '7 days');`,
  },
  {
    title: "Use SSE for inbound signaling",
    detail:
      "A single EventSource stream keeps the browser aware of online peers, incoming invites, and SDP or ICE relay events. The reverse direction stays plain POST requests.",
    snippet: `const source = new EventSource('/api/events');\nsource.addEventListener('call-signal', handleSignalEvent);`,
  },
  {
    title: "Create the peer connection only when a call is active",
    detail:
      "The app waits until a call exists before opening a RTCPeerConnection. That keeps the demo focused on one handshake at a time and makes the teaching timeline easier to follow.",
    snippet: `const pc = new RTCPeerConnection({ iceServers });\npc.addTrack(track, outboundStream);`,
  },
  {
    title: "Wrap the microphone in Web Audio for gain control",
    detail:
      "Browsers do not expose a built-in “mic volume” slider for outgoing tracks. The app creates a GainNode and pipes the captured microphone through it before attaching the processed audio track to the peer connection.",
    snippet: `const source = audioContext.createMediaStreamSource(audioOnlyStream);\nsource.connect(gainNode);\ngainNode.connect(destination);`,
  },
  {
    title: "Narrate protocol steps as they happen",
    detail:
      "Every meaningful state transition writes to the timeline so the user can connect the UI to the protocol: invite sent, offer created, local description set, ICE candidate relayed, remote track arrived, and so on.",
    snippet: `appendTimeline({\n  channel: 'ICE',\n  title: 'Candidate discovered',\n  detail: 'The browser found another possible network route.'\n});`,
  },
];

export const callFlow = [
  "Register or log in from two browser windows.",
  "Pick the microphone, camera, and speaker targets you want for the next call.",
  "Start a call from one account and accept it from the other.",
  "Watch the live timeline explain invite creation, SDP offer/answer, and ICE exchange.",
  "Change speaker or microphone volume during the call and see which browser APIs handle each control.",
];

export const glossary = [
  "SDP",
  "ICE",
  "STUN",
  "TURN",
  "MediaStream",
  "RTCPeerConnection",
  "Server-Sent Events",
  "Session Cookies",
];
