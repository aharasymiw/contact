import React, { useState } from "react";

import {
  callFlow,
  glossary,
  implementationSteps,
  protocolCards,
  stackTargets,
} from "./lib/tutorialContent.js";
import { usePeerLab } from "./lib/usePeerLab.js";

function SectionTitle({ eyebrow, title, body }) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function AuthPanel({ busy, onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
  });
  const [registerForm, setRegisterForm] = useState({
    username: "",
    displayName: "",
    password: "",
  });

  function updateLogin(field, value) {
    setLoginForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateRegister(field, value) {
    setRegisterForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <div className="panel auth-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Access The Lab</p>
          <h3>Create two accounts to test a real handshake</h3>
        </div>

        <div className="segmented-control">
          <button
            type="button"
            className={mode === "login" ? "is-active" : ""}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "register" ? "is-active" : ""}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>
      </div>

      {mode === "login" ? (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(loginForm);
          }}
        >
          <label>
            <span>Username</span>
            <input
              value={loginForm.username}
              onChange={(event) => updateLogin("username", event.target.value)}
              placeholder="alice_signal"
              autoComplete="username"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              value={loginForm.password}
              onChange={(event) => updateLogin("password", event.target.value)}
              type="password"
              placeholder="At least 8 characters"
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Signing in..." : "Log in"}
          </button>
        </form>
      ) : (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onRegister(registerForm);
          }}
        >
          <label>
            <span>Username</span>
            <input
              value={registerForm.username}
              onChange={(event) => updateRegister("username", event.target.value)}
              placeholder="alice_signal"
              autoComplete="username"
            />
          </label>
          <label>
            <span>Display name</span>
            <input
              value={registerForm.displayName}
              onChange={(event) => updateRegister("displayName", event.target.value)}
              placeholder="Alice Signal"
              autoComplete="name"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              value={registerForm.password}
              onChange={(event) => updateRegister("password", event.target.value)}
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Creating account..." : "Create account"}
          </button>
        </form>
      )}
    </div>
  );
}

function DeviceSelector({ label, options, value, onChange, disabled }) {
  return (
    <label className="device-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.length === 0 ? (
          <option value="">No device detected</option>
        ) : (
          options.map((option, index) => (
            <option key={option.deviceId || `${label}-${index}`} value={option.deviceId}>
              {option.label || `${label} ${index + 1}`}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

function UserCard({ user, disabled, onCall }) {
  return (
    <article className="user-card">
      <div>
        <div className="user-heading">
          <strong>{user.displayName}</strong>
          <span className={`presence-dot ${user.online ? "is-online" : "is-offline"}`} />
        </div>
        <p>@{user.username}</p>
      </div>

      <button type="button" className="secondary-button" disabled={disabled} onClick={onCall}>
        {user.online ? "Call user" : "Invite anyway"}
      </button>
    </article>
  );
}

function InviteCard({ invite, disabled, onAccept, onReject }) {
  return (
    <article className="invite-card">
      <div>
        <p className="eyebrow">Incoming Call</p>
        <h4>{invite.fromUser.displayName}</h4>
        <p>@{invite.fromUser.username} wants to start a WebRTC session.</p>
      </div>

      <div className="invite-actions">
        <button type="button" className="primary-button" disabled={disabled} onClick={onAccept}>
          Accept
        </button>
        <button type="button" className="ghost-button" disabled={disabled} onClick={onReject}>
          Decline
        </button>
      </div>
    </article>
  );
}

function App() {
  const {
    session,
    users,
    pendingInvites,
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
    loadDevices,
    startCall,
    acceptInvite,
    rejectInvite,
    endCall,
  } = usePeerLab();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">conTact</p>
          <h1>WebRTC Lab</h1>
        </div>

        <nav className="topnav">
          <a href="#protocol">Protocol</a>
          <a href="#guide">Implementation Guide</a>
          <a href="#lab">Live Lab</a>
        </nav>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Design + build brief fulfilled in code</p>
            <h2>
              Learn how WebRTC negotiates, connects, and streams by watching each protocol step
              unfold in real time.
            </h2>
            <p className="lead">
              The app teaches signaling, SDP, ICE, and media routing while also letting two
              authenticated users call each other with chosen camera, microphone, and speaker
              devices.
            </p>

            <div className="stack-badges">
              {stackTargets.map((target) => (
                <span key={target} className="stack-badge">
                  {target}
                </span>
              ))}
            </div>
          </div>

          <aside className="hero-panel">
            <div className="status-grid">
              <div className="stat-card">
                <span className="stat-label">Session</span>
                <strong>
                  {session.loading
                    ? "Loading"
                    : session.authenticated
                      ? `Signed in as ${session.currentUser.displayName}`
                      : "Anonymous"}
                </strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Realtime stream</span>
                <strong>{transportStatus}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Call state</span>
                <strong>{activeCall?.status ?? "Idle"}</strong>
              </div>
            </div>

            <div className="signal-rail">
              {callFlow.map((step) => (
                <div key={step} className="signal-step">
                  {step}
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section id="protocol" className="content-section">
          <SectionTitle
            eyebrow="Protocol Anatomy"
            title="What the browser and server are each responsible for"
            body="These cards map the exact responsibilities in this demo so the code and the explanation stay aligned."
          />

          <div className="card-grid">
            {protocolCards.map((card) => (
              <article key={card.title} className="panel protocol-card">
                <p className="eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <p>{card.summary}</p>
                <ul>
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <pre>
                  <code>{card.snippet}</code>
                </pre>
              </article>
            ))}
          </div>

          <div className="glossary-row">
            {glossary.map((term) => (
              <span key={term} className="glossary-pill">
                {term}
              </span>
            ))}
          </div>
        </section>

        <section id="guide" className="content-section">
          <SectionTitle
            eyebrow="Implementation Guide"
            title="How to build WebRTC in React + Node without WebRTC helper packages"
            body="The guide below mirrors the live app: persistence in PostgreSQL, signaling in Express, peer logic in React, and deep code comments where the lifecycle gets subtle."
          />

          <div className="guide-grid">
            {implementationSteps.map((step) => (
              <article key={step.title} className="panel guide-card">
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
                <pre>
                  <code>{step.snippet}</code>
                </pre>
              </article>
            ))}
          </div>
        </section>

        <section id="lab" className="content-section lab-section">
          <SectionTitle
            eyebrow="Live Lab"
            title="Pick devices, call another user, and watch the protocol timeline"
            body="This is the hands-on area. Use two browser windows so both users can authenticate and exchange a real offer, answer, and ICE candidates."
          />

          {requestError ? (
            <div className="error-banner">
              <strong>Heads up:</strong> {requestError}
            </div>
          ) : null}

          <div className="lab-layout">
            <div className="lab-column">
              {session.authenticated ? (
                <div className="panel account-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Signed In</p>
                      <h3>{session.currentUser.displayName}</h3>
                      <p>@{session.currentUser.username}</p>
                    </div>

                    <div className="inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => refreshUsers()}
                      >
                        Refresh users
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyState.auth}
                        onClick={() => logout()}
                      >
                        Log out
                      </button>
                    </div>
                  </div>

                  <p className="transport-note">
                    SSE transport status: <strong>{transportStatus}</strong>
                  </p>
                </div>
              ) : (
                <AuthPanel busy={busyState.auth} onLogin={login} onRegister={register} />
              )}

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Per-Call Devices</p>
                    <h3>Choose capture and playback targets</h3>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => loadDevices(true)}
                  >
                    Refresh devices
                  </button>
                </div>

                <div className="device-grid">
                  <DeviceSelector
                    label="Microphone"
                    options={devices.audioInputs}
                    value={selectedDevices.audioInputId}
                    onChange={(value) =>
                      setSelectedDevices((current) => ({
                        ...current,
                        audioInputId: value,
                      }))
                    }
                    disabled={busyState.call}
                  />
                  <DeviceSelector
                    label="Camera"
                    options={devices.videoInputs}
                    value={selectedDevices.videoInputId}
                    onChange={(value) =>
                      setSelectedDevices((current) => ({
                        ...current,
                        videoInputId: value,
                      }))
                    }
                    disabled={busyState.call}
                  />
                  <DeviceSelector
                    label="Speaker"
                    options={devices.audioOutputs}
                    value={selectedDevices.audioOutputId}
                    onChange={(value) =>
                      setSelectedDevices((current) => ({
                        ...current,
                        audioOutputId: value,
                      }))
                    }
                    disabled={busyState.call || !outputDeviceSupported}
                  />
                </div>

                <div className="support-note">
                  {outputDeviceSupported
                    ? "Speaker device switching is supported in this browser."
                    : "This browser does not expose setSinkId(), so the speaker chooser is display-only."}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Peer Directory</p>
                    <h3>Call another signed-in user</h3>
                  </div>
                </div>

                <div className="user-list">
                  {session.authenticated && users.length > 0 ? (
                    users.map((user) => (
                      <UserCard
                        key={user.id}
                        user={user}
                        disabled={busyState.call || Boolean(activeCall)}
                        onCall={() => startCall(user.id)}
                      />
                    ))
                  ) : (
                    <p className="empty-state">
                      {session.authenticated
                        ? "Create another account in a second browser window to see peers here."
                        : "Sign in to unlock the peer directory."}
                    </p>
                  )}
                </div>
              </div>

              {pendingInvites.length > 0 ? (
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Incoming Invites</p>
                      <h3>Answer a pending call</h3>
                    </div>
                  </div>

                  <div className="invite-list">
                    {pendingInvites.map((invite) => (
                      <InviteCard
                        key={invite.call.id}
                        invite={invite}
                        disabled={busyState.call || Boolean(activeCall)}
                        onAccept={() => acceptInvite(invite)}
                        onReject={() => rejectInvite(invite)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="lab-column lab-column-wide">
              <div className="panel stage-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Call Stage</p>
                    <h3>
                      {activeCall
                        ? `${activeCall.peerUser?.displayName ?? "Peer"} · ${activeCall.status}`
                        : "No active call"}
                    </h3>
                  </div>

                  {activeCall ? (
                    <button
                      type="button"
                      className="danger-button"
                      disabled={busyState.call}
                      onClick={() => endCall()}
                    >
                      End call
                    </button>
                  ) : null}
                </div>

                <div className="video-grid">
                  <div className="video-card">
                    <div className="video-meta">
                      <span>Local preview</span>
                      <strong>{activeCall ? "Captured from selected devices" : "Idle"}</strong>
                    </div>
                    <video ref={localVideoRef} className="video-frame" autoPlay muted playsInline />
                  </div>
                  <div className="video-card">
                    <div className="video-meta">
                      <span>Remote stream</span>
                      <strong>
                        {activeCall
                          ? "Rendered from remote tracks"
                          : "Waiting for a peer connection"}
                      </strong>
                    </div>
                    <video ref={remoteVideoRef} className="video-frame" autoPlay playsInline />
                  </div>
                </div>

                <div className="slider-grid">
                  <label>
                    <span>
                      Microphone gain
                      <strong>{micMuted ? " Muted" : ` ${Math.round(micVolume * 100)}%`}</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      value={micVolume}
                      onChange={(event) => setMicVolume(Number(event.target.value))}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setMicMuted((current) => !current)}
                  >
                    {micMuted ? "Unmute mic" : "Mute mic"}
                  </button>

                  <label>
                    <span>
                      Speaker volume
                      <strong>
                        {speakerMuted ? " Muted" : ` ${Math.round(speakerVolume * 100)}%`}
                      </strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={speakerVolume}
                      onChange={(event) => setSpeakerVolume(Number(event.target.value))}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSpeakerMuted((current) => !current)}
                  >
                    {speakerMuted ? "Unmute speaker" : "Mute speaker"}
                  </button>
                </div>
              </div>

              <div className="panel timeline-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Real-Time Technical Narrator</p>
                    <h3>What is happening behind the scenes right now?</h3>
                  </div>
                </div>

                <div className="timeline-list">
                  {timeline.map((entry) => (
                    <article key={entry.id} className="timeline-entry">
                      <div className="timeline-header">
                        <span className="timeline-channel">{entry.channel}</span>
                        <span className="timeline-time">{entry.timestamp}</span>
                      </div>
                      <h4>{entry.title}</h4>
                      <p>{entry.detail}</p>
                      <pre>
                        <code>{entry.code}</code>
                      </pre>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
