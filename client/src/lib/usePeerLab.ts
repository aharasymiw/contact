import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import {
  authenticatedSessionSchema,
  bootstrapPayloadSchema,
  callEndedEventPayloadSchema,
  callInviteEventPayloadSchema,
  callResponseEventPayloadSchema,
  callSignalEventPayloadSchema,
  connectedEventPayloadSchema,
  inviteCallResponseSchema,
  presenceUpdateEventPayloadSchema,
  respondToCallResponseSchema,
  usersPayloadSchema,
} from "../../../shared/schemas.ts";
import { apiRequest } from "./api.ts";

function createTimelineEntry({ channel = "Guide", title, detail, code }) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    channel,
    title,
    detail,
    code,
    timestamp: new Date().toLocaleTimeString(),
  };
}

function summarizeSdp(description) {
  if (!description?.sdp) {
    return "No SDP text was available.";
  }

  const lines = description.sdp.split("\n").filter(Boolean);
  const mediaSections = lines.filter((line) => line.startsWith("m="));
  return `${description.type} with ${mediaSections.length} media section(s) across ${lines.length} SDP lines.`;
}

export function usePeerLab() {
  const [session, setSession] = useState({
    loading: true,
    authenticated: false,
    currentUser: null,
  });
  const [users, setUsers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [iceServers, setIceServers] = useState([]);
  const [activeCall, setActiveCall] = useState(null);
  const [transportStatus, setTransportStatus] = useState("idle");
  const [requestError, setRequestError] = useState("");
  const [busyState, setBusyState] = useState({
    auth: false,
    call: false,
  });
  const [devices, setDevices] = useState({
    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],
  });
  const [selectedDevices, setSelectedDevices] = useState({
    audioInputId: "",
    videoInputId: "",
    audioOutputId: "",
  });
  const [micVolume, setMicVolume] = useState(1);
  const [speakerVolume, setSpeakerVolume] = useState(1);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [timeline, setTimeline] = useState([
    createTimelineEntry({
      title: "Ready to trace a WebRTC handshake",
      detail:
        "Sign in from two browser windows, then start a call to watch signaling, SDP, ICE, and media events appear live.",
      code: "const pc = new RTCPeerConnection({ iceServers });",
    }),
  ]);

  const eventSourceRef = useRef(null);
  const activeCallRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localSessionRef = useRef({
    rawStream: null,
    outboundStream: null,
    audioContext: null,
    audioGainNode: null,
  });
  const pendingRemoteCandidatesRef = useRef([]);
  const remoteStreamRef = useRef(new MediaStream());
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const outputDeviceSupported =
    typeof HTMLMediaElement !== "undefined" &&
    typeof HTMLMediaElement.prototype.setSinkId === "function";

  const appendTimeline = useEffectEvent((entry) => {
    startTransition(() => {
      setTimeline((currentTimeline) => [
        createTimelineEntry(entry),
        ...currentTimeline.slice(0, 47),
      ]);
    });
  });

  function syncActiveCall(nextCall) {
    activeCallRef.current = nextCall;
    setActiveCall(nextCall);
  }

  const updatePresence = useEffectEvent((onlineUserIds) => {
    const onlineSet = new Set(onlineUserIds);
    setUsers((currentUsers) =>
      currentUsers.map((user) => ({
        ...user,
        online: onlineSet.has(user.id),
      })),
    );
  });

  const loadDevices = useEffectEvent(async (announceChanges = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const availableDevices = await navigator.mediaDevices.enumerateDevices();

    const groupedDevices = {
      audioInputs: availableDevices.filter((device) => device.kind === "audioinput"),
      videoInputs: availableDevices.filter((device) => device.kind === "videoinput"),
      audioOutputs: availableDevices.filter((device) => device.kind === "audiooutput"),
    };

    setDevices(groupedDevices);
    setSelectedDevices((currentSelection) => ({
      audioInputId: currentSelection.audioInputId || groupedDevices.audioInputs[0]?.deviceId || "",
      videoInputId: currentSelection.videoInputId || groupedDevices.videoInputs[0]?.deviceId || "",
      audioOutputId:
        currentSelection.audioOutputId || groupedDevices.audioOutputs[0]?.deviceId || "",
    }));

    if (announceChanges) {
      appendTimeline({
        channel: "Devices",
        title: "Device inventory changed",
        detail:
          "The browser fired a devicechange event, so the app refreshed microphones, cameras, and speakers.",
        code: 'navigator.mediaDevices.addEventListener("devicechange", refreshDevices);',
      });
    }
  });

  async function hydrateSession() {
    try {
      const payload = await apiRequest("/api/bootstrap", {}, bootstrapPayloadSchema);
      setSession({
        loading: false,
        authenticated: Boolean(payload.authenticated),
        currentUser: payload.authenticated ? payload.currentUser : null,
      });
      setIceServers(payload.iceServers ?? []);
      setUsers(payload.authenticated ? payload.users : []);
      setPendingInvites(payload.authenticated ? payload.pendingInvites : []);
      setRequestError("");

      if (payload.authenticated) {
        appendTimeline({
          channel: "Auth",
          title: "Session restored from httpOnly cookie",
          detail:
            "The browser sent the session cookie automatically, Express looked it up in PostgreSQL, and the client rehydrated the signed-in state.",
          code: "app.use(attachCurrentUser);",
        });
      }
    } catch (error) {
      setSession({
        loading: false,
        authenticated: false,
        currentUser: null,
      });
      setUsers([]);
      setPendingInvites([]);
      setRequestError(error.message);
    }
  }

  function applyAuthPayload(payload) {
    setSession({
      loading: false,
      authenticated: Boolean(payload.authenticated),
      currentUser: payload.currentUser ?? null,
    });
    setIceServers(payload.iceServers ?? []);
    setUsers(payload.users ?? []);
    setPendingInvites(payload.pendingInvites ?? []);
  }

  async function register(credentials) {
    setBusyState((current) => ({ ...current, auth: true }));
    setRequestError("");

    try {
      const payload = await apiRequest(
        "/api/register",
        {
          method: "POST",
          body: credentials,
        },
        authenticatedSessionSchema,
      );

      applyAuthPayload(payload);
      appendTimeline({
        channel: "Auth",
        title: "Account created",
        detail:
          "The password was scrypt-hashed on the server, a session token was generated, and the browser received a new httpOnly cookie.",
        code: "const passwordHash = await hashPassword(password);",
      });
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setBusyState((current) => ({ ...current, auth: false }));
    }
  }

  async function login(credentials) {
    setBusyState((current) => ({ ...current, auth: true }));
    setRequestError("");

    try {
      const payload = await apiRequest(
        "/api/login",
        {
          method: "POST",
          body: credentials,
        },
        authenticatedSessionSchema,
      );

      applyAuthPayload(payload);
      appendTimeline({
        channel: "Auth",
        title: "Session authenticated",
        detail:
          "The login endpoint verified the scrypt hash, minted a fresh session token, and attached it as an httpOnly cookie.",
        code: "const isValid = await verifyPassword(password, storedHash);",
      });
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setBusyState((current) => ({ ...current, auth: false }));
    }
  }

  async function cleanupPeerSession(reason, narrate = true) {
    const peerConnection = peerConnectionRef.current;

    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onsignalingstatechange = null;
      peerConnection.close();
      peerConnectionRef.current = null;
    }

    pendingRemoteCandidatesRef.current = [];

    const localSession = localSessionRef.current;

    localSession.rawStream?.getTracks().forEach((track) => track.stop());
    localSession.outboundStream?.getTracks().forEach((track) => track.stop());

    if (localSession.audioContext) {
      await localSession.audioContext.close().catch(() => {});
    }

    localSessionRef.current = {
      rawStream: null,
      outboundStream: null,
      audioContext: null,
      audioGainNode: null,
    };

    remoteStreamRef.current = new MediaStream();

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    syncActiveCall(null);

    if (narrate) {
      appendTimeline({
        channel: "Lifecycle",
        title: "Call resources cleaned up",
        detail: reason,
        code: "pc.close(); localStream.getTracks().forEach((track) => track.stop());",
      });
    }
  }

  async function logout() {
    setBusyState((current) => ({ ...current, auth: true }));
    setRequestError("");

    try {
      await apiRequest("/api/logout", { method: "POST", body: {} });
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      await cleanupPeerSession(
        "Logging out tears down the active media pipeline and closes the peer connection.",
      );
      setUsers([]);
      setPendingInvites([]);
      setSession({
        loading: false,
        authenticated: false,
        currentUser: null,
      });
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setBusyState((current) => ({ ...current, auth: false }));
    }
  }

  async function refreshUsers() {
    if (!session.authenticated) {
      return;
    }

    try {
      const payload = await apiRequest("/api/users", {}, usersPayloadSchema);
      setUsers(payload.users ?? []);
    } catch (error) {
      setRequestError(error.message);
    }
  }

  async function sendSignal(callId, kind, payload) {
    await apiRequest(`/api/calls/${callId}/signal`, {
      method: "POST",
      body: {
        kind,
        payload,
      },
    });

    appendTimeline({
      channel: "Signaling",
      title: `${kind} relayed through Express`,
      detail:
        "The browser sent protocol metadata over HTTP, and the server fanned it out to the remote browser over SSE.",
      code: `await fetch('/api/calls/${callId}/signal', { method: 'POST' });`,
    });
  }

  function mergeRemoteTracks(tracks) {
    for (const track of tracks) {
      const alreadyPresent = remoteStreamRef.current
        .getTracks()
        .some((existingTrack) => existingTrack.id === track.id);

      if (!alreadyPresent) {
        remoteStreamRef.current.addTrack(track);
      }
    }
  }

  async function attachRemoteMediaElement() {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.volume = speakerMuted ? 0 : speakerVolume;
      await remoteVideoRef.current.play().catch(() => {});
    }
  }

  async function ensureLocalMedia() {
    if (localSessionRef.current.rawStream) {
      return localSessionRef.current;
    }

    appendTimeline({
      channel: "Media",
      title: "Requesting local devices",
      detail:
        "The browser is asking for permission to open the chosen microphone and camera for this call.",
      code: "navigator.mediaDevices.getUserMedia(constraints);",
    });

    const constraints = {
      video: selectedDevices.videoInputId
        ? { deviceId: { exact: selectedDevices.videoInputId } }
        : true,
      audio: selectedDevices.audioInputId
        ? {
            deviceId: { exact: selectedDevices.audioInputId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
    };

    const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
    const outboundStream = new MediaStream();

    rawStream.getVideoTracks().forEach((track) => outboundStream.addTrack(track));

    let audioContext = null;
    let audioGainNode = null;
    const [audioTrack] = rawStream.getAudioTracks();

    // WebRTC exposes tracks, but not a native "mic volume" property. Routing the
    // captured microphone through Web Audio lets the UI teach that distinction.
    if (audioTrack) {
      audioContext = new AudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const audioOnlyStream = new MediaStream([audioTrack]);
      const sourceNode = audioContext.createMediaStreamSource(audioOnlyStream);
      audioGainNode = audioContext.createGain();
      const destinationNode = audioContext.createMediaStreamDestination();
      sourceNode.connect(audioGainNode);
      audioGainNode.connect(destinationNode);
      audioGainNode.gain.value = micMuted ? 0 : micVolume;

      const processedAudioTrack = destinationNode.stream.getAudioTracks()[0];
      if (processedAudioTrack) {
        outboundStream.addTrack(processedAudioTrack);
      }
    }

    localSessionRef.current = {
      rawStream,
      outboundStream,
      audioContext,
      audioGainNode,
    };

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = rawStream;
      await localVideoRef.current.play().catch(() => {});
    }

    await loadDevices(false);

    appendTimeline({
      channel: "Media",
      title: "Local media is ready",
      detail:
        "The camera preview is local-only, while the outbound stream may contain a processed microphone track with a GainNode in front of it.",
      code: "sourceNode.connect(audioGainNode); audioGainNode.connect(destinationNode);",
    });

    return localSessionRef.current;
  }

  async function flushPendingIceCandidates() {
    const peerConnection = peerConnectionRef.current;

    if (!peerConnection?.remoteDescription) {
      return;
    }

    const queuedCandidates = [...pendingRemoteCandidatesRef.current];
    pendingRemoteCandidatesRef.current = [];

    for (const candidate of queuedCandidates) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      appendTimeline({
        channel: "ICE",
        title: "Queued ICE candidate applied",
        detail:
          "The candidate arrived before the remote description, so the app buffered it until the RTCPeerConnection was ready.",
        code: "await pc.addIceCandidate(new RTCIceCandidate(candidate));",
      });
    }
  }

  async function ensurePeerConnection(callDescriptor, role, peerUser) {
    if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== "closed") {
      return peerConnectionRef.current;
    }

    const localSession = await ensureLocalMedia();
    const peerConnection = new RTCPeerConnection({
      iceServers,
    });

    peerConnectionRef.current = peerConnection;
    remoteStreamRef.current = new MediaStream();
    await attachRemoteMediaElement();

    peerConnection.onicecandidate = async (event) => {
      if (!event.candidate) {
        appendTimeline({
          channel: "ICE",
          title: "Local ICE gathering reached a checkpoint",
          detail:
            "The browser has sent all candidates it knows about right now. Additional candidates can still appear on network changes.",
          code: "pc.onicecandidate = ({ candidate }) => { ... };",
        });
        return;
      }

      const candidatePayload = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;

      appendTimeline({
        channel: "ICE",
        title: "Local ICE candidate discovered",
        detail:
          "The browser found another possible network route and is relaying it through the signaling layer.",
        code: JSON.stringify(candidatePayload, null, 2),
      });

      try {
        await sendSignal(callDescriptor.id, "ice-candidate", candidatePayload);
      } catch (error) {
        setRequestError(error.message);
      }
    };

    peerConnection.ontrack = async (event) => {
      const stream = event.streams[0];

      if (stream) {
        mergeRemoteTracks(stream.getTracks());
      } else {
        mergeRemoteTracks([event.track]);
      }

      await attachRemoteMediaElement();

      appendTimeline({
        channel: "Media",
        title: "Remote media track attached",
        detail:
          "The remote browser is now sending a track across the peer connection, and the client attached it to the playback element.",
        code: "pc.ontrack = ({ streams }) => remoteVideo.srcObject = streams[0];",
      });
    };

    peerConnection.onconnectionstatechange = () => {
      const connectionState = peerConnection.connectionState;

      appendTimeline({
        channel: "Transport",
        title: `Peer connection state: ${connectionState}`,
        detail:
          "This state reflects whether ICE, DTLS, and media transport have reached a usable end-to-end connection.",
        code: `pc.connectionState === "${connectionState}"`,
      });

      if (connectionState === "connected") {
        syncActiveCall({
          ...activeCallRef.current,
          status: "connected",
        });
      }

      if (connectionState === "failed" || connectionState === "closed") {
        cleanupPeerSession(
          "The peer connection moved into a failed or closed state, so the lab cleaned up media resources automatically.",
        );
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      appendTimeline({
        channel: "ICE",
        title: `ICE state: ${peerConnection.iceConnectionState}`,
        detail:
          "ICE has its own lifecycle and often transitions faster than the aggregate peer connection state.",
        code: `pc.iceConnectionState === "${peerConnection.iceConnectionState}"`,
      });
    };

    peerConnection.onsignalingstatechange = () => {
      appendTimeline({
        channel: "SDP",
        title: `Signaling state: ${peerConnection.signalingState}`,
        detail:
          "This state shows where the offer/answer state machine currently sits: stable, have-local-offer, have-remote-offer, and so on.",
        code: `pc.signalingState === "${peerConnection.signalingState}"`,
      });
    };

    localSession.outboundStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localSession.outboundStream);
    });

    syncActiveCall({
      id: callDescriptor.id,
      role,
      peerUser,
      status: role === "caller" ? "ringing" : "awaiting-offer",
    });

    appendTimeline({
      channel: "Media",
      title: "Tracks attached to RTCPeerConnection",
      detail:
        "The local outbound stream is now part of the peer connection, which means future offers or answers will advertise those tracks.",
      code: "outboundStream.getTracks().forEach((track) => pc.addTrack(track, outboundStream));",
    });

    return peerConnection;
  }

  const startCallerNegotiation = useEffectEvent(async (callDescriptor, peerUser) => {
    const peerConnection = await ensurePeerConnection(callDescriptor, "caller", peerUser);

    syncActiveCall({
      id: callDescriptor.id,
      role: "caller",
      peerUser,
      status: "negotiating",
    });

    const offer = await peerConnection.createOffer();
    appendTimeline({
      channel: "SDP",
      title: "Caller created an SDP offer",
      detail: summarizeSdp(offer),
      code: "const offer = await pc.createOffer();",
    });

    await peerConnection.setLocalDescription(offer);
    appendTimeline({
      channel: "SDP",
      title: "Caller stored its local description",
      detail:
        "setLocalDescription() commits the offer into the RTCPeerConnection state machine so ICE and negotiation events stay coordinated.",
      code: "await pc.setLocalDescription(offer);",
    });

    await sendSignal(
      callDescriptor.id,
      "offer",
      peerConnection.localDescription.toJSON
        ? peerConnection.localDescription.toJSON()
        : peerConnection.localDescription,
    );
  });

  const handleOfferSignal = useEffectEvent(async (eventPayload) => {
    const peerConnection = await ensurePeerConnection(
      { id: eventPayload.callId },
      "callee",
      eventPayload.fromUser,
    );

    await peerConnection.setRemoteDescription(new RTCSessionDescription(eventPayload.payload));

    appendTimeline({
      channel: "SDP",
      title: "Callee applied the remote offer",
      detail:
        "The remote description tells this browser what the caller wants to send and receive, including codecs and transport fingerprints.",
      code: "await pc.setRemoteDescription(new RTCSessionDescription(offer));",
    });

    await flushPendingIceCandidates();

    const answer = await peerConnection.createAnswer();
    appendTimeline({
      channel: "SDP",
      title: "Callee created an SDP answer",
      detail: summarizeSdp(answer),
      code: "const answer = await pc.createAnswer();",
    });

    await peerConnection.setLocalDescription(answer);
    await sendSignal(
      eventPayload.callId,
      "answer",
      peerConnection.localDescription.toJSON
        ? peerConnection.localDescription.toJSON()
        : peerConnection.localDescription,
    );

    syncActiveCall({
      ...activeCallRef.current,
      status: "connecting",
    });
  });

  const handleAnswerSignal = useEffectEvent(async (eventPayload) => {
    const peerConnection = peerConnectionRef.current;

    if (!peerConnection) {
      return;
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(eventPayload.payload));

    appendTimeline({
      channel: "SDP",
      title: "Caller applied the remote answer",
      detail:
        "Offer/answer is now complete. At this point the browsers have agreed on codecs, media sections, and DTLS fingerprints.",
      code: "await pc.setRemoteDescription(answer);",
    });

    await flushPendingIceCandidates();
    syncActiveCall({
      ...activeCallRef.current,
      status: "connecting",
    });
  });

  const handleIceSignal = useEffectEvent(async (candidatePayload) => {
    const peerConnection = peerConnectionRef.current;

    if (!peerConnection?.remoteDescription) {
      pendingRemoteCandidatesRef.current.push(candidatePayload);
      appendTimeline({
        channel: "ICE",
        title: "ICE candidate queued",
        detail:
          "The candidate arrived before the remote description, so the app buffered it temporarily instead of losing it.",
        code: "pendingRemoteCandidates.push(candidate);",
      });
      return;
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(candidatePayload));
    appendTimeline({
      channel: "ICE",
      title: "Remote ICE candidate added",
      detail:
        "The browser now has another potential route to the remote peer, which improves the odds of finding a viable network path.",
      code: "await pc.addIceCandidate(new RTCIceCandidate(candidate));",
    });
  });

  async function startCall(peerUserId) {
    const peerUser = users.find((user) => user.id === peerUserId);

    if (!peerUser) {
      return;
    }

    setBusyState((current) => ({ ...current, call: true }));
    setRequestError("");

    try {
      const payload = await apiRequest(
        "/api/calls/invite",
        {
          method: "POST",
          body: {
            calleeUserId: peerUserId,
          },
        },
        inviteCallResponseSchema,
      );

      syncActiveCall({
        id: payload.call.id,
        role: "caller",
        peerUser,
        status: "ringing",
      });

      appendTimeline({
        channel: "Signaling",
        title: "Call invite created",
        detail:
          "The caller has not created an SDP offer yet. The first step is a human-level invitation so the callee can decide when to join.",
        code: 'await fetch("/api/calls/invite", { method: "POST" });',
      });
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setBusyState((current) => ({ ...current, call: false }));
    }
  }

  async function acceptInvite(invite) {
    setBusyState((current) => ({ ...current, call: true }));
    setRequestError("");

    try {
      await ensurePeerConnection(invite.call, "callee", invite.fromUser);
      const payload = await apiRequest(
        `/api/calls/${invite.call.id}/respond`,
        {
          method: "POST",
          body: {
            accept: true,
          },
        },
        respondToCallResponseSchema,
      );

      setPendingInvites((currentInvites) =>
        currentInvites.filter((currentInvite) => currentInvite.call.id !== invite.call.id),
      );

      syncActiveCall({
        id: payload.call.id,
        role: "callee",
        peerUser: invite.fromUser,
        status: "awaiting-offer",
      });

      appendTimeline({
        channel: "Signaling",
        title: "Invite accepted",
        detail:
          "The callee prepared local media and a peer connection before acknowledging the invite, which reduces race conditions when the offer arrives.",
        code: 'await fetch(`/api/calls/${callId}/respond`, { method: "POST" });',
      });
    } catch (error) {
      await cleanupPeerSession(
        "Preparing the callee side failed, so the app rolled back the partial call setup.",
        false,
      );
      setRequestError(error.message);
    } finally {
      setBusyState((current) => ({ ...current, call: false }));
    }
  }

  async function rejectInvite(invite) {
    setBusyState((current) => ({ ...current, call: true }));
    setRequestError("");

    try {
      await apiRequest(
        `/api/calls/${invite.call.id}/respond`,
        {
          method: "POST",
          body: {
            accept: false,
          },
        },
        respondToCallResponseSchema,
      );

      setPendingInvites((currentInvites) =>
        currentInvites.filter((currentInvite) => currentInvite.call.id !== invite.call.id),
      );

      appendTimeline({
        channel: "Signaling",
        title: "Invite declined",
        detail: "Rejecting the invite ends the call before any SDP or ICE traffic is exchanged.",
        code: 'status = "rejected";',
      });
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setBusyState((current) => ({ ...current, call: false }));
    }
  }

  async function endCall() {
    if (!activeCallRef.current) {
      return;
    }

    setBusyState((current) => ({ ...current, call: true }));

    try {
      await apiRequest(`/api/calls/${activeCallRef.current.id}/end`, {
        method: "POST",
        body: {},
      });
    } catch (error) {
      setRequestError(error.message);
    } finally {
      await cleanupPeerSession(
        "The call ended, so the app closed the RTCPeerConnection and released the camera and microphone.",
      );
      setBusyState((current) => ({ ...current, call: false }));
    }
  }

  async function refreshDevices(announceChanges = false) {
    await loadDevices(announceChanges);
  }

  const currentUserId = session.currentUser?.id ?? null;

  useEffect(() => {
    hydrateSession();
    refreshDevices(false);

    if (!navigator.mediaDevices?.addEventListener) {
      return undefined;
    }

    const handleDeviceChange = () => {
      refreshDevices(true);
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, []);

  useEffect(() => {
    const gainNode = localSessionRef.current.audioGainNode;

    if (!gainNode) {
      return;
    }

    gainNode.gain.value = micMuted ? 0 : micVolume;
  }, [micMuted, micVolume]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = speakerMuted ? 0 : speakerVolume;
    }
  }, [speakerMuted, speakerVolume]);

  useEffect(() => {
    const remoteVideo = remoteVideoRef.current;

    if (!remoteVideo || !selectedDevices.audioOutputId || !outputDeviceSupported) {
      return;
    }

    remoteVideo.setSinkId(selectedDevices.audioOutputId).catch((error) => {
      setRequestError(error.message);
    });
  }, [selectedDevices.audioOutputId, outputDeviceSupported]);

  useEffect(() => {
    if (!session.authenticated || !currentUserId) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setTransportStatus("idle");
      return undefined;
    }

    const source = new EventSource("/api/events");
    eventSourceRef.current = source;
    setTransportStatus("connecting");

    source.addEventListener("connected", (event) => {
      const payload = connectedEventPayloadSchema.parse(JSON.parse(event.data));
      setTransportStatus("connected");
      updatePresence(payload.onlineUserIds ?? []);
      setPendingInvites(payload.pendingInvites ?? []);

      appendTimeline({
        channel: "Transport",
        title: "SSE stream connected",
        detail:
          "The browser now has a one-way channel from the server for presence changes and signaling fan-out.",
        code: 'const source = new EventSource("/api/events");',
      });
    });

    source.addEventListener("presence-update", (event) => {
      const payload = presenceUpdateEventPayloadSchema.parse(JSON.parse(event.data));
      updatePresence(payload.onlineUserIds ?? []);
    });

    source.addEventListener("call-invite", (event) => {
      const payload = callInviteEventPayloadSchema.parse(JSON.parse(event.data));
      setPendingInvites((currentInvites) => [
        payload,
        ...currentInvites.filter((invite) => invite.call.id !== payload.call.id),
      ]);

      appendTimeline({
        channel: "Signaling",
        title: "Incoming invite received",
        detail: "The server pushed a new invite over SSE. No media negotiation has started yet.",
        code: 'source.addEventListener("call-invite", onInvite);',
      });
    });

    source.addEventListener("call-response", async (event) => {
      const payload = callResponseEventPayloadSchema.parse(JSON.parse(event.data));

      if (!payload.accepted) {
        appendTimeline({
          channel: "Signaling",
          title: "Invite declined by remote user",
          detail:
            "Because the call was rejected before offer/answer, the peer connection never needed to allocate transport state.",
          code: 'status = "rejected";',
        });

        await cleanupPeerSession("The remote user declined the call invitation.");
        return;
      }

      appendTimeline({
        channel: "Signaling",
        title: "Invite accepted by remote user",
        detail:
          "The caller can now create an SDP offer because both humans have agreed to begin negotiating.",
        code: "const offer = await pc.createOffer();",
      });

      startCallerNegotiation(payload.call, payload.fromUser).catch((error) => {
        setRequestError(error.message);
      });
    });

    source.addEventListener("call-signal", (event) => {
      const payload = callSignalEventPayloadSchema.parse(JSON.parse(event.data));

      if (payload.kind === "offer") {
        handleOfferSignal(payload).catch((error) => {
          setRequestError(error.message);
        });
        return;
      }

      if (payload.kind === "answer") {
        handleAnswerSignal(payload).catch((error) => {
          setRequestError(error.message);
        });
        return;
      }

      if (payload.kind === "ice-candidate") {
        handleIceSignal(payload.payload).catch((error) => {
          setRequestError(error.message);
        });
      }
    });

    source.addEventListener("call-ended", async (event) => {
      const payload = callEndedEventPayloadSchema.parse(JSON.parse(event.data));

      if (activeCallRef.current?.id !== payload.call.id) {
        return;
      }

      await cleanupPeerSession(
        "The remote user ended the call, so the local browser stopped media capture and closed its peer connection.",
      );
    });

    source.onerror = () => {
      setTransportStatus("reconnecting");
    };

    return () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [currentUserId, session.authenticated]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      cleanupPeerSession(
        "The page is unloading, so the live media session is being released.",
        false,
      );
    };
  }, []);

  return {
    session,
    users,
    pendingInvites,
    iceServers,
    activeCall,
    transportStatus,
    requestError,
    busyState,
    devices,
    selectedDevices,
    micVolume,
    speakerVolume,
    micMuted,
    speakerMuted,
    timeline,
    outputDeviceSupported,
    localVideoRef,
    remoteVideoRef,
    setSelectedDevices,
    setMicVolume,
    setSpeakerVolume,
    setMicMuted,
    setSpeakerMuted,
    register,
    login,
    logout,
    refreshUsers,
    loadDevices: refreshDevices,
    startCall,
    acceptInvite,
    rejectInvite,
    endCall,
  };
}
