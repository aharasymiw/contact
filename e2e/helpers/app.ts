import { randomUUID } from "node:crypto";

import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

export interface E2eUser {
  username: string;
  displayName: string;
  password: string;
}

export function createE2eUser(prefix: string): E2eUser {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);

  return {
    username: `${prefix}_${suffix}`,
    displayName: `${prefix} ${suffix}`,
    password: "contact-demo-123",
  };
}

export async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WebRTC Lab" })).toBeVisible();
}

export async function registerUser(page: Page, user: E2eUser) {
  await gotoHome(page);
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Display name").fill(user.displayName);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: user.displayName })).toBeVisible();
  await expect(page.getByText(`@${user.username}`)).toBeVisible();
  await expect(page.getByText(/SSE transport status:\s*connected/i)).toBeVisible();
}

export async function loginUser(page: Page, user: E2eUser) {
  await gotoHome(page);
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("heading", { name: user.displayName })).toBeVisible();
}

export async function logoutUser(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Create two accounts to test a real handshake" }),
  ).toBeVisible();
}

export async function refreshPeerDirectory(page: Page) {
  await page.getByRole("button", { name: "Refresh users" }).click();
}

export function peerCard(page: Page, displayName: string): Locator {
  return page.locator(".user-card").filter({ hasText: displayName });
}

export function inviteCard(page: Page, displayName: string): Locator {
  return page.locator(".invite-card").filter({ hasText: displayName });
}

export function timelineEntry(page: Page, title: string): Locator {
  return page.locator(".timeline-entry").filter({ hasText: title });
}

export async function createRealtimeContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.grantPermissions(["camera", "microphone"]);
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = async function () {
      return undefined;
    };

    function storeSyntheticResource(key: string, value: unknown) {
      const existing = Reflect.get(window, key);

      if (Array.isArray(existing)) {
        existing.push(value);
        return;
      }

      Reflect.set(window, key, [value]);
    }

    function createSyntheticStream(label: string) {
      const stream = new MediaStream();
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;

      const context2d = canvas.getContext("2d");
      if (context2d) {
        context2d.fillStyle = "#123447";
        context2d.fillRect(0, 0, canvas.width, canvas.height);
        context2d.fillStyle = "#f4f0e8";
        context2d.font = "28px sans-serif";
        context2d.fillText(`conTact ${label}`, 32, 64);
        context2d.fillText(new Date().toISOString(), 32, 116);
      }

      const videoTrack = canvas.captureStream(12).getVideoTracks()[0];
      if (videoTrack) {
        stream.addTrack(videoTrack);
      }

      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.type = "sine";
      oscillator.frequency.value = 440;
      gainNode.gain.value = 0.01;
      oscillator.connect(gainNode);
      gainNode.connect(destination);
      oscillator.start();

      const audioTrack = destination.stream.getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
      }

      storeSyntheticResource("__contactE2eAudioContexts", audioContext);
      storeSyntheticResource("__contactE2eOscillators", oscillator);

      return stream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const tracks: MediaStreamTrack[] = [];

      if (constraints?.video) {
        const videoTrack = createSyntheticStream("local video").getVideoTracks()[0];
        if (videoTrack) {
          tracks.push(videoTrack);
        }
      }

      if (constraints?.audio) {
        const audioTrack = createSyntheticStream("local audio").getAudioTracks()[0];
        if (audioTrack) {
          tracks.push(audioTrack);
        }
      }

      return new MediaStream(tracks);
    };

    class FakeRTCSessionDescription {
      type: string;
      sdp: string;

      constructor(descriptionInitDict: { type?: string; sdp?: string } = {}) {
        this.type = descriptionInitDict.type ?? "offer";
        this.sdp = descriptionInitDict.sdp ?? "v=0\r\n";
      }

      toJSON() {
        return {
          type: this.type,
          sdp: this.sdp,
        };
      }
    }

    class FakeRTCIceCandidate {
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;

      constructor(
        candidateInitDict: {
          candidate?: string;
          sdpMid?: string | null;
          sdpMLineIndex?: number | null;
        } = {},
      ) {
        this.candidate =
          candidateInitDict.candidate ?? "candidate:1 1 UDP 2122252543 127.0.0.1 3478 typ host";
        this.sdpMid = candidateInitDict.sdpMid ?? "0";
        this.sdpMLineIndex = candidateInitDict.sdpMLineIndex ?? 0;
      }

      toJSON() {
        return {
          candidate: this.candidate,
          sdpMid: this.sdpMid,
          sdpMLineIndex: this.sdpMLineIndex,
        };
      }
    }

    class FakeRTCPeerConnection {
      localDescription: FakeRTCSessionDescription | null;
      remoteDescription: FakeRTCSessionDescription | null;
      connectionState: string;
      iceConnectionState: string;
      signalingState: string;
      ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null;
      onicecandidate: ((event: { candidate: FakeRTCIceCandidate | null }) => void) | null;
      onconnectionstatechange: (() => void) | null;
      oniceconnectionstatechange: (() => void) | null;
      onsignalingstatechange: (() => void) | null;
      closed: boolean;
      transportEmitted: boolean;

      constructor() {
        this.localDescription = null;
        this.remoteDescription = null;
        this.connectionState = "new";
        this.iceConnectionState = "new";
        this.signalingState = "stable";
        this.ontrack = null;
        this.onicecandidate = null;
        this.onconnectionstatechange = null;
        this.oniceconnectionstatechange = null;
        this.onsignalingstatechange = null;
        this.closed = false;
        this.transportEmitted = false;
      }

      addTrack(track: MediaStreamTrack) {
        return { track };
      }

      async createOffer() {
        return new FakeRTCSessionDescription({
          type: "offer",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
        });
      }

      async createAnswer() {
        return new FakeRTCSessionDescription({
          type: "answer",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
        });
      }

      async setLocalDescription(
        description: FakeRTCSessionDescription | { type?: string; sdp?: string },
      ) {
        this.localDescription =
          description instanceof FakeRTCSessionDescription
            ? description
            : new FakeRTCSessionDescription(description);
        this.signalingState =
          this.localDescription.type === "offer" ? "have-local-offer" : "stable";
        this.onsignalingstatechange?.();

        queueMicrotask(() => {
          this.onicecandidate?.({
            candidate: new FakeRTCIceCandidate(),
          });
          this.onicecandidate?.({
            candidate: null,
          });
        });

        if (this.localDescription.type === "answer") {
          this.emitTransportEvents();
        }
      }

      async setRemoteDescription(
        description: FakeRTCSessionDescription | { type?: string; sdp?: string },
      ) {
        this.remoteDescription =
          description instanceof FakeRTCSessionDescription
            ? description
            : new FakeRTCSessionDescription(description);
        this.signalingState =
          this.remoteDescription.type === "offer" ? "have-remote-offer" : "stable";
        this.onsignalingstatechange?.();

        if (this.remoteDescription.type === "answer") {
          this.emitTransportEvents();
        }
      }

      async addIceCandidate() {
        this.iceConnectionState = "checking";
        this.oniceconnectionstatechange?.();
      }

      close() {
        this.closed = true;
        this.connectionState = "closed";
        this.iceConnectionState = "closed";
        this.oniceconnectionstatechange?.();
        this.onconnectionstatechange?.();
      }

      emitTransportEvents() {
        if (this.transportEmitted || this.closed) {
          return;
        }

        this.transportEmitted = true;
        this.connectionState = "connecting";
        this.iceConnectionState = "checking";
        this.oniceconnectionstatechange?.();
        this.onconnectionstatechange?.();

        const remoteStream = createSyntheticStream("remote");
        const [remoteTrack] = remoteStream.getTracks();
        if (remoteTrack) {
          queueMicrotask(() => {
            this.ontrack?.({
              streams: [remoteStream],
              track: remoteTrack,
            });
          });
        }

        setTimeout(() => {
          if (this.closed) {
            return;
          }

          this.connectionState = "connected";
          this.iceConnectionState = "connected";
          this.oniceconnectionstatechange?.();
          this.onconnectionstatechange?.();
        }, 50);
      }
    }

    Reflect.set(window, "RTCPeerConnection", FakeRTCPeerConnection);
    Reflect.set(window, "RTCSessionDescription", FakeRTCSessionDescription);
    Reflect.set(window, "RTCIceCandidate", FakeRTCIceCandidate);
  });

  return context;
}
